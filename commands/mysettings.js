/**
 * mysettings.js
 * Let each user view and reset their own personal settings stored in the
 * PostgreSQL-backed database.
 *
 * Commands:
 *   .mysettings          — show all your stored personal settings
 *   .mysettings reset    — delete all your personal settings from the DB
 *   .mysettings <key>    — show a specific setting value
 */

'use strict';

const { getAllUserSettings, deleteAllUserSettings, getUserSetting } = require('../lib/pgUserSettings');
const { isOwner, isSudo }  = (() => {
    try { return require('../lib/ownerHelpers'); } catch (_) {
        return { isOwner: () => false, isSudo: () => false };
    }
})();

async function mysettingsCommand(sock, chatId, message, args, senderJid) {
    const sender = senderJid || message?.key?.participant || message?.key?.remoteJid || '';
    const sub    = (args?.[0] || '').toLowerCase().trim();

    if (sub === 'reset') {
        deleteAllUserSettings(sender);
        await sock.sendMessage(chatId, {
            text: '✅ *Your personal settings have been reset.*\n\n_All your stored preferences have been removed from the database. They will reset to defaults._'
        }, { quoted: message });
        return;
    }

    const settings = getAllUserSettings(sender);
    // Remove internal keys
    delete settings._updated;

    if (sub && sub !== 'show') {
        // Show a single key
        const val = getUserSetting(sender, sub);
        if (val === null) {
            await sock.sendMessage(chatId, {
                text: `❌ No setting found for key: *${sub}*`
            }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, {
                text: `🔑 *${sub}*\n\`\`\`${typeof val === 'object' ? JSON.stringify(val, null, 2) : val}\`\`\``
            }, { quoted: message });
        }
        return;
    }

    const keys = Object.keys(settings).filter(k => !k.startsWith('_'));

    if (keys.length === 0) {
        await sock.sendMessage(chatId, {
            text: '📋 *Your Personal Settings*\n\n_No personal settings stored for your account yet._\n\n_Your preferences (language, AI persona, etc.) are saved here automatically when you use bot features._'
        }, { quoted: message });
        return;
    }

    const lines = keys.map(k => {
        const v = settings[k];
        const display = typeof v === 'object' ? JSON.stringify(v) : String(v);
        const truncated = display.length > 60 ? display.slice(0, 57) + '...' : display;
        return `• *${k}*: \`${truncated}\``;
    });

    const text = [
        '📋 *Your Personal Settings*',
        `_Stored in PostgreSQL — survives bot restarts and updates_\n`,
        ...lines,
        '',
        `_Total: ${keys.length} setting(s)_`,
        '_Reply *.mysettings reset* to clear all your settings._'
    ].join('\n');

    await sock.sendMessage(chatId, { text }, { quoted: message });
}

module.exports = { mysettingsCommand };
