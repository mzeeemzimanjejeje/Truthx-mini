const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'antigroupmention.json');

function loadSettings() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (e) {}
    return {};
}

function saveSettings(data) {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getAntiGroupMentionStatus(chatId) {
    const data = loadSettings();
    return data[chatId] || { enabled: false, action: 'delete' };
}

async function handleAntiGroupMentionCommand(sock, chatId, message, senderId) {
    try {
        const isGroup = chatId.endsWith('@g.us');
        if (!isGroup) {
            await sock.sendMessage(chatId, { text: '❌ This command can only be used in groups.' }, { quoted: message });
            return;
        }

        const { isSudo } = require('../lib/index');
        if (!message.key.fromMe && !await isSudo(senderId)) {
            await sock.sendMessage(chatId, { text: '❌ Only the bot owner or sudo can use this command.' }, { quoted: message });
            return;
        }

        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const args = text.trim().split(/\s+/).slice(1);
        const action = (args[0] || '').toLowerCase();

        const data = loadSettings();
        const current = data[chatId] || { enabled: false, action: 'delete' };

        if (!action) {
            const status = current.enabled ? 'ON' : 'OFF';
            await sock.sendMessage(chatId, {
                text: `📢 *Anti-Group-Mention Settings*\n\n• Status: *${status}*\n• Action: *${current.action}*\n\n*Usage:*\n.antigroupmention on\n.antigroupmention off\n.antigroupmention set delete | kick | warn`
            }, { quoted: message });
            return;
        }

        switch (action) {
            case 'on':
                data[chatId] = { enabled: true, action: current.action || 'delete' };
                saveSettings(data);
                await sock.sendMessage(chatId, { text: '✅ *Anti-Group-Mention has been turned ON*\n\nGroup mentions (@everyone, @tagall) will be handled.' }, { quoted: message });
                break;

            case 'off':
                data[chatId] = { enabled: false, action: current.action || 'delete' };
                saveSettings(data);
                await sock.sendMessage(chatId, { text: '✅ *Anti-Group-Mention has been turned OFF*' }, { quoted: message });
                break;

            case 'set':
                const setAction = (args[1] || '').toLowerCase();
                if (!['delete', 'kick', 'warn'].includes(setAction)) {
                    await sock.sendMessage(chatId, { text: '❌ Invalid action. Choose: delete, kick, or warn' }, { quoted: message });
                    return;
                }
                data[chatId] = { enabled: current.enabled, action: setAction };
                saveSettings(data);
                await sock.sendMessage(chatId, { text: `✅ *Anti-Group-Mention action set to ${setAction}*` }, { quoted: message });
                break;

            default:
                await sock.sendMessage(chatId, { text: '❌ Unknown option. Use: on, off, or set delete|kick|warn' }, { quoted: message });
        }
    } catch (err) {
        console.error('antiGroupMentionCommand error:', err.message);
        await sock.sendMessage(chatId, { text: `❌ Error: ${err.message}` }, { quoted: message });
    }
}

async function handleGroupMentionDetection(sock, chatId, message, senderId) {
    try {
        if (!chatId.endsWith('@g.us')) return;

        const settings = getAntiGroupMentionStatus(chatId);
        if (!settings.enabled) return;

        const text = message.message?.conversation || 
                     message.message?.extendedTextMessage?.text || 
                     message.message?.imageMessage?.caption || 
                     message.message?.videoMessage?.caption || '';

        // Check WhatsApp native group mention (contextInfo.groupMentions array — the real @mention feature)
        const nativeGroupMentions = message.message?.extendedTextMessage?.contextInfo?.groupMentions ||
                                    message.message?.imageMessage?.contextInfo?.groupMentions ||
                                    message.message?.videoMessage?.contextInfo?.groupMentions || [];

        // Also check text-based patterns as fallback
        const textPatterns = ['@everyone', '@tagall', '@all'];
        const hasTextMention = textPatterns.some(m => text.toLowerCase().includes(m));

        const hasGroupMention = nativeGroupMentions.length > 0 || hasTextMention;
        if (!hasGroupMention) return;

        if (message.key.fromMe) return;
        const { isSudo } = require('../lib/index');
        if (await isSudo(senderId)) return;

        const action = settings.action || 'delete';
        const mention = senderId.split('@')[0];

        // Act immediately — delete first, no delay
        try {
            await sock.sendMessage(chatId, {
                delete: { remoteJid: chatId, fromMe: false, id: message.key.id, participant: message.key.participant || senderId }
            });
        } catch (_) {}

        if (action === 'kick') {
            await sock.sendMessage(chatId, {
                text: `🚫 @${mention} has been removed for using a group mention.`,
                mentions: [senderId]
            });
            try {
                await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
            } catch (e) {
                console.error('Failed to kick for antigroupmention:', e.message);
            }
        } else if (action === 'warn') {
            await sock.sendMessage(chatId, {
                text: `⚠️ @${mention}, group mentions (@everyone, @tagall) are not allowed!`,
                mentions: [senderId]
            });
        } else {
            await sock.sendMessage(chatId, {
                text: `🚫 @${mention}, group mentions are not allowed here!`,
                mentions: [senderId]
            });
        }
    } catch (err) {
        console.error('groupMentionDetection error:', err.message);
    }
}

module.exports = { handleAntiGroupMentionCommand, handleGroupMentionDetection, getAntiGroupMentionStatus };
