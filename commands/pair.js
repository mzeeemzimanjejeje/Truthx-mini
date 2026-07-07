const https = require('https');

const PAIR_API = 'https://techword-bot-pair-ksrm.vercel.app/code';

async function pairCommand(sock, chatId, message, pairArgs) {
    try {
        const messageText = message?.message?.conversation || message?.message?.extendedTextMessage?.text || '';
        const rawNumber = (pairArgs || messageText.split(' ').slice(1).join(' ') || '').replace(/[^0-9]/g, '');

        if (!rawNumber) {
            await sock.sendMessage(chatId, {
                text: "❌ Please provide a phone number!\nExample: .pair 254743XXXXXX"
            }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, {
            text: "🔄 Generating pairing code, please wait..."
        }, { quoted: message });

        const code = await fetchPairingCode(rawNumber);

        if (!code) {
            await sock.sendMessage(chatId, {
                text: "❌ Failed to generate pairing code. Make sure the phone number is correct (with country code)."
            }, { quoted: message });
            return;
        }

        const formatted = code.includes('-') ? code : (code.match(/.{1,4}/g)?.join('-') || code);

        const bodyText =
            `╔══════════════════╗\n║  *TRUTH-MD PAIRING*  ║\n╚══════════════════╝\n\n` +
            `📱 *Phone:* +${rawNumber}\n` +
            `🔑 *Code:* \`\`\`${formatted}\`\`\`\n\n` +
            `📚 *How to link:*\n` +
            `1. Open WhatsApp → Settings → Linked Devices\n` +
            `2. Tap "Link a Device"\n` +
            `3. Select "Link with phone number"\n` +
            `4. Enter the code above\n\n` +
            `⏳ Code valid for *2 minutes*.\n\n` +
            `_© TRUTH-MD Bot_`;

        await sock.sendMessage(chatId, { text: bodyText }, { quoted: message });
        await sock.sendMessage(chatId, { text: formatted });
        console.log('[PAIR] Pairing code sent:', formatted);

    } catch (error) {
        console.error('[PAIR] Error:', error.message || error);

        let errMsg;
        if (error.message?.toLowerCase().includes('timeout')) {
            errMsg = "❌ Request timed out. Try again in a moment.";
        } else if (error.message?.includes('Bad Request') || error.message?.includes('invalid')) {
            errMsg = "❌ Invalid phone number. Include country code (e.g. 254743XXXXXX).";
        } else {
            errMsg = `❌ Error: ${error.message || 'Unknown error'}`;
        }

        await sock.sendMessage(chatId, { text: errMsg }, { quoted: message });
    }
}

// Calls the Techword pairing API (SSE stream) and returns the code string
function fetchPairingCode(phoneNumber) {
    return new Promise((resolve, reject) => {
        const url = `${PAIR_API}?number=${encodeURIComponent(phoneNumber)}`;
        const timer = setTimeout(() => { req.destroy(); reject(new Error('Pairing API timed out after 60s')); }, 60000);

        const req = https.get(url, { headers: { 'Accept': 'text/event-stream', 'User-Agent': 'TRUTH-MD/1.0' } }, (res) => {
            if (res.statusCode !== 200) {
                clearTimeout(timer);
                res.resume();
                return reject(new Error(`Pairing API returned HTTP ${res.statusCode}`));
            }

            let buffer = '';

            res.on('data', (chunk) => {
                buffer += chunk.toString();

                // Parse SSE lines — look for "event: code" followed by "data: {...}"
                const lines = buffer.split('\n');
                let eventType = '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('event:')) {
                        eventType = trimmed.slice(6).trim();
                    } else if (trimmed.startsWith('data:') && eventType === 'code') {
                        try {
                            const payload = JSON.parse(trimmed.slice(5).trim());
                            if (payload.code) {
                                clearTimeout(timer);
                                req.destroy();
                                return resolve(payload.code);
                            }
                        } catch (_) {}
                    }
                }
            });

            res.on('error', (e) => { clearTimeout(timer); reject(e); });
            res.on('end', () => { clearTimeout(timer); reject(new Error('Stream ended without a pairing code')); });
        });

        req.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
}

module.exports = pairCommand;
