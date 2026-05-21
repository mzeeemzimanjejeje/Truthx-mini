const fs = require('fs');
const path = require('path');

const PAYMENT_FILE = path.join(__dirname, '../data/payments.json');

if (!fs.existsSync(path.dirname(PAYMENT_FILE))) {
    fs.mkdirSync(path.dirname(PAYMENT_FILE), { recursive: true });
}

function getPayments() {
    try {
        if (!fs.existsSync(PAYMENT_FILE)) return [];
        const data = JSON.parse(fs.readFileSync(PAYMENT_FILE, 'utf8'));
        const list = data['global'] || [];
        // Migrate old object format {name, method, details} to plain strings
        return list.map(entry => {
            if (typeof entry === 'string') return entry;
            return `*${entry.name}*\n${entry.method}: ${entry.details}`;
        });
    } catch (e) {
        return [];
    }
}

function savePayments(list) {
    fs.writeFileSync(PAYMENT_FILE, JSON.stringify({ global: list }, null, 2));
}

async function paymentCommand(sock, chatId, message, prefix) {
    const payments = getPayments();

    if (payments.length === 0) {
        return sock.sendMessage(chatId, {
            text: `❌ *No payment methods set.*\n\n` +
                  `Use *${prefix}setpayment* followed by your details in any style.\n\n` +
                  `*Example:*\n` +
                  `─────────────────────────\n` +
                  `*Payment method* ☘️\n` +
                  `\`Account number\` (tap and hold to copy) +254769575667\n\n` +
                  `Network \`Mpesa/Safaricom\`\n\n` +
                  `Names:\`Samson migici\`\n\n` +
                  `> Kindly provide screenshot after payment for verification purposes and product purchased\n` +
                  `─────────────────────────`
        }, { quoted: message });
    }

    let text = `💳 *PAYMENT METHODS* 💳\n${'─'.repeat(25)}\n\n`;
    payments.forEach((p, i) => {
        text += `*[${i + 1}]*\n\n${p}`;
        if (i < payments.length - 1) text += `\n\n${'─'.repeat(25)}\n\n`;
    });

    await sock.sendMessage(chatId, { text }, { quoted: message });
}

async function setPaymentCommand(sock, chatId, senderId, message, args, prefix, isSudo) {
    if (!message.key.fromMe && !isSudo) {
        return sock.sendMessage(chatId, {
            text: '❌ *Only the bot owner can set payment methods.*'
        }, { quoted: message });
    }

    const paymentText = (args || '').trim();

    if (!paymentText) {
        const payments = getPayments();
        return sock.sendMessage(chatId, {
            text: `📋 *SET PAYMENT METHOD*\n\n` +
                  `Type your payment details in any style after *${prefix}setpayment*.\n\n` +
                  `*Example:*\n` +
                  `─────────────────────────\n` +
                  `*Payment method* ☘️\n` +
                  `\`Account number\` (tap and hold to copy) +254769575667\n\n` +
                  `Network \`Mpesa/Safaricom\`\n\n` +
                  `Names:\`Samson migici\`\n\n` +
                  `> Kindly provide screenshot after payment for verification purposes and product purchased\n` +
                  `─────────────────────────\n\n` +
                  `_Currently ${payments.length} method(s) saved._\n` +
                  `_Use *${prefix}delpayment <number>* to remove one._`
        }, { quoted: message });
    }

    if (paymentText.length > 600) {
        return sock.sendMessage(chatId, {
            text: '❌ *Payment text is too long.* Maximum 600 characters.'
        }, { quoted: message });
    }

    const payments = getPayments();
    payments.push(paymentText);
    savePayments(payments);

    await sock.sendMessage(chatId, {
        text: `✅ *Payment method #${payments.length} added!*\n\n${paymentText}\n\n_Use *${prefix}payment* to view all methods._`
    }, { quoted: message });
}

async function delPaymentCommand(sock, chatId, message, args, prefix, isSudo, senderIsSudo) {
    const isOwner = message.key.fromMe || isSudo || senderIsSudo;
    if (!isOwner) {
        return sock.sendMessage(chatId, {
            text: '❌ *Only the bot owner can delete payment methods.*'
        }, { quoted: message });
    }

    const payments = getPayments();

    if (payments.length === 0) {
        return sock.sendMessage(chatId, {
            text: `❌ *No payment methods saved.*`
        }, { quoted: message });
    }

    const input = (args || '').trim();

    // No number given — show numbered list so user knows what to delete
    if (!input) {
        let text = `🗑️ *DELETE PAYMENT METHOD*\n\nUse *${prefix}delpayment <number>* to remove.\nYou can delete multiple: *${prefix}delpayment 1 2*\n\n${'─'.repeat(25)}\n\n`;
        payments.forEach((p, i) => {
            text += `*[${i + 1}]*\n${p}\n\n${'─'.repeat(25)}\n\n`;
        });
        return sock.sendMessage(chatId, { text }, { quoted: message });
    }

    // Parse numbers from input
    const indices = input.split(/\s+/)
        .map(n => parseInt(n))
        .filter(n => !isNaN(n) && n >= 1 && n <= payments.length);

    if (indices.length === 0) {
        return sock.sendMessage(chatId, {
            text: `❌ *Invalid number(s).*\nPayment methods are numbered 1 to ${payments.length}.\n\nSend *${prefix}delpayment* to see the list.`
        }, { quoted: message });
    }

    // Remove duplicates and sort descending so splice indices stay valid
    const unique = [...new Set(indices)].sort((a, b) => b - a);
    const removed = [];

    for (const num of unique) {
        removed.unshift(payments.splice(num - 1, 1)[0]);
    }

    savePayments(payments);

    let reply = `✅ *Removed ${removed.length} payment method(s):*\n\n`;
    removed.forEach((r, i) => {
        reply += `*Removed:*\n${r}\n\n`;
    });
    if (payments.length > 0) {
        reply += `_${payments.length} method(s) remaining. Use *${prefix}payment* to view._`;
    } else {
        reply += `_No payment methods remaining._`;
    }

    await sock.sendMessage(chatId, { text: reply }, { quoted: message });
}

module.exports = { paymentCommand, setPaymentCommand, delPaymentCommand };
