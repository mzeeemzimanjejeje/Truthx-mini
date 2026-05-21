const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');
const { applyMediaWatermark } = require('./setwatermark');

async function getMediaBufferAndExt(message) {
    const m = message.message || {};
    if (m.imageMessage) {
        const stream = await downloadContentFromMessage(m.imageMessage, 'image');
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return { buffer: Buffer.concat(chunks), ext: '.jpg' };
    }
    if (m.videoMessage) {
        const stream = await downloadContentFromMessage(m.videoMessage, 'video');
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return { buffer: Buffer.concat(chunks), ext: '.mp4' };
    }
    if (m.audioMessage) {
        const stream = await downloadContentFromMessage(m.audioMessage, 'audio');
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return { buffer: Buffer.concat(chunks), ext: '.mp3' };
    }
    if (m.documentMessage) {
        const stream = await downloadContentFromMessage(m.documentMessage, 'document');
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const fileName = m.documentMessage.fileName || 'file.bin';
        const ext = path.extname(fileName) || '.bin';
        return { buffer: Buffer.concat(chunks), ext };
    }
    if (m.stickerMessage) {
        const stream = await downloadContentFromMessage(m.stickerMessage, 'sticker');
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return { buffer: Buffer.concat(chunks), ext: '.webp' };
    }
    return null;
}

async function getQuotedMediaBufferAndExt(message) {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
    if (!quoted) return null;
    return getMediaBufferAndExt({ message: quoted });
}

// Upload buffer to Catbox — retries twice, then falls back to Uguu
async function uploadMedia(buffer, ext) {
    const fileName = `file${ext}`;

    // Try Catbox up to 2 times
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const form = new FormData();
            form.append('reqtype', 'fileupload');
            form.append('fileToUpload', buffer, fileName);
            const res = await axios.post('https://catbox.moe/user/api.php', form, {
                headers: form.getHeaders(),
                timeout: 60000
            });
            const url = (res.data || '').trim();
            if (url.startsWith('https://')) return url;
            throw new Error(`Unexpected Catbox response: ${url}`);
        } catch (e) {
            console.error(`[URL] Catbox attempt ${attempt} failed:`, e.message);
        }
    }

    // Fallback: Uguu.se
    try {
        const form = new FormData();
        form.append('files[]', buffer, { filename: fileName });
        const res = await axios.post('https://uguu.se/upload', form, {
            headers: form.getHeaders(),
            timeout: 60000
        });
        if (Array.isArray(res.data?.files) && res.data.files[0]?.url) return res.data.files[0].url;
        if (typeof res.data === 'string' && res.data.startsWith('http')) return res.data.trim();
        throw new Error('Unexpected Uguu response');
    } catch (e) {
        console.error('[URL] Uguu fallback failed:', e.message);
        throw new Error('All upload hosts failed');
    }
}

async function urlCommand(sock, chatId, message) {
    try {
        // Prefer current message media, else quoted media
        let media = await getMediaBufferAndExt(message);
        if (!media) media = await getQuotedMediaBufferAndExt(message);

        if (!media) {
            await sock.sendMessage(chatId, { 
                text: 'Send or reply to a media (image, video, audio, sticker, document) to get a URL.'
            }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, { 
            text: ''
        }, { quoted: message });

        let url = '';
        try {
            url = await uploadMedia(media.buffer, media.ext);
        } catch (uploadError) {
            console.error('[URL] Upload error:', uploadError.message);
            await sock.sendMessage(chatId, {
                text: '❌ Upload failed on all servers (Catbox & Uguu). Please try again later.'
            }, { quoted: message });
            return;
        }

        // Apply watermark ONLY to the URL result
        const successMessage = applyMediaWatermark(`*URL:* ${url}`);
        
        await sock.sendMessage(chatId, { 
            text: successMessage
        }, { quoted: message });

    } catch (error) {
        console.error('[URL] error:', error?.message || error);
        await sock.sendMessage(chatId, { 
            text: '❌ Failed to convert media to URL. Please try again with a different file.'
        }, { quoted: message });
    }
}

module.exports = urlCommand;
