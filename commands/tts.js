const fs = require('fs');
const path = require('path');
const { fallbackManager } = require('../lib/apiFallbacks');

async function ttsCommand(sock, chatId, text, message, language = 'en') {
    if (!text || !text.trim()) {
        await sock.sendMessage(chatId, {
            text: '🔊 Please provide text.\n\nExample: .tts Hello world'
        }, { quoted: message });
        return;
    }

    const assetsDir = path.join(__dirname, '..', 'assets');
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

    const fileName = `tts-${Date.now()}.mp3`;
    const filePath = path.join(assetsDir, fileName);

    await sock.sendMessage(chatId, {
        react: { text: '🔊', key: message.key }
    });

    try {
        const gTTS = require('gtts');
        const gtts = new gTTS(text.trim(), language);

        await new Promise((resolve, reject) => {
            gtts.save(filePath, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        const audioBuffer = fs.readFileSync(filePath);
        fs.unlinkSync(filePath);

        await sock.sendMessage(chatId, {
            audio: audioBuffer,
            mimetype: 'audio/mpeg',
            ptt: false
        }, { quoted: message });

        await sock.sendMessage(chatId, {
            react: { text: '✅', key: message.key }
        });
        return;

    } catch (gttsError) {
        console.error('gTTS error:', gttsError.message);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        console.log(`🔄 gTTS failed, trying fallback TTS APIs...`);
        const fallbackResult = await fallbackManager.tryFallbacks('tts', text);

        if (fallbackResult.success) {
            await sock.sendMessage(chatId, {
                audio: fallbackResult.data,
                mimetype: 'audio/mpeg',
                ptt: false
            }, { quoted: message });

            await sock.sendMessage(chatId, {
                react: { text: '✅', key: message.key }
            });
            return;
        }

        await sock.sendMessage(chatId, {
            text: '❌ TTS failed with all available services. Please try again later.'
        }, { quoted: message });

        await sock.sendMessage(chatId, {
            react: { text: '❌', key: message.key }
        });
    }
}

module.exports = ttsCommand;
