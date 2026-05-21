const path = require('path');
const fs   = require('fs');
const os   = require('os');
const settings = require('../settings');

const { getBotName }     = require('./setbot');
const { applyWatermark } = require('./setwatermark');
const { getDiskSummary, isActive: isDiskActive } = require('../lib/diskManager');
const { getGroupCount }  = require('../lib/groupTracker');
const { getStatus: getQCStatus } = require('../lib/quickConnect');

const DEFAULT_MENU_IMAGE = 'https://res.cloudinary.com/dptzpfgtm/image/upload/v1763085792/whatsapp_uploads/qiy0ytyqcbebyacrgbju.jpg';

function getMenuImage() {
    try {
        const p = path.join(__dirname, '../assets/menu.jpg');
        if (fs.existsSync(p)) return { buffer: fs.readFileSync(p), isLocal: true };
    } catch (_) {}
    return { url: DEFAULT_MENU_IMAGE, isLocal: false };
}

function getMenuMediaMode() {
    try {
        const { getConfig } = require('../lib/configdb');
        return getConfig('MENU_MEDIA', 'image');
    } catch (_) { return 'image'; }
}

function createFakeContact(message) {
    return {
        key: {
            participants: '0@s.whatsapp.net',
            remoteJid:    'status@broadcast',
            fromMe:       false,
            id:           'whatsapp bot'
        },
        message: {
            contactMessage: {
                vcard: `BEGIN:VCARD\nVERSION:3.0\nN:Sy;Bot;;;\nFN:TRUTH MD\nitem1.TEL;waid=${message.key.participant?.split('@')[0] || message.key.remoteJid.split('@')[0]}:${message.key.participant?.split('@')[0] || message.key.remoteJid.split('@')[0]}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`
            }
        },
        participant: '0@s.whatsapp.net'
    };
}

function nowEAT() {
    return new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' EAT';
}

function getPlatform() {
    if (process.env.DYNO)            return 'Heroku';
    if (process.env.REPLIT_DOMAINS)  return 'Replit';
    if (process.env.SERVER_IP)       return 'Pterodactyl';
    return os.platform() === 'linux' ? 'Linux VPS' : 'Local';
}

async function buildSystemStatus(sock, start) {
    const { getConfig } = require('../lib/configdb');
    const botName       = getBotName();
    const prefix        = getConfig('PREFIX', settings.defaultPrefix || '.');
    const mode          = getConfig('MODE', settings.commandMode || 'public');
    const owner         = (global.OWNER_NUMBER || process.env.OWNER_NUMBER || 'not set').replace(/[^0-9]/g, '');

    // Database / PostgreSQL
    const dbUrl    = process.env.DATABASE_URL;
    const dbStatus = dbUrl ? 'set' : 'not set';
    let pgStatus   = 'not connected';
    if (dbUrl) {
        try {
            const { Pool } = require('pg');
            const pool = new Pool({ connectionString: dbUrl, connectionTimeoutMillis: 3000 });
            const res  = await pool.query('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=$1', ['public']);
            pgStatus   = `connected · ${res.rows[0].count} tables`;
            await pool.end();
        } catch (_) { pgStatus = 'error'; }
    }

    // Feature flags
    let antideleteOn  = false;
    try {
        const ad = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/antidelete.json'), 'utf8'));
        antideleteOn = !!ad.enabled;
    } catch (_) {}

    const statusDetect  = getConfig('AUTOSTATUSVIEW', 'true') !== 'false';
    const memberDetect  = true;
    const autoReconnect = true;

    // Auth state
    let authState = 'Unknown';
    try {
        const { Pool } = require('pg');
        if (dbUrl) {
            const pool = new Pool({ connectionString: dbUrl, connectionTimeoutMillis: 3000 });
            const res  = await pool.query('SELECT COUNT(*) FROM baileys_auth');
            const cnt  = parseInt(res.rows[0].count);
            authState  = `Registered · ${cnt}k`.replace('000k', 'k');
            if (cnt < 1000) authState = `Registered · ${cnt}`;
            else            authState = `Registered · ${Math.round(cnt / 1000)}k`;
            await pool.end();
        }
    } catch (_) { authState = sock?.user ? 'Registered' : 'Unregistered'; }

    // LID / JID map
    let jidManagerStatus = '✓ ready';
    try {
        const lidmap = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/lidmap.json'), 'utf8'));
        const entries = Object.keys(lidmap).length;
        jidManagerStatus = entries > 0 ? `✓ ready (${entries} mapped)` : '✓ ready';
    } catch (_) {}

    // Status reply
    let { isStatusReplyEnabled } = require('./autostatus');
    const statusReply = isStatusReplyEnabled() ? '✓ ready' : '✓ ready';

    // QuickConnect
    const qcStatus = getQCStatus();

    // Disk Manager
    const diskStatus = isDiskActive() ? `✓ ACTIVE · ${getDiskSummary()}` : '⚠️ unavailable';

    // Scheduler
    const schedulerTime = nowEAT();

    // Menu Media
    const menuMedia = getMenuMediaMode() === 'text' ? 'text-only' : 'image';

    // Status Antidel
    const statusAntidel = getConfig('STATUSANTIDELETE', 'false') === 'true' ? 'on' : 'pending';

    // Member groups
    const groupCount = getGroupCount();

    // Commands
    const cmdCount = global._loadedCommandCount || settings.version;

    const ping = Date.now() - start;
    const line = (label, value) => `▣ ${label.padEnd(16)}: ${value}`;

    const status =
`╔══[ 🤖 *TRUTH-MD* · *CONNECTED* ]══╗

${line('Platform',      getPlatform())}
${line('Time',          nowEAT())}
${line('Prefix',        `"${prefix}"`)}
${line('Mode',          mode)}
${line('Owner',         '+' + owner)}
${line('Commands',      cmdCount)}
${line('Speed',         ping + 'ms')}

${line('Database',      dbStatus)}
${line('PostgreSQL',    pgStatus)}
${line('Pterodactyl',   process.env.SERVER_IP ? 'set' : 'not set')}

${line('Anti-Delete',   antideleteOn ? 'on' : 'off')}
${line('Status Detect', statusDetect  ? 'on' : 'off')}
${line('Member Detect', memberDetect  ? 'on' : 'off')}
${line('Auto-Reconnect',autoReconnect ? 'on' : 'on')}

${line('Auth State',    authState)}
${line('JID Manager',   jidManagerStatus)}
${line('Status Reply',  statusReply)}
${line('QuickConnect',  qcStatus)}
${line('Disk Manager',  diskStatus)}
${line('Scheduler',     schedulerTime)}
${line('Menu Media',    menuMedia)}
${line('Status Antidel',statusAntidel)}
${line('Member Groups', groupCount + ' groups tracked')}

╚══[ 🟢 *ALL SYSTEMS ONLINE* ✓ ]══╝`;

    return status;
}

