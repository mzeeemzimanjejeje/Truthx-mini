/**
 * mpesa.js — M-Pesa STK Push via courtneytech.xyz API
 *
 * API base : https://courtneytech-api.vercel.app/api
 * Auth     : Authorization: Bearer <COURTNEYTECH_API_KEY>
 * Docs     : https://courtneytech.xyz/dev-docs
 *
 * Required env vars:
 *   COURTNEYTECH_API_KEY   — your API key from courtneytech.xyz/api-keys
 *   COURTNEYTECH_ACCOUNT_ID — (optional) default M-Pesa account ID
 */

const https = require('https');

const API_BASE = 'https://courtneytech-api.vercel.app/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getApiKey() {
    return (process.env.COURTNEYTECH_API_KEY || '').trim();
}

function getAccountId() {
    return (process.env.COURTNEYTECH_ACCOUNT_ID || '').trim() || null;
}

function isConfigured() {
    return !!getApiKey();
}

/**
 * Normalise any Kenyan phone number to +254XXXXXXXXX format.
 * Accepts: 07XX, 01XX, 254XX, +254XX
 */
function normalizePhone(input) {
    let num = String(input).replace(/[\s\-().]/g, '');
    if (num.startsWith('+')) num = num.slice(1);        // strip leading +
    if (num.startsWith('254')) num = num.slice(3);       // strip 254 country code
    if (num.startsWith('0')) num = num.slice(1);         // strip leading 0
    return `+254${num}`;                                  // always return +254XXXXXXXXX
}

function isValidSafaricomNumber(phone) {
    // After normalisation: +254[17]\d{8}
    return /^\+254[17]\d{8}$/.test(phone);
}

/**
 * Minimal HTTPS request helper — no axios dependency.
 * Returns parsed JSON or throws with a clear message.
 */
function apiRequest(method, path, body, timeoutMs = 25000) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const options = {
            hostname: 'courtneytech-api.vercel.app',
            path: `/api${path}`,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getApiKey()}`,
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (!res.ok && res.statusCode >= 400) {
                        const msg = parsed?.message || `HTTP ${res.statusCode}`;
                        return reject(new Error(msg));
                    }
                    resolve(parsed);
                } catch {
                    reject(new Error(`Invalid response from server (HTTP ${res.statusCode})`));
                }
            });
        });

        const timer = setTimeout(() => {
            req.destroy();
            reject(new Error('Request timed out — please try again'));
        }, timeoutMs);

        req.on('response', () => clearTimeout(timer));
        req.on('error', (e) => { clearTimeout(timer); reject(e); });

        if (payload) req.write(payload);
        req.end();
    });
}

// ── STK Push ──────────────────────────────────────────────────────────────────

async function stkPush(phone, amount, accountId) {
    const body = { phone, amount: parseFloat(amount) };
    if (accountId) body.accountId = accountId;
    return apiRequest('POST', '/mpesa/stkpush', body, 25000);
}

// ── Status check ──────────────────────────────────────────────────────────────

async function checkStatus(checkoutRequestId) {
    // API expects camelCase key: checkoutRequestId (NOT checkout_request_id)
    return apiRequest('POST', '/mpesa/status', { checkoutRequestId }, 15000);
}

// ── .pay command ──────────────────────────────────────────────────────────────

async function mpesaPayCommand(sock, chatId, message, args, prefix) {
    if (!isConfigured()) {
        return sock.sendMessage(chatId, {
            text: `❌ *M-Pesa STK Push is not configured.*\n\n` +
                  `The bot owner needs to set the *COURTNEYTECH_API_KEY* environment variable.\n\n` +
                  `Get your API key at: https://courtneytech.xyz/api-keys`
        }, { quoted: message });
    }

    const parts = (args || '').trim().split(/\s+/).filter(Boolean);

    // Usage: .pay <amount> <phone>
    if (parts.length < 2) {
        return sock.sendMessage(chatId, {
            text: `💳 *M-Pesa STK Push*\n${'─'.repeat(28)}\n\n` +
                  `*Usage:* ${prefix}pay <amount> <phone>\n\n` +
                  `*Examples:*\n` +
                  `• ${prefix}pay 100 0712345678\n` +
                  `• ${prefix}pay 500 254712345678\n` +
                  `• ${prefix}pay 250 +254712345678\n\n` +
                  `> An M-Pesa PIN prompt will be sent to the number provided.`
        }, { quoted: message });
    }

    const rawAmount = parts[0];
    const rawPhone  = parts[1];
    const amount    = parseFloat(rawAmount);

    if (isNaN(amount) || amount < 1) {
        return sock.sendMessage(chatId, {
            text: `❌ *Invalid amount.* Enter a number ≥ 1.\n\nExample: ${prefix}pay 100 0712345678`
        }, { quoted: message });
    }

    const phone = normalizePhone(rawPhone);

    if (!isValidSafaricomNumber(phone)) {
        return sock.sendMessage(chatId, {
            text: `❌ *Invalid Safaricom number.*\n\n` +
                  `Valid formats:\n• 0712345678\n• 254712345678\n• +254712345678\n• 0101234567`
        }, { quoted: message });
    }

    const finalAmount = Math.ceil(amount);
    const accountId   = getAccountId();

    try {
        // Acknowledge immediately
        await sock.sendMessage(chatId, {
            text: `⏳ *Sending M-Pesa request...*\n\n` +
                  `📱 *To:* ${phone}\n` +
                  `💰 *Amount:* KES ${finalAmount}\n\n` +
                  `_Please wait..._`
        }, { quoted: message });

        const result = await stkPush(phone, finalAmount, accountId);

        if (result.success) {
            const checkoutId = result.checkoutRequestId || result.checkout_request_id || '';
            await sock.sendMessage(chatId, {
                text: `✅ *M-Pesa Prompt Sent!*\n${'─'.repeat(28)}\n\n` +
                      `📱 *Phone:* ${phone}\n` +
                      `💰 *Amount:* KES ${finalAmount}\n` +
                      (checkoutId ? `🔖 *Reference:* ${checkoutId}\n` : '') +
                      `\n> Check your phone and *enter your M-Pesa PIN* within 30 seconds.\n\n` +
                      (checkoutId
                          ? `_Use *${prefix}paystatus ${checkoutId}* to check if payment was received._`
                          : '')
            }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, {
                text: `❌ *STK Push failed.*\n\n${result.message || 'Unknown error'}`
            }, { quoted: message });
        }
    } catch (err) {
        const errMsg = err?.message || 'Unknown error';
        await sock.sendMessage(chatId, {
            text: `❌ *M-Pesa request failed.*\n\n_${errMsg}_\n\nPlease try again or contact the bot owner.`
        }, { quoted: message });
    }
}

