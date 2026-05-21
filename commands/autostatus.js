const fs = require('fs');
const path = require('path');

const channelInfo = {
    contextInfo: {
        forwardingScore: 1,
        isForwarded: false,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '',
            newsletterName: '',
            serverMessageId: -1
        }
    }
};

const configPath = path.join(__dirname, '../data/autoStatus.json');

const defaultEmojis = ['❤️', '🔥', '⭐', '🎉', '👏', '💫', '🤩', '✨', '💖', '👍'];

// In-memory dedup set — tracks message IDs already reacted to this session.
// Prevents double-reactions when the same status event fires more than once.
const _reactedIds = new Set();
const MAX_REACTED_IDS = 500;

function _addReactedId(id) {
    if (_reactedIds.size >= MAX_REACTED_IDS) {
        // Drop oldest entry
        _reactedIds.delete(_reactedIds.values().next().value);
    }
    _reactedIds.add(id);
}

function _loadConfig() {
    try {
        if (fs.existsSync(configPath)) {
            const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            // Migrate: ensure reactOn exists and defaults to true
            if (cfg.reactOn === undefined) cfg.reactOn = true;
            return cfg;
        }
    } catch (_) {}
    return null;
}

function _saveConfig(cfg) {
    try {
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
    } catch (_) {}
}

// Bootstrap config on first run
if (!_loadConfig()) {
    _saveConfig({
        enabled: true,
        reactOn: true,
        customEmojis: defaultEmojis,
        randomChance: 100
    });
}

function getConfig() {
    const cfg = _loadConfig();
    if (!cfg) return { enabled: true, reactOn: true, customEmojis: defaultEmojis, randomChance: 100 };
    if (cfg.reactOn === undefined) cfg.reactOn = true;
    return cfg;
}

function getRandomEmoji() {
    const emojis = getConfig().customEmojis || defaultEmojis;
    return emojis[Math.floor(Math.random() * emojis.length)];
}

function isAutoStatusEnabled() {
    return getConfig().enabled !== false;
}

function isStatusReactionEnabled() {
    // Check both the JSON file flag and the AUTOSTATUSREACT config key
    // so that both .autostatus react on AND .autostatusreact on work
    try {
        const { getConfig: getCfg } = require('../lib/configdb');
        if (getCfg('AUTOSTATUSREACT', 'false') === 'true') return true;
    } catch (_) {}
    return getConfig().reactOn !== false;
}

// ── Status reply helper ───────────────────────────────────────────────────────
function isStatusReplyEnabled() {
    try {
        const { getConfig: getCfg } = require('../lib/configdb');
        return getCfg('AUTOSTATUSREPLY', 'false') === 'true';
    } catch (_) { return false; }
}

const _repliedIds = new Set();
const MAX_REPLIED = 300;

const STATUS_REPLIES = [
    '👀 Seen your status!',
    '🔥 Nice status!',
    '✨ Loved it!',
    '💯 Great status!',
    '😍 Wow! Seen it!'
];

async function sendStatusReply(sock, participant) {
    try {
        if (!isStatusReplyEnabled()) return;
        if (!participant || participant === 'status@broadcast') return;
        if (_repliedIds.has(participant)) return;
        if (_repliedIds.size >= MAX_REPLIED) {
            _repliedIds.delete(_repliedIds.values().next().value);
        }
        _repliedIds.add(participant);
        const reply = STATUS_REPLIES[Math.floor(Math.random() * STATUS_REPLIES.length)];
        await sock.sendMessage(participant, { text: reply });
        console.log(`✅ Status reply sent to ${participant}`);
    } catch (err) {
        console.error('❌ Status reply error:', err.message);
    }
}

// ── React to a single status key ─────────────────────────────────────────────
async function reactToStatus(sock, statusKey) {
    try {
        if (!isStatusReactionEnabled()) return;

        const msgId = statusKey.id;
        if (!msgId) return;

        // Only react to other people's statuses, not the bot's own
        if (statusKey.fromMe) return;

        // The participant is the person who posted the status
        const participant = statusKey.participant;
        if (!participant || participant === 'status@broadcast') return;

        // Skip if already reacted to this exact status message this session
        if (_reactedIds.has(msgId)) return;
        _addReactedId(msgId);

        const emoji = getRandomEmoji();

        // Correct Baileys API: send a react message to the poster's JID,
        // referencing the status key so WhatsApp routes it as a status reaction.
        await sock.sendMessage(participant, {
            react: {
                text: emoji,
                key: {
                    remoteJid: 'status@broadcast',
                    id: msgId,
                    participant,
                    fromMe: false
                }
            }
        });

        console.log(`✅ Reacted to status from ${participant} with ${emoji}`);
    } catch (err) {
        console.error('❌ Error reacting to status:', err.message);
    }
}

