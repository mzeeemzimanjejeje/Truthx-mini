const axios = require('axios');
const { retryRequest } = require('../lib/retryRequest');

const MEDIA_API = 'https://media.cypherxbot.space';
const DAVID_API = 'https://apis.davidcyril.name.ng';

function fmtNum(n) {
    if (!n && n !== 0) return 'Unknown';
    const num = Number(n);
    if (isNaN(num)) return 'Unknown';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1_000)     return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toLocaleString();
}

function fmtDur(s) {
    if (!s && s !== 0) return 'Unknown';
    const sec = Number(s);
    if (isNaN(sec) || sec <= 0) return 'Unknown';
    const m = Math.floor(sec / 60);
    const r = sec % 60;
    return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

function buildCaption(d) {
    return `「 *TikTok Downloader* 」\n
🎵 Title: ${d.title || 'Unknown'}
👤 Author: ${d.author || 'Unknown'}
🌍 Region: ${d.region || 'Unknown'}
⏱ Duration: ${fmtDur(d.duration)}
🎑 Views: ${fmtNum(d.views)}
❤️ Likes: ${fmtNum(d.likes)}
💬 Comments: ${fmtNum(d.comments)}
🔁 Shares: ${fmtNum(d.shares)}`;
}

async function tiktokCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;

        if (!text) {
            return await sock.sendMessage(chatId, { text: "Please provide a TikTok video URL." });
        }

        const url = text.replace(/^tt\s+/i, '').trim();

        if (!url) {
            return await sock.sendMessage(chatId, { text: "Please provide a TikTok video URL." });
        }

        const tiktokPatterns = [
            /https?:\/\/(?:www\.)?tiktok\.com\//,
            /https?:\/\/(?:vm\.)?tiktok\.com\//,
            /https?:\/\/(?:vt\.)?tiktok\.com\//,
            /https?:\/\/(?:www\.)?tiktok\.com\/@/,
            /https?:\/\/(?:www\.)?tiktok\.com\/t\//
        ];

        if (!tiktokPatterns.some(p => p.test(url))) {
            return await sock.sendMessage(chatId, { text: "Please provide a valid TikTok video link." });
        }

        await sock.sendMessage(chatId, { react: { text: '🤳', key: message.key } });

        let videoUrl = null;
        let caption  = buildCaption({});

        // ── API 1: tikwm.com — best for full stats ───────────────────────────
        try {
            const res = await retryRequest(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, {
                timeout: 20000, headers: { 'accept': 'application/json' }
            }, 3, 1000);
            const d = res?.data?.data;
            if (d && (d.play || d.wmplay)) {
                videoUrl = d.play || d.wmplay;
                caption  = buildCaption({
                    title:    d.title,
                    author:   d.author?.nickname || d.author?.unique_id,
                    region:   d.region,
                    duration: d.duration,
                    views:    d.play_count,
                    likes:    d.digg_count,
                    comments: d.comment_count,
                    shares:   d.share_count,
                });
            }
        } catch (_) {}

        // ── API 2: media.cypherxbot.space ────────────────────────────────────
        if (!videoUrl) {
            try {
                const res = await axios.get(`${MEDIA_API}/download/tiktok/video?url=${encodeURIComponent(url)}`, { timeout: 30000 });
                const r = res?.data?.result;
                if (res?.data?.success && r?.download_url) {
                    videoUrl = r.download_url;
                    caption  = buildCaption({
                        title:    r.title,
                        author:   r.author,
                        region:   r.region,
                        duration: r.duration,
                        views:    r.stats?.views || r.views,
                        likes:    r.stats?.likes || r.likes,
                        comments: r.stats?.comment || r.comments,
                        shares:   r.stats?.share || r.shares,
                    });
                }
            } catch (_) {}
        }

        // ── API 3: David Cyril (3 endpoints) ─────────────────────────────────
        if (!videoUrl) {
            const dcApis = [
                { url: `${DAVID_API}/download/tiktok?url=${encodeURIComponent(url)}`, extract: d => d?.result?.video },
                { url: `${DAVID_API}/download/tiktokv3?url=${encodeURIComponent(url)}`, extract: d => d?.video },
                { url: `${DAVID_API}/download/tiktokv4?url=${encodeURIComponent(url)}`, extract: d => d?.results?.no_watermark },
            ];
            for (const { url: apiUrl, extract } of dcApis) {
                try {
                    const res = await axios.get(apiUrl, { timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0' } });
                    const vid = extract(res?.data);
                    if (vid) {
                        videoUrl = vid;
                        caption = buildCaption({
                            title:  res.data?.result?.title  || res.data?.description,
                            author: res.data?.result?.author || res.data?.author,
                        });
                        break;
                    }
                } catch (_) {}
            }
        }

        // ── API 4 & 5: fallback scrapers ─────────────────────────────────────
        if (!videoUrl) {
            const fallbacks = [
                `https://apiskeith.top/download/tiktokdl?url=${encodeURIComponent(url)}`,
                `https://apis.xcasper.space/api/tiktok-dl?url=${encodeURIComponent(url)}`,
            ];
            for (const apiUrl of fallbacks) {
                try {
                    const res  = await axios.get(apiUrl, { timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0' } });
                    const data = res.data;
                    if (!data) continue;
                    const r    = data.result || data.data || data;
                    const vid  = r?.nowm || r?.video_no_watermark || r?.no_watermark || r?.url || r?.download || r?.video || data?.url || data?.download;
                    if (vid) {
                        videoUrl = vid;
                        caption  = buildCaption({
                            title:    r?.title    || data?.title,
                            author:   r?.author   || data?.author,
                            region:   r?.region,
                            duration: r?.duration,
                            views:    r?.stats?.views    || r?.play_count  || r?.views,
                            likes:    r?.stats?.likes    || r?.digg_count  || r?.likes,
                            comments: r?.stats?.comment  || r?.comment_count || r?.comments,
                            shares:   r?.stats?.share    || r?.share_count || r?.shares,
                        });
                        break;
                    }
                } catch (_) { continue; }
            }
        }

        if (!videoUrl) {
            return await sock.sendMessage(chatId,
                { text: "❌ Failed to fetch TikTok video. All APIs failed. Please try again later." },
                { quoted: message }
            );
        }

        // ── Send video ────────────────────────────────────────────────────────
        try {
            try {
                const buf = Buffer.from((await axios.get(videoUrl, {
                    responseType: 'arraybuffer', timeout: 60000,
                    maxContentLength: 100 * 1024 * 1024,
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tiktok.com/' }
                })).data);
                if (buf.length === 0) throw new Error('Empty buffer');
                await sock.sendMessage(chatId, { video: buf, caption, mimetype: 'video/mp4' }, { quoted: message });
            } catch {
                await sock.sendMessage(chatId, { video: { url: videoUrl }, caption, mimetype: 'video/mp4' }, { quoted: message });
            }
            await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        } catch (err) {
            console.error('TikTok send error:', err);
            await sock.sendMessage(chatId, { text: '❌ Failed to send TikTok video. Please try again.' }, { quoted: message });
        }

    } catch (err) {
        console.error('Error in TikTok command:', err);
        await sock.sendMessage(chatId, { text: '❌ An unexpected error occurred. Please try again later.' }, { quoted: message });
    }
}

module.exports = tiktokCommand;