// ── .paystatus command ────────────────────────────────────────────────────────

async function payStatusCommand(sock, chatId, message, args, prefix) {
    if (!isConfigured()) {
        return sock.sendMessage(chatId, {
            text: `❌ *Not configured.* Ask the bot owner to set up COURTNEYTECH_API_KEY.`
        }, { quoted: message });
    }

    const checkoutId = (args || '').trim();

    if (!checkoutId) {
        return sock.sendMessage(chatId, {
            text: `🔍 *Check Payment Status*\n\n` +
                  `*Usage:* ${prefix}paystatus <reference>\n\n` +
                  `_The reference is shown after using the ${prefix}pay command._`
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

        const statusEmoji = { completed: '✅', pending: '⏳', failed: '❌' }[result.status] || '❓';
        const statusLabel = (result.status || 'unknown').toUpperCase();

        let text = `${statusEmoji} *Payment ${statusLabel}*\n${'─'.repeat(28)}\n\n`;
        if (result.amount)           text += `💰 *Amount:* KES ${result.amount}\n`;
        if (result.phone)            text += `📱 *Phone:* ${result.phone}\n`;
        if (result.receipt || result.transaction_code || result.mpesaCode)
            text += `🧾 *M-Pesa Code:* ${result.receipt || result.transaction_code || result.mpesaCode}\n`;
        if (result.created_at || result.createdAt)
            text += `🕐 *Initiated:* ${result.created_at || result.createdAt}\n`;

        if (result.status === 'pending') {
            text += `\n_Payment still pending. Check again in a moment._`;
        } else if (result.status === 'failed') {
            text += `\n_Payment was not completed. Please try again._`;
        }

        await sock.sendMessage(chatId, { text }, { quoted: message });
    } catch (err) {
        await sock.sendMessage(chatId, {
            text: `❌ *Status check failed.*\n\n_${err?.message || 'Unknown error'}_`
        }, { quoted: message });
    }
}

module.exports = { mpesaPayCommand, payStatusCommand };