// ── Handle incoming status events ─────────────────────────────────────────────
async function handleStatusUpdate(sock, status) {
    try {
        // Each feature is checked independently so turning on any one of them
        // works immediately without requiring the others to also be enabled.
        const viewOn  = isAutoStatusEnabled();       // .autostatus on / autoStatus.json
        const reactOn = isStatusReactionEnabled();   // .autostatusreact on / AUTOSTATUSREACT
        const replyOn = isStatusReplyEnabled();      // .autostatusreply on / AUTOSTATUSREPLY

        // Nothing is on — skip entirely
        if (!viewOn && !reactOn && !replyOn) return;

        async function processKey(key, participant) {
            if (key?.remoteJid !== 'status@broadcast') return;

            // View (mark as read) — only when auto-view is on
            if (viewOn) {
                try {
                    await sock.readMessages([key]);
                } catch (err) {
                    if (err.message?.includes('rate-overlimit')) {
                        await new Promise(r => setTimeout(r, 2000));
                        try { await sock.readMessages([key]); } catch (_) {}
                    }
                }
            }

            // React — only when autostatusreact is on
            if (reactOn) await reactToStatus(sock, key);

            // Reply — only when autostatusreply is on
            if (replyOn) await sendStatusReply(sock, participant || key.participant);
        }

        // Case 1: messages array (from messages.upsert)
        if (status.messages && status.messages.length > 0) {
            for (const msg of status.messages) {
                await processKey(msg.key, msg.key?.participant);
            }
            return;
        }

        // Case 2: direct status key
        if (status.key?.remoteJid === 'status@broadcast') {
            await processKey(status.key, status.key?.participant);
            return;
        }

        // Case 3: reaction object
        if (status.reaction?.key?.remoteJid === 'status@broadcast') {
            if (viewOn) { try { await sock.readMessages([status.reaction.key]); } catch (_) {} }
            if (reactOn) await reactToStatus(sock, status.reaction.key);
        }

    } catch (err) {
        console.error('❌ Error in auto status handler:', err.message);
    }
}

