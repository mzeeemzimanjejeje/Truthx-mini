const axios = require('axios');
const fs = require('fs');
const path = require('path');

let ytdl;
try {
    ytdl = require('@distube/ytdl-core');
} catch {
    try {
        ytdl = require('ytdl-core');
    } catch {
        ytdl = null;
    }
}

const AXIOS_DEFAULTS = {
    timeout: 30000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
};

const MEDIA_API = 'https://media.cypherxbot.space';
const DAVID_API = 'https://apis.davidcyril.name.ng';

const MAX_FILE_BYTES = 95 * 1024 * 1024;

async function streamToFile(url, filePath) {
    const stream = await axios({
        method: 'get',
        url,
        responseType: 'stream',
        timeout: 240000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
    });

    const writer = fs.createWriteStream(filePath);
    let bytes = 0;
    let aborted = false;

    return new Promise((resolve, reject) => {
        stream.data.on('data', chunk => {
            bytes += chunk.length;
            if (bytes > MAX_FILE_BYTES && !aborted) {
                aborted = true;
                stream.data.destroy();
                writer.destroy();
                try { fs.unlinkSync(filePath); } catch {}
                reject(new Error(`file too large (>${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB)`));
            }
        });
        stream.data.pipe(writer);
        writer.on('finish', () => {
            if (aborted) return;
            const size = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
            if (size > 0) resolve(size);
            else reject(new Error('empty file written'));
        });
        writer.on('error', reject);
        stream.data.on('error', reject);
    });
}

async function resolveCypherX(youtubeUrl) {
    const res = await axios.get(`${MEDIA_API}/download/youtube/video?url=${encodeURIComponent(youtubeUrl)}`, AXIOS_DEFAULTS);
    if (!res?.data?.success || !res.data.result?.download_url) throw new Error('CypherX: no download_url');
    return { url: res.data.result.download_url, title: res.data.result.title || 'YouTube Video' };
}

async function resolvePrinceTech(youtubeUrl) {
    const res = await axios.get(`https://api.princetechn.com/api/download/ytvideo?url=${encodeURIComponent(youtubeUrl)}&apikey=prince`, AXIOS_DEFAULTS);
    if (!res?.data?.success || !res.data.result?.download_url) throw new Error('PrinceTech: no download_url');
    return { url: res.data.result.download_url, title: res.data.result.title || 'YouTube Video' };
}

