const { setAntitag, getAntitag, removeAntitag } = require('../lib/index');
const isAdmin = require('../lib/isAdmin');

async function handleAntitagCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message) {
    try {
        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: '```For Group Admins Only!```' },{quoted :message});
            return;
        }

        const prefix = '.';
        const args = userMessage.slice(9).toLowerCase().trim().split(' ');
        const action = args[0];

        if (!action) {
            const usage = `ANTITAG SETUP\n\n🔹${prefix}antitag on\n🔹${prefix}antitag set delete | kick\n🔹${prefix}antitag off\n\n`;
            await sock.sendMessage(chatId, { text: usage },{quoted :message});
            return;
        }

        switch (action) {
            case 'on':
                const existingConfig = await getAntitag(chatId, 'on');
                if (existingConfig?.enabled) {
                    await sock.sendMessage(chatId, { text: '*_Antitag is already on_*' },{quoted :message});
                    return;
                }
                const result = await setAntitag(chatId, 'on', 'delete');
                await sock.sendMessage(chatId, { 
                    text: result ? '*_Antitag has been turned ON_*' : '*_Failed to turn on Antitag_*' 
                },{quoted :message});
                break;

            case 'off':
                await removeAntitag(chatId, 'on');
                await sock.sendMessage(chatId, { text: '*_Antitag has been turned OFF_*' },{quoted :message});
                break;

            case 'set':
                if (args.length < 2) {
                    await sock.sendMessage(chatId, { 
                        text: `*_Please specify an action: ${prefix}antitag set delete | kick_*` 
                    },{quoted :message});
                    return;
                }
                const setAction = args[1];
                if (!['delete', 'kick'].includes(setAction)) {
                    await sock.sendMessage(chatId, { 
                        text: '*_Invalid action. Choose delete or kick._*' 
                    },{quoted :message});
                    return;
                }
                const setResult = await setAntitag(chatId, 'on', setAction);
                await sock.sendMessage(chatId, { 
                    text: setResult ? `*_Antitag action set to ${setAction}_*` : '*_Failed to set Antitag action_*' 
                },{quoted :message});
                break;

            case 'get':
                const status = await getAntitag(chatId, 'on');
                const actionConfig = await getAntitag(chatId, 'on');
                await sock.sendMessage(chatId, { 
                    text: `*_Antitag Configuration:_*\nStatus: ${status ? 'ON' : 'OFF'}\nAction: ${actionConfig ? actionConfig.action : 'Not set'}` 
                },{quoted :message});
                break;

            default:
                await sock.sendMessage(chatId, { text: `*_Use ${prefix}antitag for usage._*` },{quoted :message});
        }
    } catch (error) {
        console.error('Error in antitag command:', error);
        await sock.sendMessage(chatId, { text: '*_Error processing antitag command_*' },{quoted :message});
    }
}

async function handleTagDetection(sock, chatId, message, senderId) {
    try {
        const antitagSetting = await getAntitag(chatId, 'on');
        if (!antitagSetting || !antitagSetting.enabled) return;

        if (message.key.fromMe) return;

        // Collect all mentions from any message type
        const mentions = [
            ...(message.message?.extendedTextMessage?.contextInfo?.mentionedJid || []),
            ...(message.message?.imageMessage?.contextInfo?.mentionedJid || []),
            ...(message.message?.videoMessage?.contextInfo?.mentionedJid || []),
            ...(message.message?.stickerMessage?.contextInfo?.mentionedJid || []),
        ];

        if (mentions.length === 0) return;

        // Only bot owner is exempt — admins are enforced too
        const { isSudo } = require('../lib/index');
        if (await isSudo(senderId)) return;

        const groupMetadata = await sock.groupMetadata(chatId);
        const adminIds = groupMetadata.participants.filter(p => p.admin).map(p => p.id);
        const botId = sock.user?.id?.replace(/:\d+@/, '@') || '';
        const isBotAdmin = adminIds.some(a => a === botId || a.split('@')[0] === botId.split('@')[0]);
        if (!isBotAdmin) return;

        const action = antitagSetting.action || 'delete';
        const mention = senderId.split('@')[0];

        // Delete the message
        await sock.sendMessage(chatId, {
            delete: { remoteJid: chatId, fromMe: false, id: message.key.id, participant: senderId }
        });

        if (action === 'kick') {
            await sock.sendMessage(chatId, {
                text: `🚫 @${mention} has been kicked for tagging members.`,
                mentions: [senderId]
            });
            await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
        } else {
            await sock.sendMessage(chatId, {
                text: `⚠️ @${mention}, tagging members is not allowed here!`,
                mentions: [senderId]
            });
        }
    } catch (error) {
        console.error('Error in tag detection:', error);
    }
}

module.exports = {
    handleAntitagCommand,
    handleTagDetection
};

