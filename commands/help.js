// help.js - Fixed version
const settings = require('../settings');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getMenuStyle, getMenuSettings, MENU_STYLES } = require('./menuSettings');
const { generateWAMessageFromContent } = require('@whiskeysockets/baileys');
const { getPrefix } = require('./setprefix');
const { getOwnerName } = require('./setowner');
const { getBotName } = require('./setbot');
const { applyWatermark } = require('./setwatermark');

const more = String.fromCharCode(8206);
const readmore = more.repeat(4001);

// Utility Functions
function formatTime(seconds) {
    const days = Math.floor(seconds / (24 * 60 * 60));
    seconds = seconds % (24 * 60 * 60);
    const hours = Math.floor(seconds / (60 * 60));
    seconds = seconds % (60 * 60);
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);

    let time = '';
    if (days > 0) time += `${days}d `;
    if (hours > 0) time += `${hours}h `;
    if (minutes > 0) time += `${minutes}m `;
    if (seconds > 0 || time === '') time += `${seconds}s`;

    return time.trim();
}

function detectHost() {
    const env = process.env;

    if (env.RENDER || env.RENDER_EXTERNAL_URL) return 'Render';
    if (env.DYNO || env.HEROKU_APP_DIR || env.HEROKU_SLUG_COMMIT) return 'Heroku';
    if (env.VERCEL || env.VERCEL_ENV || env.VERCEL_URL) return 'Vercel';
    if (env.PORTS || env.CYPHERX_HOST_ID) return "TRUTH-MD";
    if (env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID) return 'Railway';
    if (env.REPL_ID || env.REPL_SLUG) return 'Replit';

    const hostname = os.hostname().toLowerCase();
    if (!env.CLOUD_PROVIDER && !env.DYNO && !env.VERCEL && !env.RENDER) {
        if (hostname.includes('vps') || hostname.includes('server')) return 'VPS';
        return 'Panel';
    }

    return 'Unknown Host';
}

// Memory formatting function
const formatMemory = (memory) => {
    return memory < 1024 * 1024 * 1024
        ? Math.round(memory / 1024 / 1024) + ' MB'
        : Math.round(memory / 1024 / 1024 / 1024) + ' GB';
};

// Progress bar function
const progressBar = (used, total, size = 10) => {
    let percentage = Math.round((used / total) * size);
    let bar = '█'.repeat(percentage) + '░'.repeat(size - percentage);
    return `${bar} ${Math.round((used / total) * 100)}%`;
};

