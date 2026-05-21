const axios = require('axios');

const PAYFLOW_BASE = 'https://payflow.top/api/v2';

function getApiKey() {
    return (process.env.PAYFLOW_PUBLIC_KEY || '').trim();
}

function getApiSecret() {
    return (process.env.PAYFLOW_SECRET_KEY || '').trim();
}

function getAccountId() {
    const id = (process.env.PAYFLOW_ACCOUNT_ID || '').trim();
    return id ? parseInt(id, 10) : null;
}

function buildHeaders() {
    return {
        'Content-Type': 'application/json',
        'X-API-Key': getApiKey(),
        'X-API-Secret': getApiSecret()
    };
}

function normalizePhone(input) {
    let num = String(input).replace(/\D/g, '');
    if (num.startsWith('0'))    num = '254' + num.slice(1);
    if (num.startsWith('+'))    num = num.slice(1);
    if (!num.startsWith('254')) num = '254' + num;
    return num;
}

function isConfigured() {
    return getApiKey() && getApiSecret() && getAccountId();
}

async function stkPush(phone, amount, reference, description) {
    const { data } = await axios.post(
        `${PAYFLOW_BASE}/stkpush.php`,
        {
            payment_account_id: getAccountId(),
            phone,
            amount: parseFloat(amount),
            reference: reference || `PAY_${Date.now()}`,
            description: description || 'WhatsApp Bot Payment'
        },
        { headers: buildHeaders(), timeout: 25000 }
    );
    return data;
}

async function checkStatus(checkoutRequestId) {
    const { data } = await axios.post(
        `${PAYFLOW_BASE}/status.php`,
        { checkout_request_id: checkoutRequestId },
        { headers: buildHeaders(), timeout: 15000 }
    );
    return data;
}

async function mpesaPayCommand(sock, chatId, message, args, prefix) {
    if (!isConfigured()) {
        const missing = [];
        if (!getApiKey())     missing.push('PAYFLOW_PUBLIC_KEY');
        if (!getApiSecret())  missing.push('PAYFLOW_SECRET_KEY');
        if (!getAccountId())  missing.push('PAYFLOW_ACCOUNT_ID');
        return sock.sendMessage(chatId, {
            text: `❌ *M-Pesa STK Push is not configured.*\n\nMissing environment variable(s): ${missing.join(', ')}\n\nAsk the bot owner to set up PayFlow credentials.`
        }, { quoted: message });
    }

    const parts = (args || '').trim().split(/\s+/);

    if (parts.length < 2 || !parts[0] || !parts[1]) {
        return sock.sendMessage(chatId, {
            text: `💳 *M-Pesa STK Push*\n${'─'.repeat(28)}\n\n` +
                  `*Usage:* ${prefix}pay <amount> <phone>\n\n` +
                  `*Examples:*\n` +
                  `${prefix}pay 100 0712345678\n` +
                  `${prefix}pay 500 254712345678\n` +
                  `${prefix}pay 250 0101234567\n\n` +
                  `> An M-Pesa PIN prompt will be sent to the phone number you provide.`
        }, { quoted: message });
    }

    const amount = parseFloat(parts[0]);
    const rawPhone = parts[1];

    if (isNaN(amount) || amount < 1) {
        return sock.sendMessage(chatId, {
            text: `❌ *Invalid amount.* Please enter a number ≥ 1.\n\n*Example:* ${prefix}pay 100 0712345678`
        }, { quoted: message });
    }

    const phone = normalizePhone(rawPhone);

    if (phone.length < 12 || !/^254[17]\d{8}$/.test(phone)) {
        return sock.sendMessage(chatId, {
            text: `❌ *Invalid Safaricom number.*\n\nPlease enter a valid Safaricom number.\n\n*Examples:*\n0712345678\n254712345678\n0101234567`
        }, { quoted: message });
    }

    const finalAmount = Math.ceil(amount);

    try {
        await sock.sendMessage(chatId, {
            text: `⏳ *Sending M-Pesa request...*\n\n📱 *To:* +${phone}\n💰 *Amount:* KES ${finalAmount}\n\n_Please wait..._`
        }, { quoted: message });

        const result = await stkPush(phone, finalAmount);

        if (result.success) {
            const checkoutId = result.checkout_request_id || '';
            await sock.sendMessage(chatId, {
                text: `✅ *M-Pesa STK Push Sent!*\n${'─'.repeat(28)}\n\n` +
                      `📱 *Phone:* +${phone}\n` +
                      `💰 *Amount:* KES ${finalAmount}\n` +
                      `🔖 *Checkout ID:* ${checkoutId || 'N/A'}\n\n` +
                      `> Check your phone — enter your M-Pesa PIN within *30 seconds* to complete the payment.\n\n` +
                      (checkoutId ? `_Use *${prefix}paystatus ${checkoutId}* to check payment status._` : '')
            }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, {
                text: `❌ *STK Push failed.*\n\nReason: ${result.message || 'Unknown error'}`
            }, { quoted: message });
        }
    } catch (err) {
        const errMsg = err?.response?.data?.message
            || err?.response?.data?.detail
            || err?.message
            || 'Unknown error';
        await sock.sendMessage(chatId, {
            text: `❌ *M-Pesa request failed.*\n\n_${errMsg}_\n\nPlease try again later.`
        }, { quoted: message });
    }
}

async function payStatusCommand(sock, chatId, message, args, prefix) {
    if (!isConfigured()) {
        return sock.sendMessage(chatId, {
            text: `❌ *PayFlow is not configured.* Ask the bot owner to set up credentials.`
        }, { quoted: message });
    }

    const checkoutId = (args || '').trim();

    if (!checkoutId) {
        return sock.sendMessage(chatId, {
            text: `🔍 *Check Payment Status*\n\n*Usage:* ${prefix}paystatus <checkout_id>\n\n_The checkout ID is shown after using the ${prefix}pay command._`
        }, { quoted: message });
    }

    try {
        await sock.sendMessage(chatId, {
            text: `🔍 *Checking payment status...*`
        }, { quoted: message });

        const result = await checkStatus(checkoutId);

        if (!result.success) {
            return sock.sendMessage(chatId, {
                text: `❌ *Status check failed.*\n\n${result.message || 'Transaction not found.'}`
            }, { quoted: message });
        }

        const statusEmoji = {
            completed: '✅',
            pending:   '⏳',
            failed:    '❌'
        }[result.status] || '❓';

        const statusLabel = (result.status || 'unknown').toUpperCase();

        let text = `${statusEmoji} *Payment Status: ${statusLabel}*\n${'─'.repeat(28)}\n\n`;
        if (result.amount)           text += `💰 *Amount:* KES ${result.amount}\n`;
        if (result.phone)            text += `📱 *Phone:* +${result.phone}\n`;
        if (result.transaction_code) text += `🧾 *M-Pesa Code:* ${result.transaction_code}\n`;
        if (result.created_at)       text += `🕐 *Initiated:* ${result.created_at}\n`;

        await sock.sendMessage(chatId, { text }, { quoted: message });
    } catch (err) {
        const errMsg = err?.response?.data?.message || err?.message || 'Unknown error';
        await sock.sendMessage(chatId, {
            text: `❌ *Status check failed.*\n\n_${errMsg}_`
        }, { quoted: message });
    }
}

module.exports = { mpesaPayCommand, payStatusCommand };
