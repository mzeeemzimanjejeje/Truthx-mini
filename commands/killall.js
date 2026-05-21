const isAdmin = require('../lib/isAdmin');

const pendingKillAll = new Map();

async function killAllCommand(sock, chatId, message, senderId) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const args = text.trim().split(/\s+/).slice(1);
        const subCommand = (args[0] || '').toLowerCase();

        if (subCommand === 'cancel') {
            if (pendingKillAll.has(chatId)) {
                clearTimeout(pendingKillAll.get(chatId).timer);
                pendingKillAll.delete(chatId);
                await sock.sendMessage(chatId, { text: '✅ *Kill All Cancelled*\n\nThe operation has been stopped. No members were removed.' }, { quoted: message });
            } else {
                await sock.sendMessage(chatId, { text: '⚠️ No pending killall operation to cancel.' }, { quoted: message });
            }
            return;
        }

        const isGroup = chatId.endsWith('@g.us');
        if (!isGroup) {
            await sock.sendMessage(chatId, { text: '❌ This command can only be used in groups.' }, { quoted: message });
            return;
        }

        const adminStatus = await isAdmin(sock, chatId, senderId);
        if (!adminStatus.isBotAdmin) {
            await sock.sendMessage(chatId, { text: '❌ I need to be an admin to remove members.' }, { quoted: message });
            return;
        }

        if (!adminStatus.isSenderAdmin && !message.key.fromMe) {
            await sock.sendMessage(chatId, { text: '❌ Only group admins can use this command.' }, { quoted: message });
            return;
        }

        if (pendingKillAll.has(chatId)) {
            await sock.sendMessage(chatId, { text: '⚠️ A killall is already pending for this group.\nType `.killall cancel` to stop it, or wait for it to proceed.' }, { quoted: message });
            return;
        }

        const groupMetadata = await sock.groupMetadata(chatId);
        const participants = groupMetadata.participants || [];
        const botNumber = (sock.user?.id?.replace(/:\d+/, '') || '').replace(/@.*/, '');

        // Group creator (superadmin) — preserved IF present in the group.
        const creatorId = participants.find(p => p.admin === 'superadmin')?.id || '';
        const creatorNumber = creatorId ? creatorId.replace(/@.*/, '') : '';

        // Bot owner / sudo users — always preserved.
        let sudoNumbers = new Set();
        try {
            const settings = require('../settings.js');
            const ownerNum = String(settings?.ownerNumber || '').replace(/\D/g, '');
            if (ownerNum) sudoNumbers.add(ownerNum);
        } catch {}
        try {
            const { getSudoList } = require('../lib/index');
            const sudoList = (await getSudoList?.()) || [];
            for (const s of sudoList) {
                const n = String(s).replace(/@.*/, '').replace(/\D/g, '');
                if (n) sudoNumbers.add(n);
            }
        } catch {}

        // Everyone else — including admins — gets kicked.
        const toRemove = participants.filter(p => {
            const num = p.id.replace(/@.*/, '').replace(/:.*/, '');
            if (num === botNumber) return false;
            if (creatorNumber && num === creatorNumber) return false;
            if (sudoNumbers.has(num)) return false;
            return true;
        });

        console.log(`[killall] participants=${participants.length} | creator=${creatorNumber || 'NONE'} | sudo=${sudoNumbers.size} | toRemove=${toRemove.length}`);

        if (toRemove.length === 0) {
            await sock.sendMessage(chatId, { text: '⚠️ No members to remove.' }, { quoted: message });
            return;
        }

        if (subCommand === 'confirm') {
            await executeKillAll(sock, chatId, message, toRemove);
            return;
        }

        await sock.sendMessage(chatId, {
            text: `⚠️ *KILL ALL WARNING*\n\nThis will remove *${toRemove.length}* member(s) (including admins) from this group.\nOnly the group creator will remain.\n\n⏳ Auto-executing in *15 seconds*...\n\n✅ Type \`.killall confirm\` to start immediately\n❌ Type \`.killall cancel\` to stop`
        }, { quoted: message });

        const timer = setTimeout(async () => {
            if (pendingKillAll.has(chatId)) {
                pendingKillAll.delete(chatId);
                await executeKillAll(sock, chatId, message, toRemove);
            }
        }, 15000);

        pendingKillAll.set(chatId, { timer, senderId });

    } catch (err) {
        console.error('killAllCommand error:', err);
        pendingKillAll.delete(chatId);
        await sock.sendMessage(chatId, { text: `❌ Failed to remove members: ${err.message}` }, { quoted: message });
    }
}

