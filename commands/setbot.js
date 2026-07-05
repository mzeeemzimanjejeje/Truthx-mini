const { getBotName: getSessionBotName, setSessionSetting, deleteSessionSetting } = require('../lib/sessionSettings');

// Default bot name
const DEFAULT_BOT_NAME = 'TRUTH-MD';

/**
 * Get bot name EXACTLY as saved
 */
function getBotName(botJid) {
    return getSessionBotName(botJid);
}

/**
 * Store bot name EXACTLY as the user typed
 */
function setBotName(botJid, newBotName) {
    if (!newBotName || newBotName.length > 20) return false;
    return setSessionSetting(botJid, 'BOTNAME', newBotName);
}

/**
 * Reset bot name to default
 */
function resetBotName(botJid) {
    return deleteSessionSetting(botJid, 'BOTNAME');
}

/**
 * Extract the RAW user message without lowercase
 */
function extractRawText(message) {
    try {
        if (message.message?.conversation) return message.message.conversation;
        if (message.message?.extendedTextMessage?.text) return message.message.extendedTextMessage.text;
        if (message.message?.imageMessage?.caption) return message.message.imageMessage.caption;
        if (message.message?.videoMessage?.caption) return message.message.videoMessage.caption;
        return "";
    } catch {
        return "";
    }
}

// Create a fake contact for WhatsApp quoting
function createFakeContact(message) {
    const number = message.key.participant?.split('@')[0]
        || message.key.remoteJid.split('@')[0];

    return {
        key: {
            participants: "0@s.whatsapp.net",
            remoteJid: "status@broadcast",
            fromMe: false,
            id: "whatsapp"
        },
        message: {
            contactMessage: {
                vcard: `BEGIN:VCARD
VERSION:3.0
N:Sy;Bot;;;
FN:whatsapp
item1.TEL;waid=${number}:${number}
item1.X-ABLabel:Ponsel
END:VCARD`
            }
        },
        participant: "0@s.whatsapp.net"
    };
}

/**
 * Handle the setbotname command
 */
async function handleSetBotCommand(sock, chatId, senderId, message, userMessage, prefix) {
    const botJid = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : null;

    // 🔥 RAW MESSAGE (uppercase preserved even if handler lowercased)
    const RAW = extractRawText(message);

    // real arguments
    const args = RAW.split(" ").slice(1);
    const newBotName = args.join(" ");

    const fake = createFakeContact(message);

    const { isSudo } = require('../lib/index');
    const senderIsSudo = await isSudo(message.key.participant || message.key.remoteJid);
    if (!message.key.fromMe && !senderIsSudo) {
        await sock.sendMessage(chatId, {
            text: "❌ Only bot owner can change the bot name!"
        }, { quoted: fake });
        return;
    }

    // No new name
    if (!newBotName) {
        await sock.sendMessage(chatId, {
            text: `Use: ${prefix}setbotname <name>\nExample: ${prefix}setbotname TRUTH MD`
        }, { quoted: fake });
        return;
    }

    // Reset (case-insensitive)
    if (newBotName.toLowerCase() === "reset") {
        resetBotName(botJid);
        await sock.sendMessage(chatId, {
            text: `🔄 Bot name reset to default: *${DEFAULT_BOT_NAME}*`
        }, { quoted: fake });
        return;
    }

    // Name too long
    if (newBotName.length > 20) {
        await sock.sendMessage(chatId, {
            text: "❌ Bot name must be 1–20 characters!"
        }, { quoted: fake });
        return;
    }

    // SAVE EXACT formatting
    const ok = setBotName(botJid, newBotName);

    await sock.sendMessage(chatId, {
        text: ok
            ? `✅ Bot name updated to: *${newBotName}*`
            : "❌ Failed to set bot name!"
    }, { quoted: fake });
}

module.exports = {
    getBotName,
    setBotName,
    resetBotName,
    handleSetBotCommand
};
