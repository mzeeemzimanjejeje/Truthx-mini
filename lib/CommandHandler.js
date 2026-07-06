const { BOT_NAME, PREFIX } = require('./configdb');
const fs = require('fs');
const path = require('path');

/**
 * Fallback message handler that attempts to load the full menu from help.js
 */
async function handleMessage(sock, msg) {
  try {
    const jid = msg.key.remoteJid;
    const body = (msg.message?.conversation || 
                  msg.message?.extendedTextMessage?.text || 
                  msg.message?.imageMessage?.caption || "");
    
    if (!body.startsWith(PREFIX)) return;
    
    const command = body.slice(PREFIX.length).trim().split(' ')[0].toLowerCase();
    
    // If user asks for menu or help, try to load the full help.js
    if (command === 'menu' || command === 'help') {
      const helpPath = path.join(__dirname, '..', 'commands', 'help.js');
      if (fs.existsSync(helpPath)) {
        try {
          const helpCommand = require(helpPath);
          return await helpCommand(sock, jid, msg);
        } catch (e) {
          console.error('[CommandHandler] Failed to load help.js:', e.message);
        }
      }
    }

    // If help.js fails or it's another command, send a generic error
    // but DON'T send the basic menu anymore.
    await sock.sendMessage(jid, { 
      text: `⚠️ *TRUTH-MD* is initializing or encountered an error.\n\nPlease wait a moment and try *${PREFIX}menu* again.` 
    }, { quoted: msg });

  } catch (error) {
    console.error('[CommandHandler] Error:', error);
  }
}

module.exports = { handleMessage };
