const fs = require('fs');
const path = require('path');

const BADWORD_FILE = path.join(__dirname, '..', 'data', 'antibadword.json');
const DEFAULT_WARN_LIMIT = 3;

function loadBadwords() {
    try {
        if (fs.existsSync(BADWORD_FILE)) {
            return JSON.parse(fs.readFileSync(BADWORD_FILE, 'utf-8'));
        }
    } catch (e) {
        console.error('Error loading badwords:', e.message);
    }
    return {};
}

function saveBadwords(data) {
    try {
        const dir = path.dirname(BADWORD_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(BADWORD_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving badwords:', e.message);
    }
}

function ensureGroup(data, chatId) {
    if (!data[chatId]) {
        data[chatId] = {
            enabled: false,
            words: [],
            action: 'warn',
            warnLimit: DEFAULT_WARN_LIMIT,
            warnings: {}
        };
    }
    if (typeof data[chatId].warnLimit !== 'number') data[chatId].warnLimit = DEFAULT_WARN_LIMIT;
    if (!data[chatId].warnings || typeof data[chatId].warnings !== 'object') data[chatId].warnings = {};
    if (!Array.isArray(data[chatId].words)) data[chatId].words = [];
    return data[chatId];
}

async function handleAntiBadwordCommand(sock, chatId, message, match) {
    try {
        const data = loadBadwords();

        if (!match) {
            const groupData = ensureGroup(data, chatId);
            const wordList = groupData.words.length > 0 ? groupData.words.join(', ') : 'None';
            const text = `*ANTI BAD WORD SETTINGS*\n\n` +
                `Status: ${groupData.enabled ? '🟢 ON' : '🔴 OFF'}\n` +
                `Action: ${groupData.action}\n` +
                `Warning limit: ${groupData.warnLimit} (kicks after ${groupData.warnLimit} warnings)\n` +
                `Words: ${wordList}\n\n` +
                `Commands:\n` +
                `• .antibadword on/off\n` +
                `• .antibadword add <word>\n` +
                `• .antibadword remove <word>\n` +
                `• .antibadword set delete/warn/kick\n` +
                `• .antibadword set warnings <number>\n` +
                `• .antibadword warnings [@user]\n` +
                `• .antibadword resetwarn [@user]\n` +
                `• .antibadword list\n` +
                `• .antibadword reset`;
            await sock.sendMessage(chatId, { text }, { quoted: message });
            return;
        }

        const args = match.trim().split(/\s+/);
        const action = args[0]?.toLowerCase();
        const groupData = ensureGroup(data, chatId);

        switch (action) {
            case 'on':
                groupData.enabled = true;
                saveBadwords(data);
                await sock.sendMessage(chatId, { text: '✅ Anti bad word has been *enabled*.' }, { quoted: message });
                break;

            case 'off':
                groupData.enabled = false;
                saveBadwords(data);
                await sock.sendMessage(chatId, { text: '✅ Anti bad word has been *disabled*.' }, { quoted: message });
                break;

            case 'add': {
                const word = args.slice(1).join(' ').toLowerCase().trim();
                if (!word) {
                    await sock.sendMessage(chatId, { text: '❌ Please specify a word to add.' }, { quoted: message });
                    return;
                }
                if (!groupData.words.includes(word)) {
                    groupData.words.push(word);
                    saveBadwords(data);
                    await sock.sendMessage(chatId, { text: `✅ Added "${word}" to bad words list.` }, { quoted: message });
                } else {
                    await sock.sendMessage(chatId, { text: `"${word}" is already in the list.` }, { quoted: message });
                }
                break;
            }

            case 'remove':
            case 'del': {
                const word = args.slice(1).join(' ').toLowerCase().trim();
                if (!word) {
                    await sock.sendMessage(chatId, { text: '❌ Please specify a word to remove.' }, { quoted: message });
                    return;
                }
                const idx = groupData.words.indexOf(word);
                if (idx !== -1) {
                    groupData.words.splice(idx, 1);
                    saveBadwords(data);
                    await sock.sendMessage(chatId, { text: `✅ Removed "${word}" from bad words list.` }, { quoted: message });
                } else {
                    await sock.sendMessage(chatId, { text: `"${word}" is not in the list.` }, { quoted: message });
                }
                break;
            }

            case 'set': {
                const setAction = args[1]?.toLowerCase();

                // .antibadword set warnings <N>
                if (setAction === 'warnings' || setAction === 'warning' || setAction === 'limit') {
                    const n = parseInt(args[2], 10);
                    if (!Number.isFinite(n) || n < 1 || n > 100) {
                        await sock.sendMessage(chatId, {
                            text: `❌ Invalid number. Set a value between 1 and 100.\nExample: .antibadword set warnings 3`
                        }, { quoted: message });
                        return;
                    }
                    groupData.warnLimit = n;
                    saveBadwords(data);
                    await sock.sendMessage(chatId, {
                        text: `✅ Warning limit set to *${n}*. Users will be removed after ${n} warning(s).`
                    }, { quoted: message });
                    return;
                }

                if (!['delete', 'warn', 'kick'].includes(setAction)) {
                    await sock.sendMessage(chatId, {
                        text: '❌ Invalid action. Use: delete, warn, kick, or warnings <N>'
                    }, { quoted: message });
                    return;
                }
                groupData.action = setAction;
                saveBadwords(data);
                await sock.sendMessage(chatId, { text: `✅ Action set to *${setAction}*.` }, { quoted: message });
                break;
            }

            case 'warnings':
            case 'warning': {
                // .antibadword warnings  → list everyone with warnings
                // .antibadword warnings @user (or reply) → show one user
                const targetJid = extractTarget(message, args.slice(1).join(' '));
                if (targetJid) {
                    const count = groupData.warnings[targetJid] || 0;
                    await sock.sendMessage(chatId, {
                        text: `⚠️ @${targetJid.split('@')[0]} has *${count}/${groupData.warnLimit}* warning(s).`,
                        mentions: [targetJid]
                    }, { quoted: message });
                } else {
                    const entries = Object.entries(groupData.warnings).filter(([, v]) => v > 0);
                    if (entries.length === 0) {
                        await sock.sendMessage(chatId, { text: 'No warnings recorded for this group.' }, { quoted: message });
                    } else {
                        const lines = entries.map(([jid, n]) => `• @${jid.split('@')[0]} — ${n}/${groupData.warnLimit}`);
                        await sock.sendMessage(chatId, {
                            text: `*Bad-word warnings:*\n${lines.join('\n')}`,
                            mentions: entries.map(([jid]) => jid)
                        }, { quoted: message });
                    }
                }
                break;
            }

            case 'resetwarn':
            case 'clearwarn': {
                const targetJid = extractTarget(message, args.slice(1).join(' '));
                if (targetJid) {
                    delete groupData.warnings[targetJid];
                    saveBadwords(data);
                    await sock.sendMessage(chatId, {
                        text: `✅ Cleared warnings for @${targetJid.split('@')[0]}.`,
                        mentions: [targetJid]
                    }, { quoted: message });
                } else {
                    groupData.warnings = {};
                    saveBadwords(data);
                    await sock.sendMessage(chatId, { text: '✅ Cleared all bad-word warnings for this group.' }, { quoted: message });
                }
                break;
            }

            case 'list': {
                const words = groupData.words || [];
                if (words.length === 0) {
                    await sock.sendMessage(chatId, { text: 'No bad words set for this group.' }, { quoted: message });
                } else {
                    await sock.sendMessage(chatId, { text: `*Bad Words:*\n${words.map((w, i) => `${i + 1}. ${w}`).join('\n')}` }, { quoted: message });
                }
                break;
            }

            case 'reset':
                data[chatId] = {
                    enabled: false, words: [], action: 'warn',
                    warnLimit: DEFAULT_WARN_LIMIT, warnings: {}
                };
                saveBadwords(data);
                await sock.sendMessage(chatId, { text: '✅ Anti bad word settings reset.' }, { quoted: message });
                break;

            default:
                await sock.sendMessage(chatId, { text: '❌ Unknown command. Use .antibadword for help.' }, { quoted: message });
        }
    } catch (e) {
        console.error('handleAntiBadwordCommand error:', e.message);
        await sock.sendMessage(chatId, { text: '❌ Error processing anti bad word command.' }, { quoted: message });
    }
}

function extractTarget(message, textArg) {
    // mention
    const ctx = message.message?.extendedTextMessage?.contextInfo;
    const mentioned = ctx?.mentionedJid?.[0];
    if (mentioned) return mentioned;
    // reply
    if (ctx?.participant) return ctx.participant;
    // raw number arg
    const digits = (textArg || '').replace(/\D/g, '');
    if (digits.length >= 6) return `${digits}@s.whatsapp.net`;
    return null;
}

async function handleBadwordDetection(sock, chatId, message, userMessage, senderId) {
    try {
        const data = loadBadwords();
        const groupData = data[chatId];
        if (!groupData || !groupData.enabled || !groupData.words || groupData.words.length === 0) return;

        if (message.key.fromMe) return;
        const { isSudo } = require('./index');
        if (await isSudo(senderId)) return;

        const _getMeta = typeof sock.groupMetadataCached === 'function' ? sock.groupMetadataCached : sock.groupMetadata.bind(sock);
        const groupMetadata = await _getMeta(chatId).catch(() => null);
        if (!groupMetadata) return;

        const lowerMsg = (userMessage || '').toLowerCase();
        const detected = groupData.words.find(w => lowerMsg.includes(w));
        if (!detected) return;

        const action = groupData.action || 'warn';
        const warnLimit = groupData.warnLimit || DEFAULT_WARN_LIMIT;

        // Always delete the offending message first
        try {
            await sock.sendMessage(chatId, {
                delete: {
                    remoteJid: chatId,
                    fromMe: false,
                    id: message.key.id,
                    participant: senderId
                }
            });
        } catch (_) {}

        if (action === 'delete') return;

        if (action === 'kick') {
            try {
                await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
                await sock.sendMessage(chatId, {
                    text: `🚫 @${senderId.split('@')[0]} has been removed for using bad words.`,
                    mentions: [senderId]
                });
            } catch (e) {
                console.error('Failed to kick user for bad word:', e.message);
            }
            return;
        }

        // action === 'warn' — increment warning count, kick at limit
        if (!groupData.warnings) groupData.warnings = {};
        const current = (groupData.warnings[senderId] || 0) + 1;
        groupData.warnings[senderId] = current;
        saveBadwords(data);

        if (current >= warnLimit) {
            await sock.sendMessage(chatId, {
                text: `🚫 @${senderId.split('@')[0]} reached *${current}/${warnLimit}* warnings — removed for using bad words.`,
                mentions: [senderId]
            });
            try {
                await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
                delete groupData.warnings[senderId];
                saveBadwords(data);
            } catch (e) {
                console.error('Failed to kick user after warn limit:', e.message);
            }
        } else {
            await sock.sendMessage(chatId, {
                text: `⚠️ @${senderId.split('@')[0]}, bad words are not allowed!\nWarning *${current}/${warnLimit}* — you'll be removed at ${warnLimit}.`,
                mentions: [senderId]
            });
        }
    } catch (e) {
        console.error('handleBadwordDetection error:', e.message);
    }
}

module.exports = { handleAntiBadwordCommand, handleBadwordDetection };
