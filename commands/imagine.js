const { fallbackManager } = require('../lib/apiFallbacks');

async function imagineCommand(sock, chatId, message) {
    let imagePrompt = '';
    let enhancedPrompt = '';

    try {
        const text = message.message?.conversation?.trim() ||
                     message.message?.extendedTextMessage?.text?.trim() || '';

        const prefixMap = ['.imagine', '.dalle', '.flux'];
        let cmdLen = 0;
        for (const cmd of prefixMap) {
            if (text.toLowerCase().startsWith(cmd)) {
                cmdLen = cmd.length;
                break;
            }
        }

        imagePrompt = text.slice(cmdLen).trim();

        if (!imagePrompt) {
            return await sock.sendMessage(chatId, {
                text: '🎨 Please provide a prompt.\n\nExamples:\n.imagine a sunset over mountains\n.flux futuristic city\n.dalle anime girl'
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            react: { text: '🎨', key: message.key }
        });

        enhancedPrompt = enhancePrompt(imagePrompt);

        const fallbackResult = await fallbackManager.tryFallbacks('image_generation', enhancedPrompt);

        if (fallbackResult.success) {
            await sock.sendMessage(chatId, {
                image: fallbackResult.data,
                caption: `🎨 *${fallbackResult.api}*\n"${imagePrompt}"`
            }, { quoted: message });

            await sock.sendMessage(chatId, {
                react: { text: '✅', key: message.key }
            });
            return;
        }

        throw new Error('All image generation APIs failed');

    } catch (error) {
        console.error('❌ imagine command error:', error.message);
        await sock.sendMessage(chatId, {
            text: `❌ Failed to generate image${imagePrompt ? ` for: "${imagePrompt}"` : ''}.\n\nPlease try again later.`
        }, { quoted: message });

        await sock.sendMessage(chatId, {
            react: { text: '❌', key: message.key }
        });
    }
}

function enhancePrompt(prompt) {
    const enhancers = [
        'high quality', 'detailed', 'masterpiece', 'best quality',
        'ultra realistic', '4k', 'highly detailed', 'professional photography',
        'cinematic lighting', 'sharp focus'
    ];
    const count = Math.floor(Math.random() * 2) + 3;
    const selected = enhancers.sort(() => Math.random() - 0.5).slice(0, count);
    return `${prompt}, ${selected.join(', ')}`;
}

async function animagineCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const prompt = text.split(' ').slice(1).join(' ').trim();

        if (!prompt) {
            return await sock.sendMessage(chatId, {
                text: `🎨 Please provide a prompt.\n\nExample: .animagine anime girl with wings`
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, { react: { text: '🎨', key: message.key } });

        const res = await retryRequest(`https://apis.davidcyril.name.ng/animagine?prompt=${encodeURIComponent(prompt)}`, { timeout: 30000 });

        const d = res.data;
        if (!d.success || !d.cdn_url) {
            return await sock.sendMessage(chatId, { text: `❎ Image generation failed. Try again.` }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            image: { url: d.cdn_url },
            caption: `🎨 *Animagine XL*\n"${prompt}"`
        }, { quoted: message });

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

    } catch (err) {
        console.error('Animagine error:', err.message);
        await sock.sendMessage(chatId, { text: `❎ Failed to generate image. Please try again.` }, { quoted: message });
    }
}

module.exports = imagineCommand;
module.exports.animagineCommand = animagineCommand;
