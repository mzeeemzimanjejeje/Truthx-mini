const isAdmin = require('../lib/isAdmin');

async function addCommand(sock, chatId, senderId, message, userMessage, senderIsSudo) {
    const isOwner = message.key.fromMe || senderIsSudo;

    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, {
            text: '❌ The add command can only be used in groups!'
        }, { quoted: message });
        return;
    }

    const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

    if (!isBotAdmin) {
        await sock.sendMessage(chatId, {
            text: '❌ I need to be a group admin to add members!'
        }, { quoted: message });
        return;
    }

    if (!isOwner && !isSenderAdmin) {
        await sock.sendMessage(chatId, {
            text: '❌ Only group admins can use the add command.'
        }, { quoted: message });
        return;
    }

    const cmdText = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const afterCmd = cmdText.trim().split(/\s+/).slice(1).join(' ');

    const phoneMatches = afterCmd.match(/\+?\d[\d\s\-]{6,}/g) || [];
    const usersToAdd = phoneMatches
        .map(n => n.replace(/[\s\-\+]/g, ''))
        .filter(n => n.length >= 7)
        .map(n => `${n}@s.whatsapp.net`);

    if (usersToAdd.length === 0) {
        await sock.sendMessage(chatId, {
            text: '❌ Please provide a phone number!\n\nUsage:\n• *.add 254743037984*\n• *.add +254743037984*\n• *.add 254743037984 255678901234* (multiple)'
        }, { quoted: message });
        return;
    }

    const results = { added: [], failed: [], alreadyIn: [] };

    for (const jid of usersToAdd) {
        const phone = jid.split('@')[0];

        try {
            const [check] = await sock.onWhatsApp(phone);
            if (!check?.exists) {
                results.failed.push({ jid, reason: 'Not registered on WhatsApp' });
                continue;
            }
            const resolvedJid = check.jid || jid;

            const res = await sock.groupParticipantsUpdate(chatId, [resolvedJid], 'add');
            const status = String(res?.[0]?.status ?? res?.status ?? '');

            if (status === '200') {
                results.added.push(resolvedJid);
            } else if (status === '207') {
                results.added.push(resolvedJid);
            } else if (status === '409') {
                results.alreadyIn.push(resolvedJid);
            } else if (status === '403') {
                results.failed.push({ jid: resolvedJid, reason: 'Privacy settings — user must join via invite link' });
            } else if (status === '408') {
                results.failed.push({ jid: resolvedJid, reason: 'Could not add — send them an invite link instead' });
            } else if (status === '401') {
                results.failed.push({ jid: resolvedJid, reason: 'User blocked group adds from non-contacts' });
            } else {
                results.failed.push({ jid: resolvedJid, reason: `Failed (code ${status || 'unknown'})` });
            }
        } catch (err) {
            const msg = (err.message || '').toLowerCase();
            let reason = err.message || 'Unknown error';
            if (msg.includes('not-authorized') || msg.includes('forbidden')) reason = 'Bot lacks permission';
            else if (msg.includes('not-on-whatsapp') || msg.includes('404')) reason = 'Not registered on WhatsApp';
            else if (msg.includes('privacy') || msg.includes('403')) reason = 'Privacy settings block adding';
            results.failed.push({ jid, reason });
        }
    }

    const lines = [];

    if (results.added.length > 0) {
        const nums = results.added.map(j => `@${j.split('@')[0]}`).join(', ');
        lines.push(`✅ Added: ${nums}`);
    }
    if (results.alreadyIn.length > 0) {
        const nums = results.alreadyIn.map(j => `@${j.split('@')[0]}`).join(', ');
        lines.push(`⚠️ Already in group: ${nums}`);
    }
    if (results.failed.length > 0) {
        for (const { jid, reason } of results.failed) {
            lines.push(`❌ @${jid.split('@')[0]}: ${reason}`);
        }
    }

    const allMentions = [...results.added, ...results.alreadyIn, ...results.failed.map(f => f.jid)];
    await sock.sendMessage(chatId, {
        text: lines.join('\n'),
        mentions: allMentions
    }, { quoted: message });
}

module.exports = addCommand;