// Generate Menu Function
const generateMenu = (pushname, currentMode, hostName, ping, uptimeFormatted, prefix = '.') => {
    const memoryUsage = process.memoryUsage();
    const botUsedMemory = memoryUsage.heapUsed;
    const totalMemory = os.totalmem();
    const systemUsedMemory = totalMemory - os.freemem();
    const prefix2 = getPrefix();
    let newBot = getBotName();
    const menuSettings = getMenuSettings();
    // Show owner name but never show a phone number — if the stored value is
    // blank or looks like digits/JID, fall back to 'Not Set!'
    const _rawOwner = getOwnerName();
    const newOwner = (!_rawOwner || /^\d{5,}/.test(_rawOwner) || _rawOwner.includes('@s.whatsapp.net'))
        ? 'Not Set!'
        : _rawOwner;

    let menu = `┏❐  *◈ ${newBot} ◈*\n`;
    menu += `◆ *Owner:* ${newOwner}\n`;
    menu += `◆ *Mode:* ${currentMode}\n`;
    menu += `◆ *Host:* ${hostName}\n`;
    menu += `◆ *Speed:* ${ping} ms\n`;
    menu += `◆ *Prefix:* [${prefix2}]\n`;
    
    if (menuSettings.showUptime) {
        menu += `◆ *Uptime:* ${uptimeFormatted}\n`;
    }
    
    menu += `◆ *version:* ${settings.version}\n`;

    try {
        const _plugCount = fs.readdirSync(path.join(__dirname)).filter(f => f.endsWith('.js')).length;
        menu += `◆ *Plugins:* ${_plugCount}\n`;
    } catch (_) {}

    if (menuSettings.showMemory) {
        menu += `◆ *Usage:* ${formatMemory(botUsedMemory)} of ${formatMemory(totalMemory)}\n`;
        menu += `◆ *RAM:* ${progressBar(systemUsedMemory, totalMemory)}\n`;
    }
    
    menu += `┗❐\n${readmore}\n`;

    // Owner Menu
    menu += `┏❐ 《 *OWNER MENU* 》 ❐\n`;
    menu += `◆ .autoreadreceipts\n◆ .ban\n◆ .block\n◆ .blocklist\n◆ .leave\n◆ .restart\n◆ .unban\n◆ .unblock\n◆ .promote\n◆ .delete\n◆ .del\n◆ .demote\n◆ .mute\n◆ .tostatus (group & DM)\n◆ .togroupstatus {group_id} msg\n◆ .unmute\n◆ .kick\n◆ .kickall\n◆ .warnings\n◆ .antilink\n◆ .antibadword\n◆ .clear\n◆ .chatbot\n◆ .setpayment\n◆ .getprefix\n◆ .fetchgroups\n◆ .getgroups\n◆ .grouplist\n`;
    menu += `┗❐\n\n`;

    // Group Menu
    menu += `┏❐ 《 *GROUP MENU* 》 ❐\n`;
    menu += `◆ .promote\n◆ .demote\n◆ .tostatus\n◆ .settings\n◆ .welcome\n◆ .setgpp\n◆ .getgpp\n◆ .listadmin\n◆ .goodbye\n◆ .tagnoadmin\n◆ .tagadmin\n◆ .tag\n◆ .antilink\n◆ .set welcome\n◆ .listadmin\n◆ .groupinfo\n◆ .admins\n◆ .warn\n◆ .revoke\n◆ .resetlink\n◆ .open\n◆ .close\n◆ .mention\n◆ .killall\n◆ .closegc\n◆ .opengc\n◆ .antisticker\n◆ .antiphoto\n◆ .jid\n◆ .chjid\n◆ .antipromote\n◆ .antidemote\n◆ .antigroupmention\n◆ .link\n◆ .creategroup\n◆ .approveall\n◆ .rejectall\n◆ .pendingrequests\n`;
    menu += `┗❐\n\n`;

    // AI Menu
    menu += `┏❐ 《 *AI MENU* 》 ❐\n`;
    menu += `◆ .ai\n◆ .aichat\n`;
    menu += `◆ .gpt\n◆ .gpt3\n◆ .gpt4\n◆ .gpt4mini │ .gpt4omini\n`;
    menu += `◆ .gemini\n◆ .gemma\n`;
    menu += `◆ .llama3 │ .llama\n`;
    menu += `◆ .deepseek\n◆ .deepseekr1 │ .dsr1\n◆ .deepseek67b │ .ds67b\n`;
    menu += `◆ .metaai │ .meta\n`;
    menu += `◆ .mixtral\n◆ .mistral\n`;
    menu += `◆ .qvq\n`;
    menu += `◆ .claude\n◆ .cohere\n◆ .venice\n◆ .groq\n`;
    menu += `◆ .imagine\n◆ .flux\n`;
    menu += `┗❐\n\n`;

    // Payment Menu
    menu += `┏❐ 《 *PAYMENT MENU* 》 ❐\n`;
    menu += `◆ .payment\n◆ .setpayment\n◆ .delpayment\n◆ .pay\n◆ .paystatus\n`;
    menu += `┗❐\n\n`;

    // Tech Menu
    menu += `┏❐ 《 *TECH MENU* 》 ❐\n`;
    menu += `◆ .tech\n◆ .bankpayment\n◆ .setbankpayment\n◆ .delbankpayment\n`;
    menu += `┗❐\n\n`;

    // Setting Menu
    menu += `┏❐ 《 *SETTING MENU* 》 ❐\n`;
    menu += `◆ .getsettings\n◆ .mode\n◆ .autostatus\n◆ .autoviewstatus\n◆ .pmblock\n◆ .setmention\n◆ .autoread\n◆ .clearsession\n◆ .antidelete\n◆ .cleartmp\n◆ .autoreact\n◆ .getpp\n◆ .setpp\n◆ .sudo\n◆ .autotyping\n◆ .alwaysonline\n◆ .autorecording\n◆ .autobio\n◆ .autolike\n◆ .autoview\n◆ .anticall\n◆ .antibug\n◆ .autofont\n◆ .autoblock\n◆ .antiedit\n◆ .antiviewonce\n◆ .autosavestatus\n◆ .autorecordtype\n◆ .statusantidelete\n◆ .autostatusreact\n◆ .setmenuimage\n◆ .changemenu style\n◆ .setprefix\n◆ .setownername\n◆ .setbotname\n◆ .setvar\n◆ .setwatermark\n◆ .setownernumber\n`;
    menu += `┗❐\n${readmore}\n`;

    // Main Menu
    menu += `┏❐ 《 *MAIN MENU* 》 ❐\n`;
    menu += `◆ .url\n◆.tagall\n◆ .yts\n◆ .play\n◆ .spotify\n◆ .trt\n◆ .alive\n◆ .ping\n◆ .apk\n◆ .vv\n◆ .video\n◆ .song\n◆ .music\n◆ .ssweb\n◆ .instagram\n◆ .img\n◆ .facebook\n◆ .fatch\n◆ .find\n◆ .name\n◆ .save\n◆ .shazam\n◆ .tiktok\n◆ .ytmp4\n◆ .movie\n◆ .moviesearch │ .msearch\n`;
    menu += `┗❐\n\n`;

    // Stick Menu
    menu += `┏❐ 《 *STICKER MENU* 》 ❐\n`;
    menu += `◆ .blur\n◆ .simage\n◆ .sticker\n◆ .tgsticker\n◆ .meme\n◆ .take\n◆ .emojimix\n`;
    menu += `┗❐\n\n`;

    // Game Menu
    menu += `┏❐ 《 *GAME MENU* 》 ❐\n`;
    menu += `◆ .tictactoe\n◆ .hangman\n◆ .guess\n◆ .trivia\n◆ .answer\n◆ .truth\n◆ .dare\n◆ .8ball\n`;
    menu += `◆ .epl\n◆ .eplfix\n◆ .eplresults\n`;
    menu += `┗❐\n\n`;

    // GitHub Menu
    menu += `┏❐ 《 *GITHUB CMD* 》 ❐\n`;
    menu += `◆ .git\n◆ .github\n◆ .sc\n◆ .script\n◆ .repo\n◆ .gitclone\n`;
    menu += `┗❐\n${readmore}\n`;

    // Maker Menu
    menu += `┏❐ 《 *MAKER MENU* 》❐\n`;
    menu += `◆ .compliment\n◆ .insult\n◆ .flirt\n◆ .shayari\n◆ .goodnight\n◆ .roseday\n◆ .character\n◆ .wasted\n◆ .ship\n◆ .simp\n◆ .stupid\n`;
    menu += `┗❐\n\n`;

    // Anime Menu
    menu += `┏❐ 《 *ANIME MENU* 》 ❐\n`;
    menu += `◆ .neko\n◆ .waifu\n◆.loli\n◆ .nom\n◆ .poke\n◆ .cry\n◆ .kiss\n◆ .pat\n◆ .hug\n◆ .wink\n◆ .facepalm\n`;
    menu += `┗❐\n\n`;

    // Text Maker Menu
    menu += `┏❐ 《 *TEXT MAKER MENU* 》 ❐\n`;
    menu += `◆ .metallic\n◆ .ice\n◆ .snow\n◆ .impressive\n◆ .matrix\n◆ .light\n◆ .neon\n◆ .devil\n◆ .purple\n◆ .thunder\n◆ .leaves\n◆ .1917\n◆ .arena\n◆ .hacker\n◆ .sand\n◆ .blackpink\n◆ .glitch\n◆ .fire\n`;
    menu += `┗❐\n\n`;

    // Image Edit Menu
    menu += `┏❐ 《 *IMG EDIT* 》 ❐\n`;
    menu += `◆ .heart\n◆ .horny\n◆ .circle\n◆ .lgbt\n◆ .lolice\n◆ .stupid\n◆ .namecard\n◆ .tweet\n◆ .ytcomment\n◆ .comrade\n◆ .gay\n◆ .glass\n◆ .jail\n◆ .passed\n◆ .triggered\n`;
    menu += `┗❐\n\n`;

    //deploy Menu
    menu += `┏❐ 《 *GUIDE MENU* 》 ❐\n`;
    menu += `◆ .tutorial\n◆ .reportbug\n◆ .ngl\n`
    menu += `┗❐`
    
    return menu;
};

