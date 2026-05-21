const fs = require('fs');
const path = require('path');

const BANK_FILE = path.join(__dirname, '../data/bankpayments.json');

if (!fs.existsSync(path.dirname(BANK_FILE))) {
    fs.mkdirSync(path.dirname(BANK_FILE), { recursive: true });
}

function getBankPayments() {
    try {
        if (!fs.existsSync(BANK_FILE)) return [];
        const data = JSON.parse(fs.readFileSync(BANK_FILE, 'utf8'));
        const list = data['global'] || [];
        return list.map(entry => {
            if (typeof entry === 'string') return entry;
            return `*${entry.name}*\n${entry.method}: ${entry.details}`;
        });
    } catch (e) {
        return [];
    }
}

function saveBankPayments(list) {
    fs.writeFileSync(BANK_FILE, JSON.stringify({ global: list }, null, 2));
}

async function techCommand(sock, chatId, message, prefix) {
    const payments = getBankPayments();

    if (payments.length === 0) {
        return sock.sendMessage(chatId, {
            text: `❌ *No bank payment details set.*\n\n` +
                  `Use *${prefix}setbankpayment* followed by your bank details in any style.\n\n` +
                  `*Example:*\n` +
                  `─────────────────────────\n` +
                  `*Bank Payment* 🏦\n` +
                  `\`Account number\` (tap and hold to copy) 1234567890\n\n` +
                  `Bank \`KCB/Equity/NCBA\`\n\n` +
                  `Account Name: \`Your Name\`\n\n` +
                  `> Kindly provide screenshot after payment for verification purposes\n` +
                  `─────────────────────────`
        }, { quoted: message });
    }

    let text = `🏦 *BANK PAYMENT DETAILS* 🏦\n${'─'.repeat(25)}\n\n`;
    payments.forEach((p, i) => {
        text += `*[${i + 1}]*\n\n${p}`;
        if (i < payments.length - 1) text += `\n\n${'─'.repeat(25)}\n\n`;
    });

    await sock.sendMessage(chatId, { text }, { quoted: message });
}

async function setBankPaymentCommand(sock, chatId, senderId, message, args, prefix, isSudo) {
    if (!message.key.fromMe && !isSudo) {
        return sock.sendMessage(chatId, {
            text: '❌ *Only the bot owner can set bank payment details.*'
        }, { quoted: message });
    }

    const paymentText = (args || '').trim();

    if (!paymentText) {
        const payments = getBankPayments();
        return sock.sendMessage(chatId, {
            text: `📋 *SET BANK PAYMENT DETAILS*\n\n` +
                  `Type your bank details in any style after *${prefix}setbankpayment*.\n\n` +
                  `*Example:*\n` +
                  `─────────────────────────\n` +
                  `*Bank Payment* 🏦\n` +
                  `\`Account number\` (tap and hold to copy) 1234567890\n\n` +
                  `Bank \`KCB/Equity/NCBA\`\n\n` +
                  `Account Name: \`Your Name\`\n\n` +
                  `> Kindly provide screenshot after payment for verification purposes\n` +
                  `─────────────────────────\n\n` +
                  `_Currently ${payments.length} entry(s) saved._\n` +
                  `_Use *${prefix}delbankpayment <number>* to remove one._`
        }, { quoted: message });
    }

    if (paymentText.length > 600) {
        return sock.sendMessage(chatId, {
            text: '❌ *Bank payment text is too long.* Maximum 600 characters.'
        }, { quoted: message });
    }

    const payments = getBankPayments();
    payments.push(paymentText);
    saveBankPayments(payments);

    await sock.sendMessage(chatId, {
        text: `✅ *Bank payment entry #${payments.length} added!*\n\n${paymentText}\n\n_Use *${prefix}tech* to view all entries._`
    }, { quoted: message });
}

async function delBankPaymentCommand(sock, chatId, message, args, prefix, isSudo, senderIsSudo) {
    const isOwner = message.key.fromMe || isSudo || senderIsSudo;
    if (!isOwner) {
        return sock.sendMessage(chatId, {
            text: '❌ *Only the bot owner can delete bank payment details.*'
        }, { quoted: message });
    }

    const payments = getBankPayments();

    if (payments.length === 0) {
        return sock.sendMessage(chatId, {
            text: `❌ *No bank payment details saved.*`
        }, { quoted: message });
    }

    const input = (args || '').trim();

    if (!input) {
        let text = `🗑️ *DELETE BANK PAYMENT ENTRY*\n\nUse *${prefix}delbankpayment <number>* to remove.\nYou can delete multiple: *${prefix}delbankpayment 1 2*\n\n${'─'.repeat(25)}\n\n`;
        payments.forEach((p, i) => {
            text += `*[${i + 1}]*\n${p}\n\n${'─'.repeat(25)}\n\n`;
        });
        return sock.sendMessage(chatId, { text }, { quoted: message });
    }

    const indices = input.split(/\s+/)
        .map(n => parseInt(n))
        .filter(n => !isNaN(n) && n >= 1 && n <= payments.length);

    if (indices.length === 0) {
        return sock.sendMessage(chatId, {
            text: `❌ *Invalid number(s).*\nEntries are numbered 1 to ${payments.length}.\n\nSend *${prefix}delbankpayment* to see the list.`
        }, { quoted: message });
    }

    const unique = [...new Set(indices)].sort((a, b) => b - a);
    const removed = [];

    for (const num of unique) {
        removed.unshift(payments.splice(num - 1, 1)[0]);
    }

    saveBankPayments(payments);

    let reply = `✅ *Removed ${removed.length} entry(s):*\n\n`;
    removed.forEach((r) => {
        reply += `*Removed:*\n${r}\n\n`;
    });
    if (payments.length > 0) {
        reply += `_${payments.length} entry(s) remaining. Use *${prefix}tech* to view._`;
    } else {
        reply += `_No bank payment entries remaining._`;
    }

    await sock.sendMessage(chatId, { text: reply }, { quoted: message });
}

module.exports = { techCommand, setBankPaymentCommand, delBankPaymentCommand };
