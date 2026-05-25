const PREFIX = process.env.PREFIX || '.';
const BOT_NAME = process.env.BOT_NAME || 'TRUTH-MD';
const OWNER = process.env.OWNER_NUMBER || '';

const startTime = Date.now();

function uptime() {
  const ms = Date.now() - startTime;
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000);
  return `${h}h ${m}m ${s}s`;
}

const COMMANDS = {
  menu: {
    desc: 'Show all commands',
    handler: async (sock, msg, args, jid) => {
      const text = `╭─────────────────╮
│   *${BOT_NAME}*   
│   Menu & Commands  
╰─────────────────╯

*🤖 General*
${PREFIX}menu — Show this menu
${PREFIX}alive — Check bot status
${PREFIX}ping — Check response time
${PREFIX}uptime — Bot uptime
${PREFIX}info — Bot information

*⚙️ Settings*
${PREFIX}prefix — Current prefix
${PREFIX}botname — Bot name

Type any command to use it.
> Powered by *${BOT_NAME}*`;
      await sock.sendMessage(jid, { text }, { quoted: msg });
    }
  },

  alive: {
    desc: 'Check if bot is alive',
    handler: async (sock, msg, args, jid) => {
      const text = `*${BOT_NAME} is Alive! ✅*

> 🕐 Uptime: ${uptime()}
> 📶 Status: Connected
> ⚡ Response: Fast`;
      await sock.sendMessage(jid, { text }, { quoted: msg });
    }
  },

  ping: {
    desc: 'Check response latency',
    handler: async (sock, msg, args, jid) => {
      const start = Date.now();
      await sock.sendMessage(jid, { text: '🏓 Pong!' }, { quoted: msg });
      const latency = Date.now() - start;
      await sock.sendMessage(jid, { text: `⚡ *Latency:* ${latency}ms` });
    }
  },

  uptime: {
    desc: 'Show bot uptime',
    handler: async (sock, msg, args, jid) => {
      await sock.sendMessage(jid, { text: `⏱️ *Uptime:* ${uptime()}` }, { quoted: msg });
    }
  },

  info: {
    desc: 'Bot information',
    handler: async (sock, msg, args, jid) => {
      const text = `╭── *${BOT_NAME} Info* ──╮
│ Version: 1.0.0
│ Prefix: ${PREFIX}
│ Uptime: ${uptime()}
│ Platform: Node.js ${process.version}
╰──────────────────╯`;
      await sock.sendMessage(jid, { text }, { quoted: msg });
    }
  },

  prefix: {
    desc: 'Show current prefix',
    handler: async (sock, msg, args, jid) => {
      await sock.sendMessage(jid, { text: `Current prefix: *${PREFIX}*` }, { quoted: msg });
    }
  },

  botname: {
    desc: 'Show bot name',
    handler: async (sock, msg, args, jid) => {
      await sock.sendMessage(jid, { text: `Bot name: *${BOT_NAME}*` }, { quoted: msg });
    }
  }
};

async function handleMessage(sock, msg) {
  try {
    const jid = msg.key.remoteJid;
    if (!jid) return;

    const body =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      '';

    if (!body.startsWith(PREFIX)) return;

    const [rawCmd, ...args] = body.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = rawCmd.toLowerCase();

    const command = COMMANDS[cmd];
    if (!command) return;

    await command.handler(sock, msg, args, jid);
  } catch (err) {
    console.error('[CMD] Error:', err.message);
  }
}

module.exports = { handleMessage, COMMANDS, PREFIX };