// Helper function to safely load thumbnail
async function loadThumbnail(thumbnailPath) {
    try {
        if (fs.existsSync(thumbnailPath)) {
            return fs.readFileSync(thumbnailPath);
        } else {
            console.log(`Thumbnail not found: ${thumbnailPath}, using fallback`);
            // Create a simple 1x1 pixel buffer as fallback
            return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
        }
    } catch (error) {
        console.error('Error loading thumbnail:', error);
        // Return fallback buffer
        return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    }
}

// Create fake contact for enhanced replies
function createFakeContact(message) {
    return {
        key: {
            participants: "0@s.whatsapp.net",
            remoteJid: "status@broadcast",
            fromMe: false,
            id: "Smart project"
        },
        message: {
            contactMessage: {
                vcard: `BEGIN:VCARD\nVERSION:3.0\nN:Sy;Bot;;;\nFN: whatsapp bot\nitem1.TEL;waid=${message.key.participant?.split('@')[0] || message.key.remoteJid.split('@')[0]}:${message.key.participant?.split('@')[0] || message.key.remoteJid.split('@')[0]}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`
            }
        },
        participant: "0@s.whatsapp.net"
    };
}

// YOUR EXACT MENU STYLE FUNCTION WITH FIXED tylorkids AND fkontak FOR ALL STYLES
async function sendMenuWithStyle(sock, chatId, message, menulist, menustyle, thumbnailBuffer, pushname) {
    const fkontak = createFakeContact(message);
    const botname = getBotName();
    const ownername = getOwnerName();
    const tylorkids = thumbnailBuffer;
    const plink = "https://github.com/Courtney250/TRUTH-MD";

    if (menustyle === '4') {
        await sock.sendMessage(chatId, {
            document: {
                url: "https://i.ibb.co/2W0H9Jq/avatar-contact.png",
            },
            caption: menulist,
            mimetype: "application/zip",
            fileName: `${botname}`,
            fileLength: "9999999",
            contextInfo: {
                externalAdReply: {
                    showAdAttribution: false,
                    title: "",
                    body: "",
                    thumbnail: tylorkids,
                    sourceUrl: plink,
                    mediaType: 1,
                    renderLargerThumbnail: true,
                },
            },
        }, { quoted: fkontak });
    } else if (menustyle === '2') {
        await sock.sendMessage(chatId, { 
            text: menulist 
        }, { quoted: fkontak });
    } else if (menustyle === '3') {
        await sock.sendMessage(chatId, {
            text: menulist,
            contextInfo: {
                externalAdReply: {
                    showAdAttribution: false,
                    title: botname,
                    body: ownername,
                    thumbnail: tylorkids,
                    sourceUrl: plink,
                    mediaType: 1,
                    renderLargerThumbnail: true,
                },
            },
        }, { quoted: fkontak });
    } else if (menustyle === '1') {
        await sock.sendMessage(chatId, {
            image: tylorkids,
            caption: menulist,
        }, { quoted: fkontak });
    } else if (menustyle === '5') {
        let massage = generateWAMessageFromContent(chatId, {
            viewOnceMessage: {
                message: {
                    interactiveMessage: {
                        body: {
                            text: null,            
                        },
                        footer: {
                            text: menulist, 
                        },
                        nativeFlowMessage: {
                            buttons: [{
                                text: null
                            }], 
                        },
                    },
                },
            },
        }, { quoted: fkontak });
        await sock.relayMessage(chatId, massage.message, { messageId: massage.key.id });
    } else if (menustyle === '6') {
        await sock.relayMessage(chatId, {
            requestPaymentMessage: {
                currencyCodeIso4217: 'USD',
                requestFrom: '0@s.whatsapp.net',
                amount1000: '1',
                noteMessage: {
                    extendedTextMessage: {
                        text: menulist,
                        contextInfo: {
                            mentionedJid: [message.key.participant || message.key.remoteJid],
                            externalAdReply: {
                                showAdAttribution: false,
                                thumbnail: tylorkids,
                            },
                        },
                    },
                },
            },
        }, {});
    } else {
        // Default fallback
        await sock.sendMessage(chatId, { 
            text: menulist 
        }, { quoted: fkontak });
    }
}

