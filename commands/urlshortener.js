const { retryRequest } = require('../lib/retryRequest');

const DC = 'https://apis.davidcyril.name.ng';

const SERVICES = {
    tinyurl: { path: '/tinyurl', param: 'url',  label: 'TinyURL' },
    bitly:   { path: '/bitly',   param: 'link', label: 'Bit.ly' },
    cuttly:  { path: '/cuttly',  param: 'link', label: 'CleanURI (Cutt.ly)' },
    ssur:    { path: '/ssur',    param: 'link', label: 'Ssur.cc' },
    vgd:     { path: '/vgd',     param: 'link', label: 'V.gd' },
    vurl:    { path: '/vurl',    param: 'link', label: 'Vurl.com' },
    adfoc:   { path: '/adfoc',   param: 'link', label: 'Adfoc.us' },
};

async function urlShortenerCommand(sock, chatId, message, service) {
    try {
        await sock.sendMessage(chatId, { react: { text: '🔗', key: message.key } });

        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const url = text.split(' ').slice(1).join(' ').trim();

        const svc = SERVICES[service];
        if (!svc) {
            return await sock.sendMessage(chatId, { text: `❎ Unknown shortener service.` }, { quoted: message });
        }

        if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
            return await sock.sendMessage(chatId, {
                text: `Please provide a valid URL.\n\nExample: .${service} https://google.com`
            }, { quoted: message });
        }

        const res = await retryRequest(`${DC}${svc.path}?${svc.param}=${encodeURIComponent(url)}`);

        const d = res.data;
        if (!d.success) {
            return await sock.sendMessage(chatId, {
                text: `❎ Failed to shorten URL: ${d.message || 'Unknown error'}`
            }, { quoted: message });
        }

        const shortened = d.shortened_url || d.short_url || d.shortLink || d.url;
        await sock.sendMessage(chatId, {
            text: `🔗 *${svc.label}*\n\n📎 *Original:* ${url}\n✂️ *Shortened:* ${shortened}`
        }, { quoted: message });

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

    } catch (err) {
        console.error(`URL Shortener (${service}) error:`, err.message);
        await sock.sendMessage(chatId, {
            text: `❎ Failed to shorten URL. Please try again.`
        }, { quoted: message });
    }
}

module.exports = { urlShortenerCommand };
