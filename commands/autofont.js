const { getConfig, setConfig } = require('../lib/configdb');
const { isSudo } = require('../lib/index');

const SMALL_CAPS_MAP = {
    a:'ᴀ', b:'ʙ', c:'ᴄ', d:'ᴅ', e:'ᴇ', f:'ꜰ', g:'ɢ', h:'ʜ', i:'ɪ', j:'ᴊ',
    k:'ᴋ', l:'ʟ', m:'ᴍ', n:'ɴ', o:'ᴏ', p:'ᴘ', q:'ǫ', r:'ʀ', s:'ꜱ', t:'ᴛ',
    u:'ᴜ', v:'ᴠ', w:'ᴡ', x:'x', y:'ʏ', z:'ᴢ'
};

const FONT_MAPS = {
    bold:            { upper: 0x1D400, lower: 0x1D41A, name: 'Bold',            preview: '𝐇𝐞𝐥𝐥𝐨' },
    italic:          { upper: 0x1D434, lower: 0x1D44E, name: 'Italic',          preview: '𝐻ℯ𝑙𝑙𝑜' },
    bold_italic:     { upper: 0x1D468, lower: 0x1D482, name: 'Bold Italic',     preview: '𝑯𝒆𝒍𝒍𝒐' },
    script:          { upper: 0x1D49C, lower: 0x1D4B6, name: 'Script',          preview: 'ℋℯ𝓁𝓁ℴ' },
    bold_script:     { upper: 0x1D4D0, lower: 0x1D4EA, name: 'Bold Script',     preview: '𝓗𝓮𝓵𝓵𝓸' },
    fraktur:         { upper: 0x1D504, lower: 0x1D51E, name: 'Fraktur',         preview: 'ℌ𝔢𝔩𝔩𝔬' },
    bold_fraktur:    { upper: 0x1D56C, lower: 0x1D586, name: 'Bold Fraktur',    preview: '𝕳𝖊𝖑𝖑𝖔' },
    double_struck:   { upper: 0x1D538, lower: 0x1D552, name: 'Double Struck',   preview: 'ℍ𝕖𝕝𝕝𝕠' },
    sans:            { upper: 0x1D5A0, lower: 0x1D5BA, name: 'Sans',            preview: '𝖧𝖾𝗅𝗅𝗈' },
    sans_bold:       { upper: 0x1D5D4, lower: 0x1D5EE, name: 'Sans Bold',       preview: '𝗛𝗲𝗹𝗹𝗼' },
    sans_italic:     { upper: 0x1D608, lower: 0x1D622, name: 'Sans Italic',     preview: '𝘏𝘦𝘭𝘭𝘰' },
    sans_bold_italic:{ upper: 0x1D63C, lower: 0x1D656, name: 'Sans Bold Italic',preview: '𝙃𝙚𝙡𝙡𝙤' },
    monospace:       { upper: 0x1D670, lower: 0x1D68A, name: 'Monospace',       preview: '𝙷𝚎𝚕𝚕𝚘' },
    fullwidth:       { upper: 0xFF21,  lower: 0xFF41,  name: 'Fullwidth',        preview: 'Ｈｅｌｌｏ' },
    small_caps:      { charMap: SMALL_CAPS_MAP,         name: 'Small Caps',      preview: 'ʜᴇʟʟᴏ' },
    circled:         { upper: 0x24B6,  lower: 0x24D0,  name: 'Circled',         preview: 'Ⓗⓔⓛⓛⓞ' },
    neg_circled:     { upper: 0x1F150, lower: null,     name: 'Neg Circled',     preview: '🅗🅔🅛🅛🅞' },
    squared:         { upper: 0x1F130, lower: null,     name: 'Squared',         preview: '🄷🄴🄻🄻🄾' },
    parenthesized:   { upper: null,    lower: 0x249C,   name: 'Parenthesized',   preview: '⒣⒠⒧⒧⒪' },
};

function convertChar(char, fontDef) {
    const code = char.charCodeAt(0);
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    if (!isUpper && !isLower) return char;

    if (fontDef.charMap) {
        const mapped = fontDef.charMap[char.toLowerCase()];
        return mapped || char;
    }

    if (isUpper) {
        if (fontDef.upper !== null && fontDef.upper !== undefined)
            return String.fromCodePoint(fontDef.upper + (code - 65));
        if (fontDef.lower !== null && fontDef.lower !== undefined)
            return String.fromCodePoint(fontDef.lower + (code - 65));
    }

    if (isLower) {
        if (fontDef.lower !== null && fontDef.lower !== undefined)
            return String.fromCodePoint(fontDef.lower + (code - 97));
        if (fontDef.upper !== null && fontDef.upper !== undefined)
            return String.fromCodePoint(fontDef.upper + (code - 97));
    }

    return char;
}

function applyFont(text, fontName) {
    const fontDef = FONT_MAPS[fontName];
    if (!fontDef) return text;
    return [...text].map(c => convertChar(c, fontDef)).join('');
}

function getCurrentFont() {
    return getConfig('FONTSTYLE') || 'off';
}

function isFontStyleEnabled() {
    const font = getCurrentFont();
    return font !== 'off' && !!FONT_MAPS[font];
}

function applyFontStyle(text) {
    if (typeof text !== 'string') return text;
    const font = getCurrentFont();
    if (font === 'off' || !FONT_MAPS[font]) return text;
    return applyFont(text, font);
}

async function autofontCommand(sock, chatId, senderId, message, userMessage, prefix) {
    try {
        if (!message.key.fromMe && !await isSudo(senderId)) {
            return sock.sendMessage(chatId, { text: '❗ Only the bot owner can use this command.' }, { quoted: message });
        }

        const args = userMessage.trim().split(/\s+/).slice(1);
        const style = args[0]?.toLowerCase();
        const current = getCurrentFont();

        if (!style) {
            const fontList = Object.entries(FONT_MAPS)
                .map(([key, val]) => `  *${key}* — ${val.preview}`)
                .join('\n');
            return sock.sendMessage(chatId, {
                text: `*Available Fonts:*\n\n${fontList}\n  *off* — Disable\n\n_Current: ${current}_\n\n_Use ${prefix}autofont <name> to apply_`
            }, { quoted: message });
        }

        if (style === 'off') {
            setConfig('FONTSTYLE', 'off');
            return sock.sendMessage(chatId, { text: '✅ Auto font disabled. Responses will use normal text.' }, { quoted: message });
        }

        if (!FONT_MAPS[style]) {
            return sock.sendMessage(chatId, {
                text: `❌ Unknown font "${style}".\n\nUse *${prefix}autofont* to see available fonts.`
            }, { quoted: message });
        }

        setConfig('FONTSTYLE', style);
        return sock.sendMessage(chatId, {
            text: `✅ Font set to *${FONT_MAPS[style].name}*\n\nPreview: ${applyFont('Hello World', style)}`
        }, { quoted: message });

    } catch (err) {
        console.error('Autofont command error:', err);
        await sock.sendMessage(chatId, { text: `❌ Error: ${err.message}` }, { quoted: message });
    }
}

module.exports = { autofontCommand, isFontStyleEnabled, applyFontStyle, getCurrentFont, applyFont };