// Main help command function
async function helpCommand(sock, chatId, message) {
    const pushname = message.pushName || "Unknown User";
    const menuStyle = getMenuStyle();
    const start = Date.now();
    const msgTsMs = (message?.messageTimestamp
        ? (typeof message.messageTimestamp === 'number'
            ? message.messageTimestamp
            : Number(message.messageTimestamp.low ?? message.messageTimestamp))
        : 0) * 1000;

    // Gather mode + uptime synchronously — no network calls
    const uptimeInSeconds = process.uptime();
    const uptimeFormatted = formatTime(uptimeInSeconds);
    let currentMode = 'public';
    try {
        const { getConfig } = require('../lib/configdb');
        const _settings = require('../settings');
        currentMode = getConfig('MODE') || _settings.commandMode || 'public';
    } catch (_) {
        try {
            const data = JSON.parse(fs.readFileSync('./data/messageCount.json'));
            currentMode = data.isPublic ? 'public' : 'private';
        } catch (_2) {}
    }
    const hostName = detectHost();

    // Resolve thumbnail path synchronously (disk check, no I/O wait)
    const customMenuImagePath = path.join(__dirname, '../assets', 'menu.jpg');
    let thumbnailPath = customMenuImagePath;
    if (!fs.existsSync(customMenuImagePath)) {
        for (const f of ['menu1.jpg', 'menu2.jpg', 'menu3.jpg', 'menu4.jpg', 'menu5.jpg']) {
            const fp = path.join(__dirname, '../assets', f);
            if (fs.existsSync(fp)) { thumbnailPath = fp; break; }
        }
    }

    // Ping = real WhatsApp → bot latency (msg send time → now).
    // Falls back to local processing time if timestamp is missing.
    const now = Date.now();
    let ping = msgTsMs ? (now - msgTsMs) : (now - start);
    if (!Number.isFinite(ping) || ping < 1) ping = (now - start) || 1;
    if (ping > 60000) ping = now - start || 1; // clock skew guard

    // Build menu text
    let menulist = generateMenu(pushname, currentMode, hostName, ping, uptimeFormatted);
    menulist = applyWatermark(menulist);

    try {
        const fkontak = createFakeContact(message);
        // Send loading message first and wait for it to be queued, so it
        // always arrives before the menu (thumbnail read is near-instant)
        await sock.sendMessage(chatId, { text: '*Loading menu...♻️*' }, { quoted: fkontak }).catch(() => {});
        sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } }).catch(() => {});

        // Load thumbnail (sync read, very fast)
        const thumbnailBuffer = await loadThumbnail(thumbnailPath);

        // Send the actual menu
        await sendMenuWithStyle(sock, chatId, message, menulist, menuStyle, thumbnailBuffer, pushname);

        // Fire success reaction — don't await, menu is already delivered
        sock.sendMessage(chatId, { react: { text: '✅', key: message.key } }).catch(() => {});

    } catch (error) {
        console.error('Error in help command:', error);
        const fkontak = createFakeContact(message);
        try {
            await sock.sendMessage(chatId, { text: menulist }, { quoted: fkontak });
        } catch (_) {}
    }
}

module.exports = helpCommand;
