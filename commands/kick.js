const isAdmin = require('../lib/isAdmin');

// Per-group kick history — keyed by groupJid, value is array of {jid, ts}
// Shared via global so kickrevert.js can read it without circular deps
if (!global._kickHistory) global._kickHistory = new Map();
const KICK_HISTORY_MAX = 50;   // max entries per group
const KICK_HISTORY_TTL = 24 * 60 * 60 * 1000; // 24 hours

function recordKick(groupJid, jid) {
    if (!global._kickHistory.has(groupJid)) global._kickHistory.set(groupJid, []);
    const list = global._kickHistory.get(groupJid);
    // avoid duplicates — remove old entry for this jid first
    const idx = list.findIndex(e => e.jid === jid);
    if (idx !== -1) list.splice(idx, 1);
    list.push({ jid, ts: Date.now() });
    // trim to max
    if (list.length > KICK_HISTORY_MAX) list.splice(0, list.length - KICK_HISTORY_MAX);
    // purge expired
    const cutoff = Date.now() - KICK_HISTORY_TTL;
    global._kickHistory.set(groupJid, list.filter(e => e.ts >= cutoff));
}

function bareNum(jid) {
    if (!jid) return null;
    return jid.split('@')[0].split(':')[0];
}

function toPhoneJid(jid) {
    const num = bareNum(jid);
    if (!num || !/^\d+$/.test(num)) return null;
    return `${num}@s.whatsapp.net`;
}

function isLikeLid(num) {
    return num && num.length > 13;
}

async function resolveToPhoneJids(sock, chatId, rawJids) {
    let participants = [];
    try {
        const meta = await sock.groupMetadata(chatId);
        participants = meta.participants || [];
    } catch (_) {}

    const resolved = [];

    for (const raw of rawJids) {
        const rawNum = bareNum(raw);
        if (!rawNum || !/^\d+$/.test(rawNum)) continue;

        const isLid = isLikeLid(rawNum) || raw.includes('@lid');

        if (isLid) {
            const byLid = participants.find(p => {
                const pLidNum = p.lid ? bareNum(p.lid) : null;
                return pLidNum === rawNum;
            });
            if (byLid) {
                resolved.push(byLid.id);
                continue;
            }

            const byId = participants.find(p => bareNum(p.id) === rawNum);
            if (byId) {
                resolved.push(byId.id);
                continue;
            }

            const rawDomain = raw.includes('@') ? raw : `${rawNum}@s.whatsapp.net`;
            console.log(`[KICK] LID ${rawNum} not in metadata — trying raw JID: ${rawDomain}`);
            resolved.push(rawDomain);
        } else {
            const match = participants.find(p => bareNum(p.id) === rawNum);
            resolved.push(match ? match.id : toPhoneJid(raw));
        }
    }

    return resolved;
}

async function kickCommand(sock, chatId, senderId, mentionedJids, message, senderIsSudo) {
    const isOwner = message.key.fromMe || senderIsSudo;

    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, {
            text: '❌ The kick command can only be used in groups!'
        }, { quoted: message });
        return;
    }

    const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

    if (!isBotAdmin) {
        await sock.sendMessage(chatId, {
            text: '❌ I need to be a group admin to kick members!'
        }, { quoted: message });
        return;
    }

    if (!isOwner && !isSenderAdmin) {
        await sock.sendMessage(chatId, {
            text: '❌ Only group admins can use the kick command.'
        }, { quoted: message });
        return;
    }

    let rawTargets = [];

    if (mentionedJids && mentionedJids.length > 0) {
        rawTargets = mentionedJids;
    } else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
        rawTargets = [message.message.extendedTextMessage.contextInfo.participant];
    } else {
        const cmdText = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const afterCmd = cmdText.trim().split(/\s+/).slice(1).join(' ');
        const phoneMatches = afterCmd.match(/\+?\d[\d\s\-]{6,}/g) || [];
        rawTargets = phoneMatches
            .map(n => n.replace(/[\s\-\+]/g, ''))
            .filter(n => n.length >= 7 && n.length <= 15)
            .map(n => `${n}@s.whatsapp.net`);
    }

    if (rawTargets.length === 0) {
        await sock.sendMessage(chatId, {
            text: '❌ Please mention or reply to the member you want to kick.\n\n📌 Usage: .kick @user\n💡 To kick everyone use .killall'
        }, { quoted: message });
        return;
    }

    let usersToKick = await resolveToPhoneJids(sock, chatId, rawTargets);

    const botNum = bareNum(sock.user.id);
    usersToKick = usersToKick.filter(j => bareNum(j) !== botNum);
    if (usersToKick.length === 0) {
        await sock.sendMessage(chatId, { text: "❌ I can't kick myself!" }, { quoted: message });
        return;
    }

    let groupAdmins = [];
    try {
        const meta = await sock.groupMetadata(chatId);
        groupAdmins = (meta.participants || []).filter(p => p.admin).map(p => bareNum(p.id));
    } catch (_) {}

    const adminTargets = usersToKick.filter(j => groupAdmins.includes(bareNum(j)));
    usersToKick = usersToKick.filter(j => !groupAdmins.includes(bareNum(j)));

    if (adminTargets.length > 0) {
        const adminNums = adminTargets.map(j => `@${bareNum(j)}`).join(', ');
        await sock.sendMessage(chatId, {
            text: `⚠️ Cannot kick admin(s): ${adminNums}`,
            mentions: adminTargets
        }, { quoted: message });
    }

    if (usersToKick.length === 0) return;

    const kicked = [];
    const failed = [];

    for (const jid of usersToKick) {
        try {
            const res = await sock.groupParticipantsUpdate(chatId, [jid], 'remove');
            const status = String(res?.[0]?.status ?? res?.status ?? '200');
            if (status === '200' || status === '207') {
                kicked.push(jid);
                recordKick(chatId, jid);
            } else if (status === '409') {
                failed.push({ jid, reason: 'Not in group' });
            } else if (status === '403') {
                failed.push({ jid, reason: 'Permission denied' });
            } else {
                failed.push({ jid, reason: `Error ${status}` });
            }
        } catch (err) {
            const msg = (err.message || '').toLowerCase();
            let reason = err.message || 'Unknown error';
            if (msg.includes('not-authorized') || msg.includes('forbidden')) reason = 'Bot lacks permission';
            else if (msg.includes('not-participant')) reason = 'User not in group';
            else if (msg.includes('bad-request')) reason = 'Already removed';
            failed.push({ jid, reason });
        }
    }

    const lines = [];
    if (kicked.length > 0) {
        const names = kicked.map(j => `@${bareNum(j)}`).join(', ');
        lines.push(`✅ Kicked: ${names}`);
    }
    if (failed.length > 0) {
        for (const { jid, reason } of failed) {
            lines.push(`❌ @${bareNum(jid)}: ${reason}`);
        }
    }

    if (lines.length > 0) {
        const allMentions = [...kicked, ...failed.map(f => f.jid)];
        await sock.sendMessage(chatId, {
            text: lines.join('\n'),
            mentions: allMentions
        }, { quoted: message });
    }
}

module.exports = kickCommand;