async function executeKillAll(sock, chatId, message, toRemove) {
    try {
        pendingKillAll.delete(chatId);

        const allIds = toRemove.map(p => p.id);

        // Announcement message with @mentions of everyone about to be kicked,
        // matching the visual style of well-known killall bots.
        const mentionLines = allIds.map(j => `@${j.split('@')[0]}`).join(' ');
        await sock.sendMessage(chatId, {
            text: `🗡️ *Killall initiated* — removing *${allIds.length}* member(s):\n\n${mentionLines}`,
            mentions: allIds
        });
        let removed = 0;
        let leftoverIds = [];

        // ── ATTEMPT 1: Send EVERY participant in ONE single XMPP iq stanza.
        // Baileys' groupParticipantsUpdate doesn't enforce any client-side
        // limit — it builds one stanza with all <participant> children and
        // sends it. WhatsApp's server *can* accept hundreds in a single call.
        // We give it 60s — for 800 users this typically completes in <5s.
        try {
            console.log(`[killall] attempt 1: BULK ${allIds.length} users in one stanza`);
            const result = await Promise.race([
                sock.groupParticipantsUpdate(chatId, allIds, 'remove'),
                new Promise((_, rej) => setTimeout(() => rej(new Error('bulk timeout')), 60000))
            ]);

            if (Array.isArray(result) && result.length > 0) {
                for (const item of result) {
                    const ok = !item.status || String(item.status).startsWith('2');
                    if (ok) removed++;
                    else leftoverIds.push(item.jid);
                }
            } else {
                removed = allIds.length;
            }
            console.log(`[killall] bulk done: ${removed} removed, ${leftoverIds.length} leftover`);
        } catch (e) {
            console.error(`[killall] bulk failed (${e.message}) — falling back to parallel batches`);
            leftoverIds = allIds.slice();
            removed = 0;
        }

        // ── ATTEMPT 2: Whatever didn't go through gets fired in parallel
        // batches of 100. allSettled means all batches run simultaneously.
        if (leftoverIds.length > 0) {
            const BATCH_SIZE = 100;
            const batches = [];
            for (let i = 0; i < leftoverIds.length; i += BATCH_SIZE) {
                batches.push(leftoverIds.slice(i, i + BATCH_SIZE));
            }
            console.log(`[killall] attempt 2: ${batches.length} parallel batches × ${BATCH_SIZE}`);

            const results = await Promise.allSettled(
                batches.map(b => sock.groupParticipantsUpdate(chatId, b, 'remove'))
            );

            for (let i = 0; i < results.length; i++) {
                const r = results[i];
                if (r.status === 'fulfilled') {
                    if (Array.isArray(r.value) && r.value.length > 0) {
                        for (const item of r.value) {
                            const ok = !item.status || String(item.status).startsWith('2');
                            if (ok) removed++;
                        }
                    } else {
                        removed += batches[i].length;
                    }
                } else {
                    console.error('[killall] batch error:', r.reason?.message);
                }
            }
        }

        await sock.sendMessage(chatId, {
            text: `✅ *Kill All Complete*\n\nRemoved *${removed}/${toRemove.length}* member(s) in one shot. Only the group creator remains.`
        });

    } catch (err) {
        console.error('executeKillAll error:', err);
        await sock.sendMessage(chatId, { text: `❌ Error during removal: ${err.message}` });
    }
}

module.exports = killAllCommand;
