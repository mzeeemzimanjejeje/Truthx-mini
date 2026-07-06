const { PREFIX } = require('./configdb');
const fs = require('fs');
const path = require('path');

/**
 * TRUTH-MD Command Handler
 * This handler is used when the main handler (main.js) is unavailable.
 * It forces the loading of the full 440+ commands menu from help.js.
 */
async function handleMessage(sock, msg) {
  try {
    const jid = msg.key.remoteJid;
    if (!jid || jid === 'status@broadcast') return;

    const body = (msg.message?.conversation || 
                  msg.message?.extendedTextMessage?.text || 
                  msg.message?.imageMessage?.caption || 
                  msg.message?.videoMessage?.caption || "");

    if (!body.startsWith(PREFIX)) return;

    const args = body.slice(PREFIX.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    // Force load help.js for menu/help commands
    if (command === 'menu' || command === 'help') {
      const helpPath = path.join(__dirname, '..', 'commands', 'help.js');
      if (fs.existsSync(helpPath)) {
        try {
          // Clear cache to ensure fresh load
          delete require.cache[require.resolve(helpPath)];
          const helpCommand = require(helpPath);
          
          // help.js exports an async function(sock, chatId, message)
          if (typeof helpCommand === 'function') {
            return await helpCommand(sock, jid, msg);
          }
        } catch (e) {
          console.error('[CommandHandler] help.js execution error:', e.message);
        }
      }
    }

    // If it's not a menu command or help.js failed, send a professional status message.
    // We NO LONGER include any basic menu text here to prevent overriding the full menu.
    await sock.sendMessage(jid, { 
      text: `🤖 *TRUTH-MD* is active.\n\nType *${PREFIX}menu* to see all 440+ commands.\n\n_If the menu doesn't appear, please wait a moment while the bot initializes._` 
    }, { quoted: msg });

  } catch (error) {
    console.error('[CommandHandler] Fatal error:', error);
  }
}

module.exports = { handleMessage };
