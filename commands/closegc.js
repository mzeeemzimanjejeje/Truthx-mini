const isAdmin = require('../lib/isAdmin');

async function closeGCCommand(sock, chatId, message, senderId) {
    try {
        const isGroup = chatId.endsWith('@g.us');
        if (!isGroup) {
            await sock.sendMessage(chatId, { text: '❌ This command can only be used in groups.' }, { quoted: message });
            return;
        }

        const adminStatus = await isAdmin(sock, chatId, senderId);
        if (!adminStatus.isBotAdmin) {
            await sock.sendMessage(chatId, { text: '❌ I need to be an admin to close the group.' }, { quoted: message });
            return;
        }

        if (!adminStatus.isSenderAdmin && !message.key.fromMe) {
            await sock.sendMessage(chatId, { text: '❌ Only group admins can use this command.' }, { quoted: message });
            return;
        }

        await sock.groupSettingUpdate(chatId, 'announcement');
        await sock.sendMessage(chatId, { text: '🔒 *Group Closed*\n\nOnly admins can send messages now.' }, { quoted: message });

    } catch (err) {
        console.error('closeGCCommand error:', err);
        await sock.sendMessage(chatId, { text: '❌ Failed to close group. Make sure I am an admin.' }, { quoted: message }).catch(() => {});
    }
}

module.exports = closeGCCommand;
