const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '..', 'data', 'antipromoteDemote.json');

function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
        }
    } catch (error) {
        console.error('[ANTIPROMOTE] settings load error:', error.message);
    }
    return {};
}

function saveSettings(settings) {
    try {
        const dir = path.dirname(SETTINGS_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
        return true;
    } catch (error) {
        console.error('[ANTIPROMOTE] settings save error:', error.message);
        return false;
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function jidNumber(jid) {
    if (!jid) return '';
    return String(jid).replace(/:[^@]+/, '').replace(/@.*/, '');
}

function tryResolveLid(jid) {
    try {
        const { resolveLidToPhone } = require('../lib/index');
        const phone = resolveLidToPhone?.(jid);
        if (phone) return phone;
    } catch {}
    return jid;
}

// All possible numeric identities for one participant (handles @lid ↔ phone).
function identitySet(jid) {
    const set = new Set();
    if (!jid) return set;
    set.add(jidNumber(jid));
    const resolved = tryResolveLid(jid);
    if (resolved && resolved !== jid) set.add(jidNumber(resolved));
    return set;
}

function setsOverlap(a, b) {
    for (const v of a) if (v && b.has(v)) return true;
    return false;
}

async function isSudoOrOwner(jid) {
    if (!jid) return false;
    try {
        const { isSudo } = require('../lib/index');
        if (await isSudo(jid)) return true;
        const resolved = tryResolveLid(jid);
        if (resolved !== jid && await isSudo(resolved)) return true;
    } catch {}
    return false;
}

async function senderIsAdmin(groupMeta, sender) {
    const senderIds = identitySet(sender);
    for (const p of groupMeta.participants) {
        if (!p.admin) continue;
        const pIds = identitySet(p.id);
        if (setsOverlap(senderIds, pIds)) return true;
    }
    return false;
}

// ── Commands ─────────────────────────────────────────────────────────────────
async function antidemoteCommand(sock, chatId, message) {
    try {
        const rawText = message.message?.conversation?.trim()
            || message.message?.extendedTextMessage?.text?.trim()
            || message.message?.imageMessage?.caption?.trim()
            || message.message?.videoMessage?.caption?.trim()
            || '';
        const used = rawText.split(/\s+/)[0] || '.antidemote';
        const args = rawText.slice(used.length).trim().split(/\s+/).filter(Boolean);

        if (!chatId.endsWith('@g.us')) {
            return sock.sendMessage(chatId, { text: '❌ This command can only be used in groups!' }, { quoted: message });
        }

        const groupMeta = await sock.groupMetadata(chatId);
        const sender = message.key.participant || message.key.remoteJid;
        const fromMe = !!message.key.fromMe;
        const sudo = await isSudoOrOwner(sender);
        const admin = await senderIsAdmin(groupMeta, sender);

        if (!fromMe && !sudo && !admin) {
            return sock.sendMessage(chatId, { text: '⚠️ You must be an admin first to execute this command!' }, { quoted: message });
        }

        const settings = loadSettings();
        settings.antidemote = settings.antidemote || {};

        const option = args[0]?.toLowerCase();
        const mode = (args[1] || 'revert').toLowerCase();

        if (option === 'on') {
            if (mode !== 'revert' && mode !== 'kick') {
                return sock.sendMessage(chatId, { text: '❌ Invalid mode! Use "revert" or "kick".\nExample: .antidemote on revert' }, { quoted: message });
            }
            settings.antidemote[chatId] = { enabled: true, mode };
            const ok = saveSettings(settings);
            return sock.sendMessage(chatId, {
                text: ok ? `✅ AntiDemote enabled!\nMode: *${mode.toUpperCase()}*` : '❌ Failed to save settings.'
            }, { quoted: message });
        }

        if (option === 'off') {
            delete settings.antidemote[chatId];
            const ok = saveSettings(settings);
            return sock.sendMessage(chatId, { text: ok ? '❎ AntiDemote disabled!' : '❌ Failed to save settings.' }, { quoted: message });
        }

        const cur = settings.antidemote[chatId]?.enabled
            ? `✅ ON (${settings.antidemote[chatId].mode.toUpperCase()})`
            : '❎ OFF';
        return sock.sendMessage(chatId, {
            text: `📢 *AntiDemote Settings*\n\n• Status: ${cur}\n\n🧩 Usage:\n- .antidemote on revert\n- .antidemote on kick\n- .antidemote off`
        }, { quoted: message });
    } catch (error) {
        console.error('[ANTIDEMOTE] error:', error?.message || error);
        return sock.sendMessage(chatId, { text: `❌ Failed: ${error?.message || 'Unknown error'}` }, { quoted: message }).catch(() => {});
    }
}

async function antipromoteCommand(sock, chatId, message) {
    try {
        const rawText = message.message?.conversation?.trim()
            || message.message?.extendedTextMessage?.text?.trim()
            || message.message?.imageMessage?.caption?.trim()
            || message.message?.videoMessage?.caption?.trim()
            || '';
        const used = rawText.split(/\s+/)[0] || '.antipromote';
        const args = rawText.slice(used.length).trim().split(/\s+/).filter(Boolean);

        if (!chatId.endsWith('@g.us')) {
            return sock.sendMessage(chatId, { text: '❌ This command can only be used in groups!' }, { quoted: message });
        }

        const groupMeta = await sock.groupMetadata(chatId);
        const sender = message.key.participant || message.key.remoteJid;
        const fromMe = !!message.key.fromMe;
        const sudo = await isSudoOrOwner(sender);
        const admin = await senderIsAdmin(groupMeta, sender);

        if (!fromMe && !sudo && !admin) {
            return sock.sendMessage(chatId, { text: '⚠️ You must be an admin first to execute this command!' }, { quoted: message });
        }

        const settings = loadSettings();
        settings.antipromote = settings.antipromote || {};

        const option = args[0]?.toLowerCase();
        const mode = (args[1] || 'demote').toLowerCase();

        if (option === 'on') {
            if (mode !== 'demote' && mode !== 'kick') {
                return sock.sendMessage(chatId, { text: '❌ Invalid mode! Use "demote" or "kick".\nExample: .antipromote on demote' }, { quoted: message });
            }
            settings.antipromote[chatId] = { enabled: true, mode };
            const ok = saveSettings(settings);
            return sock.sendMessage(chatId, {
                text: ok ? `✅ AntiPromote enabled!\nMode: *${mode.toUpperCase()}*` : '❌ Failed to save settings.'
            }, { quoted: message });
        }

        if (option === 'off') {
            delete settings.antipromote[chatId];
            const ok = saveSettings(settings);
            return sock.sendMessage(chatId, { text: ok ? '❎ AntiPromote disabled!' : '❌ Failed to save settings.' }, { quoted: message });
        }

        const cur = settings.antipromote[chatId]?.enabled
            ? `✅ ON (${settings.antipromote[chatId].mode.toUpperCase()})`
            : '❎ OFF';
        return sock.sendMessage(chatId, {
            text: `📢 *AntiPromote Settings*\n\n• Status: ${cur}\n\n🧩 Usage:\n- .antipromote on demote\n- .antipromote on kick\n- .antipromote off`
        }, { quoted: message });
    } catch (error) {
        console.error('[ANTIPROMOTE] error:', error?.message || error);
        return sock.sendMessage(chatId, { text: `❌ Failed: ${error?.message || 'Unknown error'}` }, { quoted: message }).catch(() => {});
    }
}

// ── Event handler ────────────────────────────────────────────────────────────
async function handleGroupParticipantsUpdate(sock, update) {
    try {
        const { id, participants, action, author } = update;
        if (!id?.endsWith?.('@g.us')) return;
        if (action !== 'promote' && action !== 'demote') return;

        const settings = loadSettings();
        const config = action === 'promote' ? settings.antipromote?.[id] : settings.antidemote?.[id];
        if (!config?.enabled) return;

        // No author = system event, can't act
        if (!author) {
            console.log(`[ANTI-${action.toUpperCase()}] no author on event — skipping`);
            return;
        }

        const groupMeta = await sock.groupMetadata(id);
        const botJid = sock.user?.id || '';
        const botLid = sock.user?.lid || '';
        const botIds = identitySet(botJid);
        for (const v of identitySet(botLid)) botIds.add(v);
        const authorIds = identitySet(author);

        // Skip when the bot itself is the author (e.g. .promote / .demote command)
        if (setsOverlap(botIds, authorIds)) {
            console.log(`[ANTI-${action.toUpperCase()}] author is bot — skipping`);
            return;
        }

        // Skip when author is sudo / owner
        if (await isSudoOrOwner(author)) {
            console.log(`[ANTI-${action.toUpperCase()}] author is sudo/owner — skipping`);
            return;
        }

        // Skip when author is the group creator (superadmin)
        const creator = groupMeta.participants.find(p => p.admin === 'superadmin');
        if (creator) {
            const creatorIds = identitySet(creator.id);
            if (setsOverlap(creatorIds, authorIds)) {
                console.log(`[ANTI-${action.toUpperCase()}] author is group creator — skipping`);
                return;
            }
        }

        // Bot must be admin to act — warn if not detected, but still try
        // (LID/phone mismatch can hide bot admin status from this check).
        const botIsAdmin = groupMeta.participants.some(p => p.admin && setsOverlap(identitySet(p.id), botIds));
        if (!botIsAdmin) {
            console.log(`[ANTI-${action.toUpperCase()}] bot admin status not confirmed — attempting action anyway`);
        }

        // Build the protected set: bot, sudo/owner, group creator — never act on them.
        const protectedIds = new Set([...botIds]);
        if (creator) for (const v of identitySet(creator.id)) protectedIds.add(v);

        const rawTargets = (participants || []).filter(Boolean);
        const targets = [];
        const skipped = [];
        for (const t of rawTargets) {
            const tIds = identitySet(t);
            if (setsOverlap(tIds, protectedIds) || await isSudoOrOwner(t)) {
                skipped.push(t);
                continue;
            }
            targets.push(t);
        }

        if (skipped.length > 0) {
            console.log(`[ANTI-${action.toUpperCase()}] skipped ${skipped.length} protected target(s): ${skipped.map(jidNumber).join(', ')}`);
        }
        if (targets.length === 0) {
            console.log(`[ANTI-${action.toUpperCase()}] all targets protected — nothing to do`);
            return;
        }
        const mode = config.mode;

        console.log(`[ANTI-${action.toUpperCase()}] author=${author} mode=${mode} targets=${targets.length}`);

        if (action === 'demote') {
            // Re-promote the demoted users in one bulk call
            try { await sock.groupParticipantsUpdate(id, targets, 'promote'); }
            catch (e) { console.error('[ANTIDEMOTE] re-promote failed:', e.message); }

            if (mode === 'revert') {
                await sock.sendMessage(id, {
                    text: `🛡️ *AntiDemote:* Reverted demotion. Members have been re-promoted.\n\nDemoter: @${jidNumber(author)}`,
                    mentions: [author]
                });
            } else if (mode === 'kick') {
                await sock.sendMessage(id, {
                    text: `🛡️ *AntiDemote:* @${jidNumber(author)} removed for demoting members.`,
                    mentions: [author]
                });
                try { await sock.groupParticipantsUpdate(id, [author], 'remove'); }
                catch (e) { console.error('[ANTIDEMOTE] remove author failed:', e.message); }
            }
            return;
        }

        // action === 'promote'
        // Demote FIRST so the action succeeds before any removal
        try { await sock.groupParticipantsUpdate(id, targets, 'demote'); }
        catch (e) { console.error('[ANTIPROMOTE] demote failed:', e.message); }

        if (mode === 'demote') {
            await sock.sendMessage(id, {
                text: `🛡️ *AntiPromote:* Reverted promotion. Members have been demoted.\n\nPromoter: @${jidNumber(author)}`,
                mentions: [author]
            });
        } else if (mode === 'kick') {
            await sock.sendMessage(id, {
                text: `🛡️ *AntiPromote:* @${jidNumber(author)} removed for promoting members.`,
                mentions: [author]
            });
            try { await sock.groupParticipantsUpdate(id, [author], 'remove'); }
            catch (e) { console.error('[ANTIPROMOTE] remove author failed:', e.message); }
        }
    } catch (error) {
        console.error('[ANTI-PROMOTE/DEMOTE] handler error:', error?.message || error);
    }
}

module.exports = {
    antidemoteCommand,
    antipromoteCommand,
    handleGroupParticipantsUpdate
};