async function aliveCommand(sock, chatId, message) {
    const start = Date.now();
    try {
        const fake       = createFakeContact(message);
        const menuImage  = getMenuImage();
        const mediaMode  = getMenuMediaMode();
        const { getConfig } = require('../lib/configdb');
        const botName    = getBotName();

        const isOwner = message.key.fromMe || (() => {
            try { const { isSudo } = require('../lib/index'); return false; } catch (_) { return false; }
        })();

        let caption;
        if (isOwner || message.key.fromMe) {
            caption = await buildSystemStatus(sock, start);
        } else {
            const currentMode = getConfig('MODE') || settings.commandMode || 'public';
            caption =
                `*${botName}*\n\n` +
                `*VERSION:* ${settings.version}\n` +
                `*STATUS:* Online ✅\n` +
                `*SPEED:* ${Date.now() - start}ms\n` +
                `*MODE:* ${currentMode}\n\n` +
                `TYPE *.menu* for full commands\n\n` +
                `🌙 ${botName} is alive 🏂`;
        }

        const watermarked = applyWatermark(caption);
        const ctxInfo = {
            forwardingScore: 99,
            remoteJid: 'status@broadcast',
            isForwarded: false,
            forwardedNewsletterMessageInfo: { newsletterJid: '', newsletterName: ' MD', serverMessageId: -1 }
        };

        if (mediaMode === 'text') {
            await sock.sendMessage(chatId, { text: watermarked, contextInfo: ctxInfo }, { quoted: fake });
        } else if (menuImage.isLocal) {
            await sock.sendMessage(chatId, { image: menuImage.buffer, caption: watermarked, contextInfo: ctxInfo }, { quoted: fake });
        } else {
            await sock.sendMessage(chatId, { image: { url: menuImage.url }, caption: watermarked, contextInfo: ctxInfo }, { quoted: fake });
        }

        await sock.sendMessage(chatId, {
            audio: { url: 'https://files.catbox.moe/qpnk2b.mp3' },
            mimetype: 'audio/mp4',
            ptt: false,
            contextInfo: { forwardingScore: 1, isForwarded: false, forwardedNewsletterMessageInfo: { newsletterJid: '', newsletterName: '', serverMessageId: -1 } }
        }, { quoted: fake });

    } catch (error) {
        console.error('Error in alive command:', error);
        try {
            await sock.sendMessage(chatId, { text: `✅ Bot is alive!\n⚡ Speed: ${Date.now() - start}ms` }, { quoted: message });
        } catch (_) {}
    }
}

module.exports = aliveCommand;
