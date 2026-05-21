const { retryRequest } = require('../lib/retryRequest');

const DC = 'https://apis.davidcyril.name.ng';

async function movieCommand(sock, chatId, message) {
    try {
        await sock.sendMessage(chatId, { react: { text: '🎬', key: message.key } });

        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const query = text.split(' ').slice(1).join(' ').trim();

        if (!query) {
            return await sock.sendMessage(chatId, {
                text: `Please provide a movie title.\n\nExample: .movie Avengers`
            }, { quoted: message });
        }

        const res = await retryRequest(`${DC}/imdb?query=${encodeURIComponent(query)}`);

        const d = res.data;
        if (!d.status || !d.movie) {
            return await sock.sendMessage(chatId, {
                text: `❎ Movie not found for: *${query}*`
            }, { quoted: message });
        }

        const m = d.movie;
        const info = [
            `🎬 *${m.title}* (${m.year})`,
            ``,
            `⭐ *Rating:* ${m.rated || 'N/A'}`,
            `🕐 *Runtime:* ${m.runtime || 'N/A'}`,
            `📅 *Released:* ${m.released || 'N/A'}`,
            `🎭 *Genre:* ${m.genres || 'N/A'}`,
            `🎥 *Director:* ${m.director || 'N/A'}`,
            `✍️ *Writer:* ${m.writer || 'N/A'}`,
            `👥 *Cast:* ${m.actors || 'N/A'}`,
            ``,
            `📝 *Plot:*\n${m.plot || 'N/A'}`,
        ].join('\n');

        const poster = m.poster && m.poster !== 'N/A' ? m.poster : null;

        if (poster) {
            await sock.sendMessage(chatId, {
                image: { url: poster },
                caption: info
            }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, { text: info }, { quoted: message });
        }

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

    } catch (err) {
        console.error('Movie command error:', err.message);
        await sock.sendMessage(chatId, {
            text: `❎ Failed to fetch movie info. Please try again.`
        }, { quoted: message });
    }
}

async function movieSearchCommand(sock, chatId, message) {
    try {
        await sock.sendMessage(chatId, { react: { text: '🔍', key: message.key } });

        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const query = text.split(' ').slice(1).join(' ').trim();

        if (!query) {
            return await sock.sendMessage(chatId, {
                text: `Please provide a movie title to search.\n\nExample: .moviesearch Avengers`
            }, { quoted: message });
        }

        const res = await retryRequest(`${DC}/movie/search?q=${encodeURIComponent(query)}`);

        const items = res.data?.data?.items;
        if (!items || items.length === 0) {
            return await sock.sendMessage(chatId, {
                text: `❎ No results found for: *${query}*`
            }, { quoted: message });
        }

        const top = items.slice(0, 8);
        const lines = top.map((m, i) => {
            const duration = m.duration ? `${Math.floor(m.duration / 60)} min` : 'N/A';
            return `${i + 1}. *${m.title}* (${m.releaseDate?.split('-')[0] || 'N/A'})\n   🎭 ${m.genre || 'N/A'} | 🕐 ${duration}`;
        });

        const total = res.data?.data?.pager?.totalCount || items.length;
        const reply = [
            `🎬 *Search results for:* ${query}`,
            `📊 Found ${total} results — showing top ${top.length}`,
            ``,
            ...lines
        ].join('\n');

        await sock.sendMessage(chatId, { text: reply }, { quoted: message });
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

    } catch (err) {
        console.error('MovieSearch command error:', err.message);
        await sock.sendMessage(chatId, {
            text: `❎ Failed to search movies. Please try again.`
        }, { quoted: message });
    }
}

module.exports = { movieCommand, movieSearchCommand };
