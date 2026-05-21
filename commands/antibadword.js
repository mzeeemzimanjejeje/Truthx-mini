const { handleAntiBadwordCommand } = require('../lib/antibadword');
const isAdminHelper = require('../lib/isAdmin');

async function antibadwordCommand(sock, chatId, message, senderId, isSenderAdmin) {
    try {
        const { isSudo } = require('../lib/index');
        const isOwner = message.key.fromMe || await isSudo(senderId);
        if (!isSenderAdmin && !isOwner) {
            await sock.sendMessage(chatId, { text: '```For Group Admins Or Bot Owner Only!```' });
            return;
        }

        // Extract match from message
        const text = message.message?.conversation || 
                    message.message?.extendedTextMessage?.text || '';
        const match = text.split(' ').slice(1).join(' ');

        await handleAntiBadwordCommand(sock, chatId, message, match);
    } catch (error) {
        console.error('Error in antibadword command:', error);
        await sock.sendMessage(chatId, { text: '*Error processing antibadword command*' });
    }
}

module.exports = antibadwordCommand; 