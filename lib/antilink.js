const { getAntilink } = require('./index');

const bots = new Map();

const LINK_PATTERNS = [
    // WhatsApp invites & contact links
    /(?:https?:\/\/)?chat\.whatsapp\.com\/[A-Za-z0-9]+/i,
    /(?:https?:\/\/)?wa\.me\/[A-Za-z0-9+?=&]+/i,
    /(?:https?:\/\/)?(?:api\.)?whatsapp\.com\/(?:send|channel)\/?[^\s]*/i,
    // Telegram
    /(?:https?:\/\/)?t\.me\/[A-Za-z0-9_+]+/i,
    /(?:https?:\/\/)?telegram\.(?:me|org|dog)\/[A-Za-z0-9_+]+/i,
    // Any explicit http/https link
    /https?:\/\/[^\s]{3,}/i,
    // Common URL shorteners (bare or with scheme)
    /(?:https?:\/\/)?(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|cutt\.ly|rebrand\.ly|short\.link|lnkd\.in|shorturl\.at|rb\.gy)\/\S+/i,
    // Bare-domain links (no scheme): something.tld/path  OR  www.something.tld
    /(?:^|\s)(?:www\.)[A-Za-z0-9-]+\.[A-Za-z]{2,}(?:\/\S*)?/i,
    /(?:^|\s)[A-Za-z0-9-]+\.(?:com|net|org|io|co|me|info|biz|app|dev|tv|gg|xyz|site|online|store|shop|live|news|club|to|cc|ru|uk|us|ng|ke|tz|ug|za|in|pk|fr|de|es|br|mx|ca|au|jp|cn|kr|tk|ml|ga|cf|link|media|page|pro|space|tech|world)(?:\/\S*)?/i,
];

function extractText(message) {
    const msg = message.message;
    if (!msg) return '';
    return (
        msg.conversation ||
        msg.extendedTextMessage?.text ||
        msg.imageMessage?.caption ||
        msg.videoMessage?.caption ||
        msg.documentMessage?.caption ||
        msg.documentWithCaptionMessage?.message?.documentMessage?.caption ||
        msg.buttonsResponseMessage?.selectedDisplayText ||
        msg.listResponseMessage?.title ||
        msg.templateButtonReplyMessage?.selectedDisplayText ||
        ''
    );
}

async function Antilink(message, sock, resolvedSenderId) {
    try {
        const chatId = message.key.remoteJid;
        const isGroup = chatId?.endsWith('@g.us');
        const isChannel = chatId?.endsWith('@newsletter');

        if (!isGroup && !isChannel) return;
        if (message.key.fromMe) return;

        const config = await getAntilink(chatId, 'on');
        if (!config || !config.enabled) return;

        const text = extractText(message);
        if (!text) return;

        const hasLink = LINK_PATTERNS.some(pattern => pattern.test(text));
        if (!hasLink) return;

        // ── Channel handling ──────────────────────────────────────────
        if (isChannel) {
            try {
                await sock.sendMessage(chatId, {
                    delete: {
                        remoteJid: chatId,
                        fromMe: false,
                        id: message.key.id,
                        participant: message.key.participant || chatId
                    }
                });
            } catch (e) {
                console.error('Antilink (channel): failed to delete message:', e.message);
            }
            return;
        }

        // ── Group handling ────────────────────────────────────────────
        // Use resolvedSenderId from main.js (already has @lid → @s.whatsapp.net resolved)
        // Fall back to raw participant only if not provided
        const rawParticipant = message.key.participant || message.key.remoteJid;
        const senderId = resolvedSenderId || rawParticipant;
        if (!senderId) return;

        const { isSudo } = require('./index');
        if (await isSudo(senderId)) return;

        const _getMeta = typeof sock.groupMetadataCached === 'function'
            ? sock.groupMetadataCached.bind(sock)
            : sock.groupMetadata.bind(sock);
        const groupMetadata = await _getMeta(chatId).catch(() => null);
        if (!groupMetadata) return;

        // Normalise both sides to bare number for comparison — handles @lid, :device suffix, etc.
        const senderNum = senderId.replace(/:\d+@/, '@').split('@')[0];
        const isAdmin = groupMetadata.participants?.some(p => {
            const pNum = (p.id || '').replace(/:\d+@/, '@').split('@')[0];
            return pNum === senderNum && (p.admin === 'admin' || p.admin === 'superadmin');
        });
        if (isAdmin) return;

        const action = config.action || 'delete';

        try {
            await sock.sendMessage(chatId, {
                delete: {
                    remoteJid: chatId,
                    fromMe: false,
                    id: message.key.id,
                    participant: senderId
                }
            });
        } catch (e) {
            console.error('Antilink: failed to delete message:', e.message);
        }

        if (action === 'warn') {
            await sock.sendMessage(chatId, {
                text: `⚠️ @${senderId.split('@')[0]}, links are not allowed in this group!`,
                mentions: [senderId]
            });
        }

        if (action === 'kick') {
            try {
                await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
                await sock.sendMessage(chatId, {
                    text: `🚫 @${senderId.split('@')[0]} has been removed for sharing links.`,
                    mentions: [senderId]
                });
            } catch (e) {
                console.error('Antilink: failed to kick user:', e.message);
            }
        }
    } catch (e) {
        console.error('Antilink error:', e.message);
    }
}

module.exports = { Antilink, bots };
