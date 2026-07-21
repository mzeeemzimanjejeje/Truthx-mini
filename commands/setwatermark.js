const fs = require('fs');
const path = require('path');
const https = require('https');

// Watermark file path (session-only on Heroku — ephemeral filesystem)
const WATERMARK_FILE = './data/water.json';

// Create data directory if it doesn't exist
if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data', { recursive: true });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the active watermark text.
 * Priority: process.env.WATERMARK → lib/watermark.getWatermarkText()
 * lib/watermark already checks the file and falls back to the built-in default.
 */
function _resolveWatermark() {
    // 1. Persistent: Heroku config var set by .setwatermark (survives restarts)
    const envWm = (process.env.WATERMARK || '').trim();
    if (envWm && envWm !== '{}' && envWm !== '[]') return envWm;

    // 2. File + built-in default ("Truth MD is on fire 🔥🚒") via lib/watermark
    try {
        const { getWatermarkText } = require('../lib/watermark');
        return getWatermarkText();
    } catch (_) {}

    return null;
}

/**
 * Attempt to persist the watermark as a Heroku config var so it survives
 * dyno restarts.  Requires HEROKU_API_KEY + HEROKU_APP_NAME env vars.
 * Fire-and-forget — never throws.
 */
function _saveToHerokuConfigVar(text) {
    const apiKey = process.env.HEROKU_API_KEY;
    const appName = process.env.HEROKU_APP_NAME;
    if (!apiKey || !appName) return;

    const body = JSON.stringify({ WATERMARK: text });
    const opts = {
        hostname: 'api.heroku.com',
        path: `/apps/${appName}/config-vars`,
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.heroku+json; version=3',
            'Content-Length': Buffer.byteLength(body),
        },
    };

    try {
        const req = https.request(opts, (res) => {
            if (res.statusCode === 200) {
                console.log('[Watermark] Saved to Heroku config var WATERMARK ✅');
            } else {
                console.warn(`[Watermark] Heroku config var update returned ${res.statusCode}`);
            }
        });
        req.on('error', (e) => console.warn('[Watermark] Heroku API error:', e.message));
        req.write(body);
        req.end();
    } catch (e) {
        console.warn('[Watermark] Could not update Heroku config var:', e.message);
    }
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function setWatermarkCommand(sock, chatId, senderId, message, userMessage) {
    try {
        const { isSudo } = require('../lib/index');
        const isOwnerOrSudo = message.key.fromMe || await isSudo(senderId);

        if (!isOwnerOrSudo) {
            return await sock.sendMessage(chatId, {
                text: '❌ Only owner can set watermark!'
            }, { quoted: message });
        }

        const args = userMessage.split(' ').slice(1);
        const watermarkText = args.join(' ').trim();

        if (!watermarkText) {
            // Show current watermark
            const current = _resolveWatermark();
            if (current) {
                return await sock.sendMessage(chatId, {
                    text: `📝 *Current watermark:*\n${current}\n\nUsage: .setwatermark <text>`
                }, { quoted: message });
            } else {
                return await sock.sendMessage(chatId, {
                    text: '📝 No watermark set!\n\nUsage: .setwatermark <text>\nExample: .setwatermark Downloaded by TRUTH MD'
                }, { quoted: message });
            }
        }

        // 1. Write to file (instant, this session)
        fs.writeFileSync(WATERMARK_FILE, watermarkText);

        // 2. Set in-process env var so it takes effect immediately without restart
        process.env.WATERMARK = watermarkText;

        // 3. Persist to Heroku config var (survives future restarts) — async, fire-and-forget
        _saveToHerokuConfigVar(watermarkText);

        await sock.sendMessage(chatId, {
            text: `✅ Watermark set!\n\n"${watermarkText}"\n\nThis will appear on all menus and downloads.\n\n_Note: also saving to Heroku config so it survives restarts._`
        }, { quoted: message });

    } catch (error) {
        console.error('Watermark error:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to set watermark'
        }, { quoted: message });
    }
}

// ── Export helpers ─────────────────────────────────────────────────────────────

function applyWatermark(originalText) {
    try {
        const wm = _resolveWatermark();
        if (!wm) return originalText;
        return `${originalText}\n\n${wm}`;
    } catch (_) {
        return originalText;
    }
}

function applyMediaWatermark(originalCaption) {
    try {
        const wm = _resolveWatermark();
        if (!wm) return originalCaption || '';
        return originalCaption ? `${originalCaption}\n\n${wm}` : wm;
    } catch (_) {
        return originalCaption || '';
    }
}

module.exports = {
    setWatermarkCommand,
    applyWatermark,
    applyMediaWatermark,
};
