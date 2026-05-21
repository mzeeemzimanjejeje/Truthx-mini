const { resolveToPhoneJid: libResolve } = require('../lib/index');

function bareNum(jid) {
    if (!jid) return null;
    return jid.split('@')[0].split(':')[0];
}

function isLidJid(jid) {
    return jid && (jid.includes('@lid') || bareNum(jid)?.length > 13);
}

function toPhoneJid(jid) {
    const num = bareNum(jid);
    if (!num || !/^\d+$/.test(num)) return null;
    return `${num}@s.whatsapp.net`;
}

// Extract contextInfo from any message type
function extractContextInfo(message) {
    const msg = message.message || {};
    return (
        msg.extendedTextMessage?.contextInfo ||
        msg.imageMessage?.contextInfo ||
        msg.videoMessage?.contextInfo ||
        msg.stickerMessage?.contextInfo ||
        msg.audioMessage?.contextInfo ||
        msg.documentMessage?.contextInfo ||
        msg.buttonsResponseMessage?.contextInfo ||
        msg.templateButtonReplyMessage?.contextInfo ||
        msg.listResponseMessage?.contextInfo ||
        msg.reactionMessage?.contextInfo ||
        msg.viewOnceMessage?.message?.imageMessage?.contextInfo ||
        msg.viewOnceMessage?.message?.videoMessage?.contextInfo ||
        null
    );
}

// Resolve any JID (phone or LID) to a blockable @s.whatsapp.net JID.
// Returns null if a valid phone JID cannot be obtained — callers must treat null as unresolvable.
async function resolveJid(sock, chatId, rawJid) {
    if (!rawJid) return null;

    // Group/broadcast JIDs are never blockable
    if (rawJid.endsWith('@g.us') || rawJid.endsWith('@broadcast')) return null;

    // Strip device suffix — WhatsApp MD JIDs can be "number:device@s.whatsapp.net"
    // updateBlockStatus only accepts bare "number@s.whatsapp.net"
    if (rawJid.endsWith('@s.whatsapp.net')) return toPhoneJid(rawJid);

    const rawNum = bareNum(rawJid);
    if (!rawNum || !/^\d+$/.test(rawNum)) return null;

    if (isLidJid(rawJid)) {
        // 1. Check lidmap / store contacts
        try {
            const fromMap = libResolve(rawJid);
            if (fromMap && fromMap.endsWith('@s.whatsapp.net')) return fromMap;
        } catch (_) {}

        // 2. Check group participant list — match by LID, take their phone JID
        if (chatId && chatId.endsWith('@g.us')) {
            try {
                const meta = await sock.groupMetadata(chatId);
                const byLid = (meta.participants || []).find(p =>
                    p.lid && bareNum(p.lid) === rawNum
                );
                if (byLid && byLid.id) return toPhoneJid(byLid.id);
            } catch (_) {}
        }

        // LID could not be resolved to a phone number — returning null causes a clear error
        // message instead of a WhatsApp "bad-request" crash.
        return null;
    }

    return `${rawNum}@s.whatsapp.net`;
}


async function getTargetJid(sock, chatId, message, userMessage, prefix) {
    const contextInfo = extractContextInfo(message);

    // 1. Group reply → block the quoted message sender (participant field is only set in groups)
    if (contextInfo?.participant) {
        const resolved = await resolveJid(sock, chatId, contextInfo.participant);
        if (resolved) return resolved;
    }

    // 2. @mention → block the mentioned user (works in both DMs and groups)
    if (contextInfo?.mentionedJid?.length) {
        const resolved = await resolveJid(sock, chatId, contextInfo.mentionedJid[0]);
        if (resolved) return resolved;
    }

    // 3. DM — participant is never set in private chats; the person to block IS the chat partner.
    //    Works whether or not the owner is replying — sending .block in someone's DM means block them.
    if (chatId && !chatId.endsWith('@g.us') && !chatId.endsWith('@broadcast')) {
        // Try resolving via the lidmap first (covers LID-only DM chats)
        const resolved = await resolveJid(sock, chatId, chatId);
        if (resolved) return resolved;
    }

    return null;
}

