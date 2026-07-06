/**
 * TRUTH-MD Command Handler
 * Self-contained — no external module dependencies
 */

const PREFIX   = process.env.PREFIX   || '.';
const BOT_NAME = process.env.BOT_NAME || 'TRUTH-MD';
const OWNER    = process.env.OWNER_NUMBER || '';

const startTime = Date.now();

function uptime() {
  const ms = Date.now() - startTime;
  const s  = Math.floor(ms / 1000) % 60;
  const m  = Math.floor(ms / 60000) % 60;
  const h  = Math.floor(ms / 3600000);
  return `${h}h ${m}m ${s}s`;
}

function getPlatform() {
  if (process.env.REPLIT_DOMAINS) return 'Replit';
  if (process.env.VERCEL)         return 'Vercel';
  if (process.env.RENDER)         return 'Render';
  if (process.env.DYNO)           return 'Heroku';
  return 'Server';
}

const COMMANDS = {
  menu: {
    desc: 'Show all commands',
    handler: async (sock, msg, args, jid) => {
      try {
        const path = require('path');
        const helpPath = path.join(__dirname, '..', 'commands', 'help.js');
        const fs = require('fs');
        if (fs.existsSync(helpPath)) {
          const helpCommand = require(helpPath);
          return await helpCommand(sock, jid, msg);
        }
      } catch (e) {
        console.error('[CommandHandler] Fallback to basic menu:', e.message);
      }
      const text =
`╔══[ 🤖 *${BOT_NAME}* ]══╗

*🟢 General*
${PREFIX}menu    — Show this menu
${PREFIX}alive   — Check bot status
${PREFIX}ping    — Response time
${PREFIX}uptime  — Bot uptime
${PREFIX}info    — Bot information
${PREFIX}prefix  — Current prefix

*💡 Tips*
• Use ${PREFIX}<command> to run any command
• Bot responds to messages sent to your own number

╚══[ Powered by *${BOT_NAME}* ✓ ]══╝`;
      await sock.sendMessage(jid, { text }, { quoted: msg });
    },
  },

  alive: {
    desc: 'Check if bot is alive',
    handler: async (sock, msg, args, jid) => {
      const ping = Date.now();
      const text =
`╔══[ ✅ *${BOT_NAME} is ALIVE* ]══╗

▣ Status   : Connected 🟢
▣ Uptime   : ${uptime()}
▣ Platform : ${getPlatform()}
▣ Speed    : ${Date.now() - ping}ms
▣ Prefix   : ${PREFIX}

╚══[ 🟢 ALL SYSTEMS ONLINE ✓ ]══╝`;
      await sock.sendMessage(jid, { text }, { quoted: msg });
    },
  },

  ping: {
    desc: 'Check response latency',
    handler: async (sock, msg, args, jid) => {
      const start = Date.now();
      await sock.sendMessage(jid, { text: '🏓 Pong!' }, { quoted: msg });
      const latency = Date.now() - start;
      await sock.sendMessage(jid, { text: `⚡ *Latency:* ${latency}ms` });
    },
  },

  uptime: {
    desc: 'Show bot uptime',
    handler: async (sock, msg, args, jid) => {
      await sock.sendMessage(jid, { text: `⏱️ *Uptime:* ${uptime()}` }, { quoted: msg });
    },
  },

  info: {
    desc: 'Bot information',
    handler: async (sock, msg, args, jid) => {
      const text =
`╭── *${BOT_NAME} Info* ──╮
│ Version  : 2.4.0
│ Prefix   : ${PREFIX}
│ Uptime   : ${uptime()}
│ Platform : ${getPlatform()}
│ Node.js  : ${process.version}
╰──────────────────────╯`;
      await sock.sendMessage(jid, { text }, { quoted: msg });
    },
  },

  prefix: {
    desc: 'Show current prefix',
    handler: async (sock, msg, args, jid) => {
      await sock.sendMessage(jid, { text: `Current prefix: *${PREFIX}*` }, { quoted: msg });
    },
  },

  help: {
    desc: 'Alias for menu',
    handler: async (sock, msg, args, jid) => {
      return COMMANDS.menu.handler(sock, msg, args, jid);
    },
  },

  getprefix: {
    desc: 'Show current prefix',
    handler: async (sock, msg, args, jid) => {
      return COMMANDS.prefix.handler(sock, msg, args, jid);
    },
  },
};

async function handleMessage(sock, rawMsg) {
  try {
    const jid = rawMsg.key?.remoteJid;
    if (!jid) return;

    // Ignore status broadcast
    if (jid === 'status@broadcast') return;

    const body =
      rawMsg.message?.conversation ||
      rawMsg.message?.extendedTextMessage?.text ||
      rawMsg.message?.imageMessage?.caption ||
      rawMsg.message?.videoMessage?.caption ||
      '';

    if (!body.startsWith(PREFIX)) return;

    const [rawCmd, ...args] = body.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = rawCmd.toLowerCase();

    const command = COMMANDS[cmd];
    if (!command) return;

    console.log(`[CMD] ${cmd} from ${jid}`);
    await command.handler(sock, rawMsg, args, jid);
  } catch (err) {
    console.error('[CMD] Error:', err.message);
  }
}

module.exports = { handleMessage, COMMANDS, PREFIX };
