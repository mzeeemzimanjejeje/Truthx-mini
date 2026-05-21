const axios = require('axios');

const LEAGUE_ID = '4328';
const SEASON    = '2024-2025';
const BASE      = 'https://www.thesportsdb.com/api/v1/json/3';

function eplHeader() {
    return `⚽ *ENGLISH PREMIER LEAGUE ${SEASON}*\n${'─'.repeat(30)}\n`;
}

function pad(str, len, right) {
    str = String(str ?? '');
    if (str.length >= len) return str.slice(0, len);
    return right ? str.padEnd(len) : str.padStart(len);
}

async function eplStandings(sock, chatId, message) {
    try {
        await sock.sendMessage(chatId, { text: '⏳ Fetching Premier League standings...' }, { quoted: message });
        const { data } = await axios.get(
            `${BASE}/lookuptable.php?l=${LEAGUE_ID}&s=${SEASON}`,
            { timeout: 10000 }
        );
        const table = data?.table;
        if (!table || !table.length) {
            return sock.sendMessage(chatId, { text: '❌ Standings unavailable right now. Try again later.' }, { quoted: message });
        }
        let text = eplHeader();
        text += `\`\`\`\n`;
        text += `${pad('#', 2)} ${pad('Club', 18, true)} ${pad('P', 2)} ${pad('W', 2)} ${pad('D', 2)} ${pad('L', 2)} ${pad('GD', 4)} ${pad('Pts', 3)}\n`;
        text += `${'─'.repeat(41)}\n`;
        for (const row of table.slice(0, 20)) {
            const pos  = pad(row.intRank, 2);
            const club = pad(row.strTeam?.replace(/^(AFC|FC|FC\s)/, '').trim(), 18, true);
            const p    = pad(row.intPlayed, 2);
            const w    = pad(row.intWin, 2);
            const d    = pad(row.intDraw, 2);
            const l    = pad(row.intLoss, 2);
            const gd   = pad(row.intGoalDifference, 4);
            const pts  = pad(row.intPoints, 3);
            text += `${pos} ${club} ${p} ${w} ${d} ${l} ${gd} ${pts}\n`;
        }
        text += `\`\`\``;
        await sock.sendMessage(chatId, { text }, { quoted: message });
    } catch (e) {
        await sock.sendMessage(chatId, { text: '❌ Failed to fetch standings. Try again later.' }, { quoted: message });
    }
}

async function eplFixtures(sock, chatId, message) {
    try {
        await sock.sendMessage(chatId, { text: '⏳ Fetching upcoming fixtures...' }, { quoted: message });
        const { data } = await axios.get(
            `${BASE}/eventsnextleague.php?id=${LEAGUE_ID}`,
            { timeout: 10000 }
        );
        const events = data?.events;
        if (!events || !events.length) {
            return sock.sendMessage(chatId, { text: '📅 No upcoming fixtures found right now.' }, { quoted: message });
        }
        let text = eplHeader();
        text += `📅 *Upcoming Fixtures*\n${'─'.repeat(30)}\n\n`;
        for (const e of events.slice(0, 8)) {
            const date   = e.dateEvent ? new Date(e.dateEvent).toDateString() : 'TBD';
            const time   = e.strTime ? e.strTime.slice(0, 5) + ' UTC' : 'TBD';
            const home   = e.strHomeTeam || '?';
            const away   = e.strAwayTeam || '?';
            const venue  = e.strVenue ? `\n   🏟️ ${e.strVenue}` : '';
            text += `🗓️ *${date}* — ${time}\n   ${home} 🆚 ${away}${venue}\n\n`;
        }
        await sock.sendMessage(chatId, { text: text.trim() }, { quoted: message });
    } catch (e) {
        await sock.sendMessage(chatId, { text: '❌ Failed to fetch fixtures. Try again later.' }, { quoted: message });
    }
}

async function eplResults(sock, chatId, message) {
    try {
        await sock.sendMessage(chatId, { text: '⏳ Fetching recent results...' }, { quoted: message });
        const { data } = await axios.get(
            `${BASE}/eventspastleague.php?id=${LEAGUE_ID}`,
            { timeout: 10000 }
        );
        const events = data?.events;
        if (!events || !events.length) {
            return sock.sendMessage(chatId, { text: '📊 No recent results found.' }, { quoted: message });
        }
        const recent = [...events].reverse().slice(0, 8);
        let text = eplHeader();
        text += `📊 *Recent Results*\n${'─'.repeat(30)}\n\n`;
        for (const e of recent) {
            const date  = e.dateEvent ? new Date(e.dateEvent).toDateString() : '?';
            const home  = e.strHomeTeam || '?';
            const away  = e.strAwayTeam || '?';
            const score = (e.intHomeScore != null && e.intAwayScore != null)
                ? `${e.intHomeScore} - ${e.intAwayScore}`
                : 'vs';
            text += `🗓️ *${date}*\n   ${home} *${score}* ${away}\n\n`;
        }
        await sock.sendMessage(chatId, { text: text.trim() }, { quoted: message });
    } catch (e) {
        await sock.sendMessage(chatId, { text: '❌ Failed to fetch results. Try again later.' }, { quoted: message });
    }
}

async function eplHelp(sock, chatId, message, prefix) {
    const p = prefix || '.';
    const text = `⚽ *EPL Commands*\n${'─'.repeat(30)}\n\n` +
        `${p}epl — Current standings table\n` +
        `${p}eplfix — Upcoming fixtures\n` +
        `${p}eplresults — Recent match results\n\n` +
        `_Data powered by TheSportsDB_`;
    await sock.sendMessage(chatId, { text }, { quoted: message });
}

module.exports = { eplStandings, eplFixtures, eplResults, eplHelp };
