const fs = require('fs');
const path = require('path');
const { saveJson } = require('../lib/saveJson');

const ANTICALL_PATH = path.join(__dirname, '../data/anticall.json');

function readState() {
    try {
        if (!fs.existsSync(ANTICALL_PATH)) return { enabled: false, message: null };
        const raw = fs.readFileSync(ANTICALL_PATH, 'utf8');
        const data = JSON.parse(raw || '{}');
        return { enabled: !!data.enabled, message: data.message || null };
    } catch {
        return { enabled: false, message: null };
    }
}

function writeState(enabled) {
    try {
        if (!fs.existsSync(path.dirname(ANTICALL_PATH))) fs.mkdirSync(path.dirname(ANTICALL_PATH), { recursive: true });
        let existing = {};
        try { existing = JSON.parse(fs.readFileSync(ANTICALL_PATH, 'utf8') || '{}'); } catch {}
        saveJson(ANTICALL_PATH, { ...existing, enabled: !!enabled });
    } catch {}
}

function getAnticallMsg() {
    try {
        const data = JSON.parse(fs.readFileSync(ANTICALL_PATH, 'utf8') || '{}');
        if (data.message) return data.message;
    } catch {}
    try {
        const { getConfig } = require('../lib/configdb');
        return getConfig('ANTICALL_MESSAGE') || null;
    } catch {}
    return null;
}

async function setanticallmsgCommand(sock, chatId, message, userMessage, senderId) {
    const { isSudo } = require('../lib/index');
    const isOwner = message.key.fromMe || await isSudo(senderId);
    if (!isOwner) {
        return sock.sendMessage(chatId, { text: '❌ Only the bot owner can use this command.' }, { quoted: message });
    }
    const text = userMessage.replace(/^\.setanticallmsg\s*/i, '').trim();
    if (!text) {
        const current = getAnticallMsg();
        return sock.sendMessage(chatId, {
            text: `📩 *Anticall Message*\n\n_Current:_ ${current || '(default)'}\n\nUsage: *.setanticallmsg <your message>*\nExample: *.setanticallmsg I don't accept calls, please text me.*`
        }, { quoted: message });
    }
    try {
        let existing = {};
        try { existing = JSON.parse(fs.readFileSync(ANTICALL_PATH, 'utf8') || '{}'); } catch {}
        saveJson(ANTICALL_PATH, { ...existing, message: text });
        return sock.sendMessage(chatId, { text: `✅ Anticall message set to:\n_${text}_` }, { quoted: message });
    } catch (e) {
        return sock.sendMessage(chatId, { text: `❌ Failed to save: ${e.message}` }, { quoted: message });
    }
}

async function anticallCommand(sock, chatId, message, args, senderId) {
    const { isSudo } = require('../lib/index');
    const isOwner = message.key.fromMe || await isSudo(senderId);
    if (!isOwner) {
        await sock.sendMessage(chatId, { text: '❌ Only the bot owner can use this command.' }, { quoted: message });
        return;
    }
    const state = readState();
    const sub = (args || '').trim().toLowerCase();

    if (!sub || (sub !== 'on' && sub !== 'off' && sub !== 'status')) {
        await sock.sendMessage(chatId, { text: '*🏂 ANTICALL SETTING 🏂*\n\n 🔹.anticall on  - Enable auto-block on incoming calls\n 🔹.anticall off - Disable anticall\n 🔹.anticall status - Show current status' }, { quoted: message });
        return;
    }

    if (sub === 'status') {
        await sock.sendMessage(chatId, { text: `Anticall is currently *${state.enabled ? 'ON' : 'OFF'}*.` }, { quoted: message });
        return;
    }

    const enable = sub === 'on';
    writeState(enable);
    if (enable) {
        const msg = getAnticallMsg();
        const msgLine = msg ? `\n📩 *Message sent to callers:*\n_${msg}_` : `\n📩 *Message sent to callers:* (default)`;
        await sock.sendMessage(chatId, { text: `✅ Anticall is now *ENABLED*.${msgLine}\n\n_Use .setanticallmsg <text> to change the message._` }, { quoted: message });
    } else {
        await sock.sendMessage(chatId, { text: `✅ Anticall is now *DISABLED*.` }, { quoted: message });
    }
}

module.exports = { anticallCommand, setanticallmsgCommand, readState, getAnticallMsg };


