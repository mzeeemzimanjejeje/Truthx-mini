const fs = require('fs');
const path = require('path');
const { getConfig } = require('../lib/configdb');
const { getPrefix } = require('./setprefix');
const { getOwnerName } = require('./setowner');
const { getBotName } = require('./setbot');
const { getOwnerNumber } = require('./setownernumber');
const { getSetting } = require('../lib/chatbot.db');
const { getCurrentFont } = require('./autofont');
const { isAutolikeEnabled } = require('./autolike');
const { isAutoviewEnabled } = require('./autoview');
const { getWatermarkText } = require('../lib/watermark');

const DATA_DIR = path.join(__dirname, '..', 'data');

let userSettingsJson;
try {
    userSettingsJson = require('../lib/userSettingsJson');
} catch (e) {}

function readJsonSafe(filePath, fallback) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
        return fallback;
    }
}

// Read a boolean setting from config.db (the single source of truth for toggle commands)
function cfgBool(key, fallback = 'OFF') {
    const val = getConfig(key);
    if (val === 'true') return 'ON';
    if (val === 'false') return 'OFF';
    return fallback;
}

async function settingsCommand(sock, chatId, message, senderIsSudo) {
    try {
        const settings = require('../settings');
        const prefix = getPrefix();
        const currentMode = getConfig('MODE') || settings.commandMode || 'public';
        const senderJid = message.key.participant || message.key.remoteJid || '';

        // JSON-backed settings — always read from their actual files
        const autoStatus = readJsonSafe(path.join(DATA_DIR, 'autoStatus.json'), { enabled: false, reactOn: false });
        const anticall   = readJsonSafe(path.join(DATA_DIR, 'anticall.json'),   { enabled: false });
        const autoread   = readJsonSafe(path.join(DATA_DIR, 'autoread.json'),   { enabled: false });
        const antiedit   = readJsonSafe(path.join(DATA_DIR, 'antiedit.json'),   { enabled: false });
        const antidelete = readJsonSafe(path.join(DATA_DIR, 'antidelete.json'), { enabled: false });

        let chatbotEnabled = 'OFF';
        let chatbotMode = 'group';
        try {
            chatbotEnabled = (await getSetting('chatbot_enabled')) === 'true' ? 'ON' : 'OFF';
            chatbotMode = (await getSetting('chatbot_mode')) || 'group';
        } catch {}

        const fontStyle = getCurrentFont();
        const autolike  = isAutolikeEnabled() ? 'ON' : 'OFF';
        const autoview  = isAutoviewEnabled() ? 'ON' : 'OFF';

        const statusEmojis = autoStatus.customEmojis || ['🧡','💚','🔥','✨','❤️','🥰','😎'];

        const watermark   = (() => { try { return getWatermarkText() || '(not set)'; } catch { return getConfig('WATERMARK') || '(not set)'; } })();
        const stAuthor    = getConfig('STICKER_AUTHOR') || settings.author || '(not set)';
        const stPack      = getConfig('STICKER_PACK')   || settings.packname || '(not set)';
        const timezone    = getConfig('TIMEZONE')       || 'UTC';
        const contextLink = getConfig('CONTEXTLINK')    || getConfig('CONTEXT_LINK') || '(not set)';
        const menuImage   = getConfig('BOTIMAGE')       || getConfig('MENUIMAGE')    || null;
        const anticallMsg = anticall.message || getConfig('ANTICALL_MESSAGE') || '(default)';
        const warnLimit   = getConfig('WARN_LIMIT')     || getConfig('WARNLIMIT')    || '3';

        const lines = [];
        lines.push('⚙️ *Current Bot Settings:*');
        lines.push('');
        lines.push(`❇️ *prefix*: ${prefix}`);
        lines.push(`❇️ *mode*: ${currentMode}`);

        // configdb-stored toggle settings (written by toggleSettingCommand / setConfig)
        lines.push(`❇️ *autobio*: ${cfgBool('AUTOBIO')}`);
        lines.push(`❇️ *anticall*: ${anticall.enabled ? 'ON' : 'OFF'}`);
        lines.push(`❇️ *chatbot*: ${chatbotEnabled}`);
        lines.push(`❇️ *antibug*: ${cfgBool('ANTIBUG')}`);
        lines.push(`❇️ *autotype*: ${cfgBool('AUTOTYPING')}`);
        lines.push(`❇️ *autoread*: ${autoread.enabled ? 'ON' : 'OFF'}`);
        lines.push(`❇️ *autofont*: ${fontStyle === 'off' || fontStyle === 'false' ? 'OFF' : fontStyle}`);
        lines.push(`❇️ *antiedit*: ${antiedit.enabled ? 'ON' : 'OFF'}`);
        lines.push(`❇️ *menustyle*: ${getConfig('MENUSTYLE') || '5'}`);
        lines.push(`❇️ *autoreact*: ${cfgBool('AUTOREACT')}`);
        lines.push(`❇️ *autoblock*: ${cfgBool('AUTOBLOCK')}`);
        lines.push(`❇️ *autorecord*: ${cfgBool('AUTORECORDING')}`);
        lines.push(`❇️ *antidelete*: ${antidelete.enabled ? 'ON' : 'OFF'}`);
        lines.push(`❇️ *alwaysonline*: ${cfgBool('ALWAYSONLINE')}`);
        lines.push(`❇️ *autoviewstatus*: ${autoStatus.enabled ? 'ON' : 'OFF'}`);
        lines.push(`❇️ *autoreactstatus*: ${autoStatus.reactOn ? 'ON' : 'OFF'}`);
        lines.push(`❇️ *autorecordtype*: ${getConfig('AUTORECORDTYPE') || 'OFF'}`);
        lines.push(`❇️ *statusantidelete*: ${cfgBool('STATUSANTIDELETE')}`);
        lines.push(`❇️ *antiviewonce*: ${cfgBool('ANTIVIEWONCE')}`);
        lines.push(`❇️ *autosavestatus*: ${cfgBool('AUTOSAVESTATUS')}`);
        lines.push(`❇️ *chatbotMode*: ${chatbotMode}`);
        lines.push(`❇️ *antisticker*: per-group`);
        lines.push(`❇️ *autolike*: ${autolike}`);
        lines.push(`❇️ *autoview*: ${autoview}`);
        lines.push('');
        lines.push(`❇️ *botname*: ${getBotName()}`);
        lines.push(`❇️ *ownername*: ${getOwnerName()}`);
        lines.push(`❇️ *ownernumber*: ${getOwnerNumber().split('@')[0]}`);
        lines.push(`❇️ *statusemoji*: ${statusEmojis.join(',')}`);
        lines.push(`❇️ *watermark*: ${watermark}`);
        lines.push(`❇️ *author*: ${stAuthor}`);
        lines.push(`❇️ *packname*: ${stPack}`);
        lines.push(`❇️ *timezone*: ${timezone}`);
        lines.push(`❇️ *contextlink*: ${contextLink}`);
        lines.push(`❇️ *menuimage*: ${menuImage || '(not set)'}`);
        lines.push(`❇️ *anticallmsg*: ${anticallMsg}`);
        lines.push(`❇️ *warnLimit*: ${warnLimit}`);

        // Per-user personal settings from database/usersettings.json
        if (userSettingsJson && senderJid) {
            const personal = userSettingsJson.getUserSettings(senderJid);
            const personalKeys = Object.keys(personal).filter(k => k !== '_updated');
            if (personalKeys.length > 0) {
                lines.push('');
                lines.push('👤 *Your Personal Settings:*');
                for (const k of personalKeys) {
                    const val = personal[k];
                    const display = typeof val === 'boolean' ? (val ? 'ON' : 'OFF') : String(val);
                    lines.push(`  ❇️ *${k}*: ${display}`);
                }
                if (personal._updated) {
                    lines.push(`  _(last updated: ${personal._updated.slice(0, 10)})_`);
                }
            }
        }

        await sock.sendMessage(chatId, { text: lines.join('\n') }, { quoted: message });
        await sock.sendMessage(chatId, { react: { text: '☑️', key: message.key } });
    } catch (error) {
        console.error('Error in settings command:', error);
        await sock.sendMessage(chatId, { text: 'Failed to read settings.' }, { quoted: message });
    }
}

module.exports = settingsCommand;