async function resolveKeith(youtubeUrl) {
    const apis = [
        `https://apiskeith.top/download/video?url=${encodeURIComponent(youtubeUrl)}`,
        `https://apiskeith.top/download/ytmp4?url=${encodeURIComponent(youtubeUrl)}`,
        `${DAVID_API}/download/ytmp4?url=${encodeURIComponent(youtubeUrl)}`,
        `${DAVID_API}/youtube/mp4?url=${encodeURIComponent(youtubeUrl)}`,
    ];

    let lastError;
    for (const apiUrl of apis) {
        try {
            const res = await axios.get(apiUrl, AXIOS_DEFAULTS);
            if (!res?.data) continue;
            const data = res.data;
            const result = data.result || data.data || data;
            const dlUrl = (typeof result === 'string' && result.startsWith('http')) ? result :
                result?.download_url || result?.download || result?.url || result?.link ||
                result?.video || result?.video_url || data?.download_url || data?.url || null;
            if (!dlUrl) continue;
            return { url: dlUrl, title: result?.title || data?.title || 'YouTube Video' };
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error('Keith API: all endpoints failed');
}

async function downloadDirect(youtubeUrl, filePath) {
    if (!ytdl) throw new Error('ytdl not available');
    const info = await ytdl.getInfo(youtubeUrl);
    const format = ytdl.chooseFormat(info.formats, { quality: 'highestvideo', filter: 'videoandaudio' })
        || ytdl.chooseFormat(info.formats, { quality: 'lowest' });
    if (!format) throw new Error('No video format found');

    const stream = ytdl.downloadFromInfo(info, { format });
    const writer = fs.createWriteStream(filePath);

    return new Promise((resolve, reject) => {
        let bytes = 0;
        let aborted = false;
        stream.on('data', chunk => {
            bytes += chunk.length;
            if (bytes > MAX_FILE_BYTES && !aborted) {
                aborted = true;
                stream.destroy();
                writer.destroy();
                try { fs.unlinkSync(filePath); } catch {}
                reject(new Error(`file too large (>${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB)`));
            }
        });
        stream.pipe(writer);
        writer.on('finish', () => {
            if (aborted) return;
            const size = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
            if (size > 0) resolve(info.videoDetails?.title || 'YouTube Video');
            else reject(new Error('empty file'));
        });
        writer.on('error', reject);
        stream.on('error', reject);
        setTimeout(() => { if (!aborted) reject(new Error('download timeout')); }, 240000);
    });
}

async function videoCommand(sock, chatId, message) {
    const yts = require('yt-search');
    const tempDir = path.join(__dirname, 'temp');
    let filePath = null;

    try {
        await sock.sendMessage(chatId, { react: { text: '🎥', key: message.key } });

        const text = message.message?.conversation
            || message.message?.extendedTextMessage?.text
            || message.message?.imageMessage?.caption
            || '';
        const query = text.split(' ').slice(1).join(' ').trim();

        if (!query) {
            await sock.sendMessage(chatId, { react: { text: '❓', key: message.key } });
            return sock.sendMessage(chatId, {
                text: '🎬 Provide a YouTube link or video name\nExample:\n\n*.video Not Like Us Music Video*\n*.video https://youtu.be/...*'
            }, { quoted: message });
        }

        if (query.length > 200) {
            return sock.sendMessage(chatId, { text: '📝 Query too long! Max 200 chars.' }, { quoted: message });
        }

        await sock.sendMessage(chatId, { react: { text: '🔎', key: message.key } });

        const isYoutubeUrl = /https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(query);
        let video;

        if (isYoutubeUrl) {
            try {
                const search = await yts({ videoId: query.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1] || query });
                video = search?.videos?.[0] || { url: query, title: 'YouTube Video', timestamp: 'Unknown' };
            } catch {
                video = { url: query, title: 'YouTube Video', timestamp: 'Unknown' };
            }
        } else {
            const search = await yts(query);
            video = search.videos[0];
        }

        if (!video) {
            await sock.sendMessage(chatId, { react: { text: '🚫', key: message.key } });
            return sock.sendMessage(chatId, { text: "🚫 Couldn't find that video. Try a different search!" }, { quoted: message });
        }

        await sock.sendMessage(chatId, { react: { text: '⬇️', key: message.key } });

        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        filePath = path.join(tempDir, `video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`);

        let videoTitle = video.title;
        let lastErr;

        const resolvers = [
            { name: 'CypherX', fn: resolveCypherX },
            { name: 'PrinceTech', fn: resolvePrinceTech },
            { name: 'Keith', fn: resolveKeith }
        ];

        let downloaded = false;
        for (const r of resolvers) {
            try {
                console.log(`[VIDEO] resolving via ${r.name}…`);
                const { url, title } = await r.fn(video.url);
                console.log(`[VIDEO] ${r.name} resolved: ${title}`);
                await streamToFile(url, filePath);
                videoTitle = title;
                downloaded = true;
                console.log(`[VIDEO] ✅ downloaded via ${r.name} (${fs.statSync(filePath).size} bytes)`);
                break;
            } catch (err) {
                lastErr = err;
                console.error(`[VIDEO] ${r.name} failed: ${err.message}`);
                if (filePath && fs.existsSync(filePath)) {
                    try { fs.unlinkSync(filePath); } catch {}
                }
            }
        }

        if (!downloaded) {
            try {
                console.log('[VIDEO] trying ytdl direct…');
                videoTitle = await downloadDirect(video.url, filePath);
                downloaded = true;
            } catch (err) {
                lastErr = err;
                console.error(`[VIDEO] ytdl failed: ${err.message}`);
            }
        }

        if (!downloaded) {
            throw new Error(`all sources failed: ${lastErr?.message || 'unknown error'}`);
        }

        if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
            throw new Error('downloaded file is empty');
        }

        const sizeMB = (fs.statSync(filePath).size / 1024 / 1024).toFixed(1);
        const caption = `🎬 *${videoTitle || video.title}*\n⏱ Duration: ${video.timestamp || 'Unknown'}\n📦 Size: ${sizeMB} MB`;

        await sock.sendMessage(chatId, {
            video: { url: filePath },
            caption,
            mimetype: 'video/mp4'
        }, { quoted: message });

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

    } catch (error) {
        console.error('[VIDEO] command error:', error?.message || error);

        let errorMessage = `🚫 Failed to download video.\n\n_Reason: ${(error?.message || 'unknown').slice(0, 120)}_`;
        if (/timeout|timed out/i.test(error?.message || '')) {
            errorMessage = '⏱️ Download timed out. The video might be too large or the source is slow. Try a shorter video.';
        } else if (/too large/i.test(error?.message || '')) {
            errorMessage = '📦 Video is too large to send on WhatsApp (>95MB). Try a shorter video.';
        } else if (/empty/i.test(error?.message || '')) {
            errorMessage = '📭 Downloaded file was empty. The source may be temporarily down — try again in a moment.';
        } else if (/all sources/i.test(error?.message || '')) {
            errorMessage = '🔧 All download sources failed right now. Please try again in a few minutes.';
        }

        try { await sock.sendMessage(chatId, { react: { text: '⚠️', key: message.key } }); } catch {}
        try { await sock.sendMessage(chatId, { text: errorMessage }, { quoted: message }); } catch {}

    } finally {
        if (filePath && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch {}
        }
    }
}

module.exports = videoCommand;
