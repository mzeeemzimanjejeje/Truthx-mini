const settings = require('../settings');
const { addSudo, removeSudo, getSudoList, resolveToPhoneJid } = require('../lib/index');

function extractMentionedJid(message) {
    const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentioned.length > 0) return mentioned[0];
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const match = text.match(/\b(\d{7,15})\b/);
    if (match) return match[1] + '@s.whatsapp.net';
    return null;
}

function parseSubCommand(rawText) {
    const lower = rawText.toLowerCase().trim();
    const firstWord = lower.split(/\s+/)[0].replace(/^[.,!#]/, '');

    if (firstWord === 'addsudo') return 'add';
    if (firstWord === 'delsudo' || firstWord === 'removesudo') return 'del';
    if (firstWord === 'sudolist' || firstWord === 'getsudo') return 'list';

    if (firstWord === 'sudo') {
        const args = rawText.trim().split(/\s+/).slice(1);
        return (args[0] || '').toLowerCase();
    }
    return '';
}

async function sudoCommand(sock, chatId, message) {
    const rawSenderJid = message.key.participant || message.key.remoteJid;
    const senderJid = resolveToPhoneJid(rawSenderJid);
    const ownerNum = (global.OWNER_NUMBER || settings.ownerNumber || process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
    const ownerJid = ownerNum ? ownerNum + '@s.whatsapp.net' : '';
    const senderNum = senderJid.replace(/:.*@/, '@').split('@')[0];
    const isOwner = message.key.fromMe || (ownerJid && senderJid === ownerJid) || (ownerNum && senderNum === ownerNum);

    const rawText = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const sub = parseSubCommand(rawText);

    if (!sub || !['add', 'del', 'remove', 'list'].includes(sub)) {
        await sock.sendMessage(chatId, { text: 'Usage:\n🔹.sudo add <@user|number>\n🔹.sudo del <@user|number>\n🔹.sudo list\n\nAliases: .addsudo, .delsudo, .sudolist' },{ quoted: message });
        return;
    }

    if (sub === 'list') {
        const list = await getSudoList();
        if (list.length === 0) {
            await sock.sendMessage(chatId, { text: 'No sudo users set.' },{ quoted: message });
            return;
        }
        const text = list.map((j, i) => `${i + 1}. ${j}`).join('\n');
        await sock.sendMessage(chatId, { text: `Sudo users:\n${text}` },{ quoted: message });
        return;
    }

    if (!isOwner) {
        await sock.sendMessage(chatId, { text: '❌ Only owner can add/remove sudo users. Use .sudo list to view.' },{ quoted: message });
        return;
    }

    const targetJid = extractMentionedJid(message);
    if (!targetJid) {
        await sock.sendMessage(chatId, { text: 'Please mention a user or provide a number.' },{ quoted: message });
        return;
    }

    const targetNum = targetJid.split('@')[0].split(':')[0];

    if (sub === 'add') {
        const ok = await addSudo(targetJid);
        await sock.sendMessage(chatId, { text: ok ? `✅ Added sudo: ${targetNum}` : '❌ Failed to add sudo' },{ quoted: message });
        return;
    }

    if (sub === 'del' || sub === 'remove') {
        if (ownerNum && targetNum === ownerNum) {
            await sock.sendMessage(chatId, { text: 'Owner cannot be removed.'},{ quoted: message });
            return;
        }
        const ok = await removeSudo(targetJid);
        await sock.sendMessage(chatId, { text: ok ? `✅ Removed sudo: ${targetNum}` : '❌ Failed to remove sudo' },{ quoted: message });
        return;
    }
}

module.exports = sudoCommand;
