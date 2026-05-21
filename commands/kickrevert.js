const isAdmin = require('../lib/isAdmin');

function bareNum(jid) {
    if (!jid) return null;
    return jid.split('@')[0].split(':')[0];
}

async function kickRevertCommand(sock, chatId, senderId, message, userMessage, senderIsSudo) {
    const isOwner = message.key.fromMe || senderIsSudo;

    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, {
            text: '❌ This command can only be used in groups!'
        }, { quoted: message });
        return;
    }

    const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

    if (!isBotAdmin) {
        await sock.sendMessage(chatId, {
            text: '❌ I need to be a group admin to add members back!'
        }, { quoted: message });
        return;
    }

    if (!isOwner && !isSenderAdmin) {
        await sock.sendMessage(chatId, {
            text: '❌ Only group admins can use this command.'
        }, { quoted: message });
        return;
    }

    // Parse optional count argument — .kickrevert 3 re-adds last 3 kicked
    const parts = userMessage.trim().split(/\s+/);
    const countArg = parts[1] ? parseInt(parts[1], 10) : NaN;
    const limit = (!isNaN(countArg) && countArg > 0) ? Math.min(countArg, 50) : null;

    const KICK_HISTORY_TTL = 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - KICK_HISTORY_TTL;

    if (!global._kickHistory || !global._kickHistory.has(chatId)) {
        await sock.sendMessage(chatId, {
            text: '❌ No kick history found for this group.\n\n_The bot only tracks members kicked after it last started._'
        }, { quoted: message });
        return;
    }

    // Get history for this group — newest first, within TTL
    let history = (global._kickHistory.get(chatId) || [])
        .filter(e => e.ts >= cutoff)
        .slice()
        .reverse(); // most recently kicked first

    if (history.length === 0) {
        await sock.sendMessage(chatId, {
            text: '❌ No recently kicked members found (history expires after 24 hours).'
        }, { quoted: message });
        return;
    }

    // Apply limit if specified
    if (limit !== null) history = history.slice(0, limit);

    // Filter out anyone already back in the group
    let currentMembers = new Set();
    try {
        const meta = await sock.groupMetadata(chatId);
        for (const p of (meta.participants || [])) {
            currentMembers.add(bareNum(p.id));
        }
    } catch (_) {}

    const toReadd = history.filter(e => !currentMembers.has(bareNum(e.jid)));

    if (toReadd.length === 0) {
        await sock.sendMessage(chatId, {
            text: '⚠️ All recently kicked members are already back in the group!'
        }, { quoted: message });
        return;
    }

    await sock.sendMessage(chatId, {
        text: `⏳ Re-adding ${toReadd.length} member(s)...`
    }, { quoted: message });

    const results = { added: [], failed: [] };

    for (const { jid } of toReadd) {
        const phone = bareNum(jid);
        try {
            // Verify still on WhatsApp
            const [check] = await sock.onWhatsApp(phone).catch(() => [null]);
            if (!check?.exists) {
                results.failed.push({ jid, reason: 'No longer on WhatsApp' });
                continue;
            }
            const resolvedJid = check.jid || jid;
            const res = await sock.groupParticipantsUpdate(chatId, [resolvedJid], 'add');
            const status = String(res?.[0]?.status ?? res?.status ?? '');

            if (status === '200' || status === '207') {
                results.added.push(resolvedJid);
                // Remove from history so they won't be re-added again accidentally
                const list = global._kickHistory.get(chatId) || [];
                const idx = list.findIndex(e => e.jid === jid);
                if (idx !== -1) list.splice(idx, 1);
            } else if (status === '409') {
                results.added.push(resolvedJid); // already in group
            } else if (status === '403') {
                results.failed.push({ jid, reason: 'Privacy settings — send them an invite link' });
            } else if (status === '408') {
                results.failed.push({ jid, reason: 'Could not add — try sending an invite link' });
            } else if (status === '401') {
                results.failed.push({ jid, reason: 'User blocked group adds from non-contacts' });
            } else {
                results.failed.push({ jid, reason: `Failed (code ${status || 'unknown'})` });
            }
        } catch (err) {
            const msg = (err.message || '').toLowerCase();
            let reason = err.message || 'Unknown error';
            if (msg.includes('not-authorized') || msg.includes('forbidden')) reason = 'Bot lacks permission';
            else if (msg.includes('not-on-whatsapp') || msg.includes('404')) reason = 'Not on WhatsApp';
            else if (msg.includes('privacy') || msg.includes('403')) reason = 'Privacy settings block adding';
            results.failed.push({ jid, reason });
        }
    }

    const lines = [];
    if (results.added.length > 0) {
        const names = results.added.map(j => `@${bareNum(j)}`).join(', ');
        lines.push(`✅ Re-added (${results.added.length}): ${names}`);
    }
    if (results.failed.length > 0) {
        for (const { jid, reason } of results.failed) {
            lines.push(`❌ @${bareNum(jid)}: ${reason}`);
        }
    }

    const allMentions = [...results.added, ...results.failed.map(f => f.jid)];
    await sock.sendMessage(chatId, {
        text: lines.join('\n'),
        mentions: allMentions
    }, { quoted: message });
}

module.exports = kickRevertCommand;
