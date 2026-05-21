/**
 * TRUTH MD Bot - A WhatsApp Bot
 * Auto-recording Command - Shows fake recording status
 */

const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'data', 'autorecording.json');

function initConfig() {
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify({ enabled: false }, null, 2));
    }
    return JSON.parse(fs.readFileSync(configPath));
}

async function autorecordingCommand(sock, chatId, message) {
    try {
        const { isSudo } = require('../lib/index');
        const senderId = message.key.participant || message.key.remoteJid;
        const senderIsSudo = await isSudo(senderId);
        const isOwner = message.key.fromMe || senderIsSudo;

        if (!isOwner) {
            await sock.sendMessage(chatId, {
                text: '❌ This command is only available for the owner!'
            }, { quoted: message });
            return;
        }

        const args = message.message?.conversation?.trim().split(' ').slice(1) ||
                    message.message?.extendedTextMessage?.text?.trim().split(' ').slice(1) || [];

        const config = initConfig();

        if (args.length > 0) {
            const action = args[0].toLowerCase();
            if (action === 'on' || action === 'enable') {
                config.enabled = true;
            } else if (action === 'off' || action === 'disable') {
                config.enabled = false;
            } else {
                await sock.sendMessage(chatId, {
                    text: '❌ Invalid option! Use: .autorecording on/off'
                }, { quoted: message });
                return;
            }
        } else {
            config.enabled = !config.enabled;
        }

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        await sock.sendMessage(chatId, {
            text: `✅ Auto-recording has been ${config.enabled ? 'enabled' : 'disabled'}!`
        }, { quoted: message });

    } catch (error) {
        console.error('Error in autorecording command:', error);
        await sock.sendMessage(chatId, { text: '❌ Error processing command!' }, { quoted: message });
    }
}

function isAutorecordingEnabled() {
    try {
        let getConfig;
        try { getConfig = require('../lib/configdb').getConfig; } catch (_) {}
        if (getConfig) {
            const val = getConfig('AUTORECORDING');
            if (val !== null && val !== undefined) return val === 'true';
        }
        const config = initConfig();
        return config.enabled;
    } catch (error) {
        return false;
    }
}

// Fire-and-forget — no blocking sleeps. Just send the stanza and return.
async function handleAutorecordingForMessage(sock, chatId) {
    if (!isAutorecordingEnabled()) return false;
    try {
        sock.sendPresenceUpdate('recording', chatId).catch(() => {});
        return true;
    } catch (_) { return false; }
}

// Fire-and-forget — no blocking sleeps before command execution.
async function handleAutorecordingForCommand(sock, chatId) {
    if (!isAutorecordingEnabled()) return false;
    try {
        sock.sendPresenceUpdate('recording', chatId).catch(() => {});
        return true;
    } catch (_) { return false; }
}

// Fire-and-forget — shown after command completes, no blocking.
async function showRecordingAfterCommand(sock, chatId) {
    if (!isAutorecordingEnabled()) return false;
    try {
        sock.sendPresenceUpdate('paused', chatId).catch(() => {});
        return true;
    } catch (_) { return false; }
}

module.exports = {
    autorecordingCommand,
    isAutorecordingEnabled,
    handleAutorecordingForMessage,
    handleAutorecordingForCommand,
    showRecordingAfterCommand
};
