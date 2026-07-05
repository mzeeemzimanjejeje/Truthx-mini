const fs = require('fs');
const path = require('path');
const { getSessionSetting, setSessionSetting, deleteSessionSetting } = require('../lib/sessionSettings');

// Default owner name
const DEFAULT_OWNER_NAME = 'Courtney';

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize owner file if it doesn't exist
if (!fs.existsSync(OWNER_FILE)) {
    fs.writeFileSync(OWNER_FILE, JSON.stringify({ ownerName: DEFAULT_OWNER_NAME }, null, 2));
}

/**
 * Get the current owner name
 * @returns {string} The current owner name
 */
function getOwnerName(botJid) {
    return getSessionSetting(botJid, 'OWNERNAME', DEFAULT_OWNER_NAME);
}

/**
 * Set new owner name
 * @param {string} newOwnerName - The new owner name to set
 * @returns {boolean} Success status
 */
function setOwnerName(botJid, newOwnerName) {
    if (!newOwnerName || newOwnerName.length > 20) return false;
    return setSessionSetting(botJid, 'OWNERNAME', newOwnerName);
}

/**
 * Reset owner name to default
 * @returns {boolean} Success status
 */
function resetOwnerName(botJid) {
    return deleteSessionSetting(botJid, 'OWNERNAME');
}

async function handleSetOwnerCommand(sock, chatId, senderId, message, userMessage, currentPrefix) {
    const botJid = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : null;
    const args = userMessage.split(' ').slice(1);
   const newOwnerName = args.join(' ');
    
    // Create fake contact for enhanced replies
function createFakeContact(message) {
    return {
        key: {
            participants: "0@s.whatsapp.net",
            remoteJid: "status@broadcast",
            fromMe: false,
            id: "Truth-MD"
        },
        message: {
            contactMessage: {
                vcard: `BEGIN:VCARD\nVERSION:3.0\nN:Sy;Bot;;;\nFN:TRUTH MD\nitem1.TEL;waid=${message.key.participant?.split('@')[0] || message.key.remoteJid.split('@')[0]}:${message.key.participant?.split('@')[0] || message.key.remoteJid.split('@')[0]}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`
            }
        },
        participant: "0@s.whatsapp.net"
    };
}
    
  const fake = createFakeContact(message);
    const { isSudo } = require('../lib/index');
    const senderIsSudo = await isSudo(senderId);
    if (!message.key.fromMe && !senderIsSudo) {
        await sock.sendMessage(chatId, { 
            text: '❌ Only bot owner can change the owner name!',
            contextInfo: {
                forwardingScore: 1,
                isForwarded: false,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '',
                    newsletterName: '',
                    serverMessageId: -1
                }
            }
        }, { quoted: fake });
        return;
    }

    if (!newOwnerName) {
        // Show current owner name
        const current = getOwnerName(botJid);
        await sock.sendMessage(chatId, { 
            text: `👑 Current Owner Name: *${current}*\n\nUsage: ${currentPrefix}setowner <new_name>\nExample: ${currentPrefix}setowner Courtney\n\nTo reset: ${currentPrefix}setowner reset`,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: false,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '',
                    newsletterName: '',
                    serverMessageId: -1
                }
            }
        }, { quoted: fake });
        return;
    }

    if (newOwnerName.toLowerCase() === 'reset') {
        // Reset to default owner name
        const success = resetOwnerName(botJid);
        if (success) {
            const defaultOwnerName = getOwnerName(botJid);
            await sock.sendMessage(chatId, { 
                text: `✅ Owner name reset to default: *${defaultOwnerName}*`,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: false,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '@',
                        newsletterName: '',
                        serverMessageId: -1
                    }
                }
            }, { quoted: fake });
        } else {
            await sock.sendMessage(chatId, { 
                text: '❌ Failed to reset owner name!',
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: false,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '@',
                        newsletterName: '',
                        serverMessageId: -1
                    }
                }
            },{ quoted: fake});
        }
        return;
    }

    // Set new owner name
    if (newOwnerName.length > 20) {
        await sock.sendMessage(chatId, { 
            text: '❌ Owner name must be 1-20 characters long!',
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '',
                    newsletterName: '',
                    serverMessageId: -1
                }
            }
        }, { quoted: fake });
        return;
    }

    const success = setOwnerName(botJid, newOwnerName);
    if (success) {
        await sock.sendMessage(chatId, { 
            text: `✅ Owner name successfully set to: *${newOwnerName}*`,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: false,               forwardedNewsletterMessageInfo: {
                    newsletterJid: '@',
                    newsletterName: '',
                    serverMessageId: -1
                }
            }
        }, { quoted: fake });
    } else {
        await sock.sendMessage(chatId, { 
            text: '❌ Failed to set owner name!',
            contextInfo: {
                forwardingScore: 1,
                isForwarded: false,             forwardedNewsletterMessageInfo: {
                    newsletterJid: '@',
                    newsletterName: '',
                    serverMessageId: -1
                }
            }
        }, { quoted: fake });
    }
}

module.exports = {
    getOwnerName,
    setOwnerName,
    resetOwnerName,
    handleSetOwnerCommand
};