// ── Owner command handler ─────────────────────────────────────────────────────
async function autoStatusCommand(sock, chatId, msg, args) {
    try {
        const { isSudo } = require('../lib/index');
        const senderId    = msg.key.participant || msg.key.remoteJid;
        const isOwner     = msg.key.fromMe || (await isSudo(senderId));

        if (!isOwner) {
            return await sock.sendMessage(chatId, {
                text: '❌ This command can only be used by the owner!',
                ...channelInfo
            }, { quoted: msg });
        }

        let config = getConfig();

        if (!args || args.length === 0) {
            const emojis = config.customEmojis || defaultEmojis;
            return await sock.sendMessage(chatId, {
                text: `⚙️ *AUTO STATUS SETTING*\n\n📱 *Auto Status View:* ${config.enabled !== false ? 'ON' : 'OFF'}\n💫 *Status Reactions:* ${config.reactOn !== false ? 'ON' : 'OFF'}\n🎭 *Reaction Emojis:* ${emojis.join(' ')}\n\n*👨‍🔧 COMMANDS:*\n 🔸autostatus on — Enable auto view\n 🔸autostatus off — Disable auto view\n 🔸autostatus react on — Enable reactions\n 🔸autostatus react off — Disable reactions\n 🔸autostatus emoji add <emoji> — Add emoji\n 🔸autostatus emoji remove <emoji> — Remove emoji\n 🔸autostatus emoji list — Show emojis\n 🔸autostatus emoji reset — Reset emojis`,
                ...channelInfo
            }, { quoted: msg });
        }

        const command = args[0].toLowerCase();

        if (command === 'on') {
            config.enabled = true;
            _saveConfig(config);
            return await sock.sendMessage(chatId, {
                text: '✅ Auto status view *enabled!*\nBot will automatically view and react to all statuses.',
                ...channelInfo
            }, { quoted: msg });
        }

        if (command === 'off') {
            config.enabled = false;
            _saveConfig(config);
            return await sock.sendMessage(chatId, {
                text: '❌ Auto status view *disabled!*',
                ...channelInfo
            }, { quoted: msg });
        }

        if (command === 'reply') {
            const sub = args[1]?.toLowerCase();
            if (!sub) {
                const current = isStatusReplyEnabled() ? 'on' : 'off';
                return await sock.sendMessage(chatId, {
                    text: `📩 *Status Reply* is currently *${current}*\n\nUse: *.autostatus reply on/off*`,
                    ...channelInfo
                }, { quoted: msg });
            }
            if (sub === 'on' || sub === 'off') {
                try {
                    const { setConfig } = require('../lib/configdb');
                    setConfig('AUTOSTATUSREPLY', sub === 'on' ? 'true' : 'false');
                } catch (_) {}
                return await sock.sendMessage(chatId, {
                    text: sub === 'on'
                        ? '📩 Status reply *enabled!*\nBot will send a message to each status poster.'
                        : '❌ Status reply *disabled!*',
                    ...channelInfo
                }, { quoted: msg });
            }
        }

        if (command === 'react') {
            const sub = args[1]?.toLowerCase();
            if (!sub) {
                return await sock.sendMessage(chatId, {
                    text: '❌ Use: .autostatus react on/off',
                    ...channelInfo
                }, { quoted: msg });
            }
            if (sub === 'on') {
                config.reactOn = true;
                _saveConfig(config);
                return await sock.sendMessage(chatId, {
                    text: '💫 Status reactions *enabled!*\nBot will instantly react to every new status.',
                    ...channelInfo
                }, { quoted: msg });
            }
            if (sub === 'off') {
                config.reactOn = false;
                _saveConfig(config);
                return await sock.sendMessage(chatId, {
                    text: '❌ Status reactions *disabled!*',
                    ...channelInfo
                }, { quoted: msg });
            }
        }

        if (command === 'emoji') {
            const sub   = args[1]?.toLowerCase();
            const emoji = args[2];
            config.customEmojis = config.customEmojis || [...defaultEmojis];

            if (sub === 'list') {
                return await sock.sendMessage(chatId, {
                    text: `📋 *Reaction emojis:*\n\n${config.customEmojis.join(' ')}\n\nTotal: ${config.customEmojis.length}`,
                    ...channelInfo
                }, { quoted: msg });
            }
            if (sub === 'reset') {
                config.customEmojis = [...defaultEmojis];
                _saveConfig(config);
                return await sock.sendMessage(chatId, {
                    text: `✅ Emojis reset to default!\n${defaultEmojis.join(' ')}`,
                    ...channelInfo
                }, { quoted: msg });
            }
            if (sub === 'add') {
                if (!emoji || !/\p{Emoji}/u.test(emoji)) {
                    return await sock.sendMessage(chatId, { text: '❌ Provide a valid emoji. Example: .autostatus emoji add 🎉', ...channelInfo }, { quoted: msg });
                }
                if (config.customEmojis.includes(emoji)) {
                    return await sock.sendMessage(chatId, { text: `❌ ${emoji} is already in the list!`, ...channelInfo }, { quoted: msg });
                }
                config.customEmojis.push(emoji);
                _saveConfig(config);
                return await sock.sendMessage(chatId, {
                    text: `✅ Added ${emoji}!\nCurrent emojis: ${config.customEmojis.join(' ')}`,
                    ...channelInfo
                }, { quoted: msg });
            }
            if (sub === 'remove') {
                if (!emoji) {
                    return await sock.sendMessage(chatId, { text: '❌ Provide an emoji to remove. Example: .autostatus emoji remove 🎉', ...channelInfo }, { quoted: msg });
                }
                const idx = config.customEmojis.indexOf(emoji);
                if (idx === -1) {
                    return await sock.sendMessage(chatId, { text: `❌ ${emoji} not found in the list!`, ...channelInfo }, { quoted: msg });
                }
                config.customEmojis.splice(idx, 1);
                _saveConfig(config);
                return await sock.sendMessage(chatId, {
                    text: `✅ Removed ${emoji}!\nCurrent emojis: ${config.customEmojis.join(' ')}`,
                    ...channelInfo
                }, { quoted: msg });
            }
        }

        await sock.sendMessage(chatId, {
            text: '❌ Invalid command! Use .autostatus for help.',
            ...channelInfo
        }, { quoted: msg });

    } catch (err) {
        console.error('Error in autostatus command:', err);
        await sock.sendMessage(chatId, {
            text: '❌ Error: ' + err.message,
            ...channelInfo
        }, { quoted: msg });
    }
}

module.exports = { autoStatusCommand, handleStatusUpdate, isStatusReplyEnabled, isAutoStatusEnabled, isStatusReactionEnabled };
