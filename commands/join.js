const { getBinaryNodeChild } = require('@whiskeysockets/baileys');

async function joinCommand(sock, chatId, senderId, message, userMessage) {
    try {
        if (!message.key.fromMe) {
            const { isSudo } = require('../lib/index');
            const senderIsSudo = await isSudo(senderId);
            if (!senderIsSudo) {
                await sock.sendMessage(chatId, {
                    text: '❌ Only owner/sudo can use this command!'
                }, { quoted: message });
                return;
            }
        }

        const args = userMessage.split(' ');
        if (args.length < 2) {
            await sock.sendMessage(chatId, {
                text: `❌ Please provide a WhatsApp group invite link!\n\nExample: ${args[0]} https://chat.whatsapp.com/BJpH3510X00AUvXqOvQ1W0`
            }, { quoted: message });
            return;
        }

        const link = args[1].trim();
        let inviteCode;

        if (link.includes('chat.whatsapp.com/') || link.includes('whatsapp.com/')) {
            const urlPath = link.split('?')[0];
            const parts = urlPath.split('/');
            inviteCode = parts[parts.length - 1];
        } else if (/^[A-Za-z0-9]{10,60}$/.test(link)) {
            inviteCode = link;
        } else {
            await sock.sendMessage(chatId, {
                text: '❌ Invalid WhatsApp group link format!\n\nPlease provide a valid link like:\nhttps://chat.whatsapp.com/BJpH3510X00AUvXqOvQ1W0'
            }, { quoted: message });
            return;
        }

        if (!inviteCode || inviteCode.length < 10 || !/^[A-Za-z0-9]+$/.test(inviteCode)) {
            await sock.sendMessage(chatId, {
                text: '❌ Could not extract a valid invite code from that link.'
            }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, {
            text: '⏳ Attempting to join group...'
        }, { quoted: message });

        try {
            const response = await sock.groupAcceptInvite(inviteCode);
            const groupId = response?.gid || response;
            await sock.sendMessage(chatId, {
                text: `✅ Successfully joined the group!\n\n📝 Group ID: ${groupId}`
            }, { quoted: message });
        } catch (error) {
            const msg = (error.message || '').toLowerCase();

            if (msg.includes('bad-request') || msg.includes('bad_request')) {
                await sock.sendMessage(chatId, {
                    text: '❌ Join failed — the invite link is invalid, has expired, or was revoked. Ask the group admin for a fresh link.'
                }, { quoted: message });
            } else if (msg.includes('invite_revoked') || msg.includes('revoked') || msg.includes('expired')) {
                await sock.sendMessage(chatId, {
                    text: '❌ The invite link has expired or been revoked!'
                }, { quoted: message });
            } else if (msg.includes('already') || msg.includes('already-joined')) {
                await sock.sendMessage(chatId, {
                    text: "⚠️ I'm already a member of this group!"
                }, { quoted: message });
            } else if (msg.includes('full')) {
                await sock.sendMessage(chatId, {
                    text: '❌ The group is full (max 1024 members)!'
                }, { quoted: message });
            } else if (msg.includes('blocked')) {
                await sock.sendMessage(chatId, {
                    text: "❌ I'm blocked from joining this group!"
                }, { quoted: message });
            } else if (msg.includes('require') || msg.includes('approval')) {
                await sock.sendMessage(chatId, {
                    text: '⚠️ This group requires admin approval to join.'
                }, { quoted: message });
            } else {
                await sock.sendMessage(chatId, {
                    text: `❌ Failed to join group: ${error.message || 'Unknown error'}`
                }, { quoted: message });
            }
        }
    } catch (error) {
        await sock.sendMessage(chatId, {
            text: '❌ An unexpected error occurred while trying to join the group.'
        }, { quoted: message });
    }
}

module.exports = joinCommand;