async function blockCommand(sock, chatId, message, senderIsSudo, userMessage, prefix) {
    try {
        if (!message.key.fromMe && !senderIsSudo) {
            return sock.sendMessage(chatId, { text: '❌ This command is only available for the owner!' }, { quoted: message });
        }

        const userToBlock = await getTargetJid(sock, chatId, message, userMessage, prefix);

        if (!userToBlock) {
            return sock.sendMessage(chatId, {
                text: '❌ Could not identify user to block!\n\nUsage:\n• Reply to their message with *.block*\n• Mention them: *.block @user*\n\n_If the user only shows as a LID/privacy number, ask them to message you first so WhatsApp can reveal their number._'
            }, { quoted: message });
        }

        // Final safety check — never send a non-phone JID to updateBlockStatus
        if (!userToBlock.endsWith('@s.whatsapp.net')) {
            return sock.sendMessage(chatId, {
                text: '❌ Cannot block this user — their phone number is hidden (LID privacy). Ask them to message you first, then try again.'
            }, { quoted: message });
        }

        const botNum = bareNum(sock.user?.id);
        if (botNum && bareNum(userToBlock) === botNum) {
            return sock.sendMessage(chatId, { text: '❌ You cannot block the bot itself!' }, { quoted: message });
        }

        await sock.updateBlockStatus(userToBlock, 'block');
        await sock.sendMessage(chatId, { text: `✅ Successfully blocked *${bareNum(userToBlock)}*!` }, { quoted: message });
        console.log(`[BLOCK] Blocked: ${userToBlock}`);
    } catch (error) {
        console.error('Error in blockCommand:', error);
        await sock.sendMessage(chatId, {
            text: `❌ Failed to block user!\n\nReason: ${error.message || 'Unknown error'}`
        }, { quoted: message }).catch(() => {});
    }
}

async function unblockCommand(sock, chatId, message, senderIsSudo, userMessage, prefix) {
    try {
        if (!message.key.fromMe && !senderIsSudo) {
            return sock.sendMessage(chatId, { text: '❌ This command is only available for the owner!' }, { quoted: message });
        }

        const userToUnblock = await getTargetJid(sock, chatId, message, userMessage, prefix);

        if (!userToUnblock) {
            return sock.sendMessage(chatId, {
                text: '❌ Could not identify user to unblock!\n\nUsage:\n• Reply to their message with *.unblock*\n• Mention them: *.unblock @user*'
            }, { quoted: message });
        }

        if (!userToUnblock.endsWith('@s.whatsapp.net')) {
            return sock.sendMessage(chatId, {
                text: '❌ Cannot unblock this user — their phone number is hidden (LID privacy).'
            }, { quoted: message });
        }

        await sock.updateBlockStatus(userToUnblock, 'unblock');
        await sock.sendMessage(chatId, { text: `✅ Successfully unblocked *${bareNum(userToUnblock)}*!` }, { quoted: message });
        console.log(`[BLOCK] Unblocked: ${userToUnblock}`);
    } catch (error) {
        console.error('Error in unblockCommand:', error);
        await sock.sendMessage(chatId, {
            text: `❌ Failed to unblock user!\n\nReason: ${error.message || 'Unknown error'}`
        }, { quoted: message }).catch(() => {});
    }
}

async function blocklistCommand(sock, chatId, message, senderIsSudo) {
    try {
        if (!message.key.fromMe && !senderIsSudo) {
            return sock.sendMessage(chatId, { text: '❌ This command is only available for the owner!' }, { quoted: message });
        }

        const blockedContacts = await sock.fetchBlocklist().catch(() => []);
        if (!blockedContacts.length) {
            return sock.sendMessage(chatId, { text: '📋 No blocked contacts found.' }, { quoted: message });
        }

        const totalBlocked = blockedContacts.length;
        const listText = blockedContacts.map(jid => `• ${bareNum(jid)}`).slice(0, 20).join('\n');
        let responseText = `📋 *Blocked Contacts:* ${totalBlocked}\n\n${listText}`;
        if (totalBlocked > 20) responseText += `\n\n... and ${totalBlocked - 20} more`;

        await sock.sendMessage(chatId, { text: responseText }, { quoted: message });
    } catch (error) {
        console.error('Error in blocklistCommand:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to fetch blocklist!' }, { quoted: message }).catch(() => {});
    }
}

async function unblockallCommand(sock, chatId, message, senderIsSudo) {
    try {
        if (!message.key.fromMe && !senderIsSudo) {
            return sock.sendMessage(chatId, { text: '❌ This command is only available for the owner!' }, { quoted: message });
        }

        const blockedContacts = await sock.fetchBlocklist().catch(() => []);
        if (!blockedContacts.length) {
            return sock.sendMessage(chatId, { text: '📋 No blocked contacts to unblock.' }, { quoted: message });
        }

        await sock.sendMessage(chatId, { text: `🔄 Unblocking ${blockedContacts.length} contacts...` }, { quoted: message });

        await Promise.all(
            blockedContacts.map(jid => sock.updateBlockStatus(jid, 'unblock').catch(() => null))
        );

        await sock.sendMessage(chatId, { text: `✅ Unblocked all ${blockedContacts.length} contacts!` }, { quoted: message });
    } catch (error) {
        console.error('Error in unblockallCommand:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to unblock contacts!' }, { quoted: message }).catch(() => {});
    }
}

module.exports = {
    blockCommand,
    unblockCommand,
    blocklistCommand,
    unblockallCommand
};
