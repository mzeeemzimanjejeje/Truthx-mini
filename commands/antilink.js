const { setAntilink, getAntilink, removeAntilink } = require('../lib/index');
const isAdmin = require('../lib/isAdmin');

async function handleAntilinkCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message) {
    try {
        const { isSudo } = require('../lib/index');
        const isOwner = (message && message.key.fromMe) || await isSudo(senderId);
        const isChannel = chatId?.endsWith('@newsletter');

        if (!isChannel && !isSenderAdmin && !isOwner) {
            await sock.sendMessage(chatId, { text: 'For Group Admins Or Bot Owner Only!' });
            return;
        }
        if (isChannel && !isOwner) {
            await sock.sendMessage(chatId, { text: 'Only the bot owner can manage antilink on channels.' });
            return;
        }

        let prefix = '.';
        try { prefix = require('./setprefix').getPrefix(); } catch (_) {}

        const cmdLen = `${prefix}antilink`.length;
        const args = userMessage.slice(cmdLen).toLowerCase().trim().split(/\s+/);
        const action = args[0];

        if (!action) {
            const config = await getAntilink(chatId, 'on');
            const status = config?.enabled ? '🟢 ON' : '🔴 OFF';
            const currentAction = config?.action || 'delete';
            const usage = `*ANTILINK SETTINGS*\n\n` +
                `Status: ${status}\n` +
                `Action: ${currentAction}\n\n` +
                `Commands:\n` +
                `• ${prefix}antilink on\n` +
                `• ${prefix}antilink off\n` +
                `• ${prefix}antilink set delete | warn | kick`;
            await sock.sendMessage(chatId, { text: usage });
            return;
        }

        switch (action) {
            case 'on': {
                const existingConfig = await getAntilink(chatId, 'on');
                if (existingConfig?.enabled) {
                    await sock.sendMessage(chatId, { text: '*_Antilink is already ON_*' });
                    return;
                }
                const result = await setAntilink(chatId, 'on', 'delete');
                await sock.sendMessage(chatId, {
                    text: result ? '*_Antilink has been turned ON ✅ (default action: delete)_*' : '*_Failed to turn on Antilink_*'
                });
                break;
            }

            case 'off': {
                await removeAntilink(chatId, 'on');
                await sock.sendMessage(chatId, { text: '*_Antilink has been turned OFF ✅_*' });
                break;
            }

            case 'set': {
                const setAction = args[1];
                if (!setAction || !['delete', 'kick', 'warn'].includes(setAction)) {
                    await sock.sendMessage(chatId, {
                        text: `*_Invalid or missing action. Use:_*\n${prefix}antilink set delete | warn | kick`
                    });
                    return;
                }
                const setResult = await setAntilink(chatId, 'on', setAction);
                await sock.sendMessage(chatId, {
                    text: setResult ? `*_Antilink action set to "${setAction}" ✅_*` : '*_Failed to set Antilink action_*'
                });
                break;
            }

            case 'status':
            case 'get': {
                const config = await getAntilink(chatId, 'on');
                await sock.sendMessage(chatId, {
                    text: `*_Antilink Status:_*\nEnabled: ${config?.enabled ? '✅ ON' : '❌ OFF'}\nAction: ${config?.action || 'delete'}`
                });
                break;
            }

            default:
                await sock.sendMessage(chatId, { text: `*_Use ${prefix}antilink for usage._*` });
        }
    } catch (error) {
        console.error('Error in antilink command:', error);
        await sock.sendMessage(chatId, { text: '*_Error processing antilink command_*' });
    }
}

module.exports = {
    handleAntilinkCommand,
};
