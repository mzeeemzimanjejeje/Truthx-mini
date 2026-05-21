/**
 * TRUTH MD Bot - A WhatsApp Bot
 * Autotyping Command - Shows fake typing status
 */

const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'data', 'autotyping.json');

let _configCache = null;

function initConfig() {
    if (_configCache) return _configCache;
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify({ enabled: false }, null, 2));
    }
    _configCache = JSON.parse(fs.readFileSync(configPath));
    return _configCache;
}

function _invalidateCache() { _configCache = null; }

async function autotypingCommand(sock, chatId, message) {
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
                    text: '❌ Invalid option! Use: .autotyping on/off'
                }, { quoted: message });
                return;
            }
        } else {
            config.enabled = !config.enabled;
        }

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        _invalidateCache();

        await sock.sendMessage(chatId, {
            text: `✅ Auto-typing has been ${config.enabled ? 'enabled' : 'disabled'}!`
        }, { quoted: message });

    } catch (error) {
        await sock.sendMessage(chatId, { text: '❌ Error processing command!' }, { quoted: message });
    }
}

function isAutotypingEnabled() {
    try {
        let getConfig;
        try { getConfig = require('../lib/configdb').getConfig; } catch (_) {}
        if (getConfig) {
            const val = getConfig('AUTOTYPING');
            if (val !== null && val !== undefined) return val === 'true';
        }
        const config = initConfig();
        return config.enabled;
    } catch (error) {
        return false;
    }
}

// Fire-and-forget — no blocking sleep. Just send composing stanza and return.
async function handleAutotypingForMessage(sock, chatId) {
    if (!isAutotypingEnabled()) return false;
    try {
        sock.sendPresenceUpdate('composing', chatId).catch(() => {});
        return true;
    } catch (_) { return false; }
}

// Fire-and-forget — no blocking sleep before command execution.
async function handleAutotypingForCommand(sock, chatId) {
    if (!isAutotypingEnabled()) return false;
    try {
        sock.sendPresenceUpdate('composing', chatId).catch(() => {});
        return true;
    } catch (_) { return false; }
}

// Fire-and-forget — shown after command completes, no blocking.
async function showTypingAfterCommand(sock, chatId) {
    if (!isAutotypingEnabled()) return false;
    try {
        sock.sendPresenceUpdate('paused', chatId).catch(() => {});
        return true;
    } catch (_) { return false; }
}

// Legacy aliases kept for any callers that may reference these
async function showTypingBeforeCommand(sock, chatId) {
    return handleAutotypingForCommand(sock, chatId);
}

async function stopTyping(sock, chatId) {
    try {
        sock.sendPresenceUpdate('paused', chatId).catch(() => {});
        return true;
    } catch (_) { return false; }
}

async function simulateTyping(sock, chatId) {
    return handleAutotypingForCommand(sock, chatId);
}

module.exports = {
    autotypingCommand,
    isAutotypingEnabled,
    handleAutotypingForMessage,
    handleAutotypingForCommand,
    showTypingAfterCommand,
    showTypingBeforeCommand,
    stopTyping,
    simulateTyping
};
