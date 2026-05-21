async function forceSendCommand(sock, chatId, message, args) {
    try {
        if (!args || args.trim().length === 0) {
            await sock.sendMessage(chatId, {
                text: `📝 *Usage:* .forcesend <number> <message>\n\n*Example:*\n.forcesend 254743000000 Hello there!\n\n_Attempts to send the message directly to that number._`
            }, { quoted: message });
            return;
        }

        const parts = args.trim().split(' ');
        const rawNumber = parts[0];
        const textToSend = parts.slice(1).join(' ');

        if (!rawNumber || rawNumber.replace(/\D/g, '').length < 7) {
            await sock.sendMessage(chatId, {
                text: '❌ Invalid number. Example: .forcesend 254743000000 Hello!'
            }, { quoted: message });
            return;
        }

        if (!textToSend) {
            await sock.sendMessage(chatId, {
                text: '❌ Please include a message to send.\nExample: .forcesend 254743000000 Hello!'
            }, { quoted: message });
            return;
        }

        const jid = rawNumber.replace(/\D/g, '') + '@s.whatsapp.net';

        console.log(`[FORCESEND] Attempting to send to ${jid}: "${textToSend}"`);

        await sock.sendMessage(jid, { text: textToSend });

        await sock.sendMessage(chatId, {
            text: `✅ Message sent to *+${rawNumber.replace(/\D/g, '')}*\n\n📨 _"${textToSend}"_`
        }, { quoted: message });

        console.log(`[FORCESEND] Message dispatched to ${jid}`);

    } catch (error) {
        console.error('[FORCESEND] Error:', error.message);
        await sock.sendMessage(chatId, {
            text: `❌ Failed to send message: ${error.message}`
        }, { quoted: message });
    }
}

module.exports = forceSendCommand;
