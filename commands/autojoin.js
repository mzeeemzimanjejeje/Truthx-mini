const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'autojoin.json');

function readConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify({ links: [] }, null, 2));
        }
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (_) {
        return { links: [] };
    }
}

function writeConfig(cfg) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

function extractCode(link) {
    const clean = (link || '').trim().split('?')[0];
    const parts = clean.split('/');
    const code = parts[parts.length - 1];
    return /^[A-Za-z0-9]{10,60}$/.test(code) ? code : null;
}

async function autojoinCommand(sock, chatId, senderId, message, userMessage, senderIsSudo) {
    const isOwner = message.key.fromMe || senderIsSudo;
    if (!isOwner) {
        await sock.sendMessage(chatId, {
            text: '❌ Only the owner can manage the autojoin list.'
        }, { quoted: message });
        return;
    }

    const parts = userMessage.trim().split(/\s+/);
    const sub = (parts[1] || 'list').toLowerCase();

    if (sub === 'list') {
        const cfg = readConfig();
        if (cfg.links.length === 0) {
            await sock.sendMessage(chatId, {
                text: '📋 *Autojoin list is empty.*\n\nAdd a link with:\n.autojoin add <link>'
            }, { quoted: message });
            return;
        }
        const lines = cfg.links.map((l, i) => `${i + 1}. ${l}`).join('\n');
        await sock.sendMessage(chatId, {
            text: `📋 *Autojoin List (${cfg.links.length})*\n\n${lines}`
        }, { quoted: message });
        return;
    }

    if (sub === 'add') {
        const link = parts[2];
        if (!link || !link.includes('chat.whatsapp.com')) {
            await sock.sendMessage(chatId, {
                text: '❌ Please provide a valid WhatsApp invite link.\n\nExample: .autojoin add https://chat.whatsapp.com/XXXX'
            }, { quoted: message });
            return;
        }
        const cfg = readConfig();
        const normalised = link.split('?')[0].trim();
        if (cfg.links.includes(normalised)) {
            await sock.sendMessage(chatId, { text: '⚠️ That link is already in the autojoin list.' }, { quoted: message });
            return;
        }
        cfg.links.push(normalised);
        writeConfig(cfg);
        await sock.sendMessage(chatId, {
            text: `✅ Added to autojoin list.\n\n🔗 ${normalised}\n\n📋 Total: ${cfg.links.length} link(s)`
        }, { quoted: message });
        return;
    }

    if (sub === 'remove' || sub === 'del' || sub === 'delete') {
        const arg = parts[2];
        const cfg = readConfig();
        const idx = parseInt(arg, 10);
        let removed;
        if (!isNaN(idx) && idx >= 1 && idx <= cfg.links.length) {
            removed = cfg.links.splice(idx - 1, 1)[0];
        } else if (arg && arg.includes('chat.whatsapp.com')) {
            const normalised = arg.split('?')[0].trim();
            const i = cfg.links.indexOf(normalised);
            if (i !== -1) { removed = cfg.links.splice(i, 1)[0]; }
        }
        if (!removed) {
            await sock.sendMessage(chatId, {
                text: '❌ Link not found. Use `.autojoin list` to see the numbered list, then `.autojoin remove <number>`.'
            }, { quoted: message });
            return;
        }
        writeConfig(cfg);
        await sock.sendMessage(chatId, {
            text: `✅ Removed from autojoin list.\n\n🔗 ${removed}\n\n📋 Remaining: ${cfg.links.length} link(s)`
        }, { quoted: message });
        return;
    }

    if (sub === 'clear') {
        writeConfig({ links: [] });
        await sock.sendMessage(chatId, { text: '✅ Autojoin list cleared.' }, { quoted: message });
        return;
    }

    if (sub === 'join') {
        await runAutojoin(sock, chatId, message);
        return;
    }

    await sock.sendMessage(chatId, {
        text: `*Autojoin Commands:*\n\n` +
            `▸ .autojoin list — show all saved links\n` +
            `▸ .autojoin add <link> — add a group link\n` +
            `▸ .autojoin remove <number> — remove by list number\n` +
            `▸ .autojoin clear — remove all links\n` +
            `▸ .autojoin join — manually trigger joining all saved links now`
    }, { quoted: message });
}

async function runAutojoin(sock, chatId, message) {
    const cfg = readConfig();
    if (cfg.links.length === 0) return;

    if (chatId && message) {
        await sock.sendMessage(chatId, {
            text: `⏳ Auto-joining ${cfg.links.length} saved group(s)...`
        }, { quoted: message });
    }

    const results = { joined: [], skipped: [], failed: [] };

    for (const link of cfg.links) {
        const code = extractCode(link);
        if (!code) { results.failed.push({ link, reason: 'Invalid code' }); continue; }
        try {
            await sock.groupAcceptInvite(code);
            results.joined.push(link);
        } catch (err) {
            const msg = (err.message || '').toLowerCase();
            if (msg.includes('already') || msg.includes('409')) {
                results.skipped.push(link);
            } else {
                results.failed.push({ link, reason: err.message || 'Unknown error' });
            }
        }
        await new Promise(r => setTimeout(r, 1200));
    }

    if (chatId && message) {
        const lines = [];
        if (results.joined.length) lines.push(`✅ Joined: ${results.joined.length}`);
        if (results.skipped.length) lines.push(`⚠️ Already in: ${results.skipped.length}`);
        if (results.failed.length) lines.push(`❌ Failed: ${results.failed.length}`);
        await sock.sendMessage(chatId, { text: lines.join('\n') || '✅ Done.' }, { quoted: message });
    } else {
        if (results.joined.length) console.log(`[autojoin] Joined ${results.joined.length} group(s) on startup`);
        if (results.skipped.length) console.log(`[autojoin] Already in ${results.skipped.length} group(s)`);
        if (results.failed.length) console.log(`[autojoin] Failed ${results.failed.length} group(s):`, results.failed.map(f => f.reason).join(', '));
    }
}

module.exports = { autojoinCommand, runAutojoin };
