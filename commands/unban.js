const fs = require('fs');
const path = require('path');
const { saveJson } = require('../lib/saveJson');
const { channelInfo } = require('../lib/messageConfig');

const BANNED_PATH = path.join(__dirname, '../data/banned.json');

async function unbanCommand(sock, chatId, message) {
    let userToUnban;
    
    // Check for mentioned users
    if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        userToUnban = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }
    // Check for replied message
    else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
        userToUnban = message.message.extendedTextMessage.contextInfo.participant;
    }
    
    if (!userToUnban) {
        await sock.sendMessage(chatId, { 
            text: 'Please mention the user or reply to their message to unban!', 
            ...channelInfo 
        });
        return;
    }

    try {
        const bannedUsers = JSON.parse(fs.readFileSync(BANNED_PATH, 'utf8'));
        const index = bannedUsers.indexOf(userToUnban);
        if (index > -1) {
            bannedUsers.splice(index, 1);
            saveJson(BANNED_PATH, bannedUsers);
            
            await sock.sendMessage(chatId, { 
                text: `Successfully unbanned ${userToUnban.split('@')[0]}!`,
                mentions: [userToUnban],
                ...channelInfo 
            });
        } else {
            await sock.sendMessage(chatId, { 
                text: `${userToUnban.split('@')[0]} is not banned!`,
                mentions: [userToUnban],
                ...channelInfo 
            });
        }
    } catch (error) {
        console.error('Error in unban command:', error);
        await sock.sendMessage(chatId, { text: 'Failed to unban user!', ...channelInfo });
    }
}

module.exports = unbanCommand; 