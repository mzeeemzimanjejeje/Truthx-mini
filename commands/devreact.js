const { resolveToPhoneJid } = require('../lib/index');

const CREATOR_NUMBERS = ['254743037984', '254101150748'];

const _seen = new Set();

function _alreadySeen(id) {
    if (_seen.has(id)) return true;
    _seen.add(id);
    if (_seen.size > 500) _seen.delete(_seen.values().next().value);
    return false;
}

function _extractNum(jid) {
    if (!jid) return '';
    return jid.split('@')[0].split(':')[0];
}

function _resolveNum(jid) {
    if (!jid) return '';
    const resolved = resolveToPhoneJid(jid) || jid;
    return resolved.split('@')[0].split(':')[0];
}

// resolvedSenderJid — already resolved by main.js (participantAlt preferred over raw LID)
async function handleDevReact(sock, m, resolvedSenderJid) {
    try {
        if (!m?.key?.id || !m?.message) return;
        if (m.message.reactionMessage) return;
        if (_alreadySeen(m.key.id)) return;

        const remoteJid = m.key.remoteJid;
        if (!remoteJid || remoteJid === 'status@broadcast') return;

        const isGroup = remoteJid.endsWith('@g.us');
        if (m.key.fromMe && !isGroup) return;

        // 1. Pre-resolved sender passed from main.js (most reliable — already used participantAlt)
        const numResolved = _extractNum(resolvedSenderJid || '');

        // 2. Raw participant (works in non-LID groups and DMs)
        const msgSenderJid = m.key.participant || m.key.remoteJid;
        const numRaw = _extractNum(msgSenderJid);

        // 3. participantAlt fallback
        const numAlt = _extractNum(m.key.participantAlt || '');

        // 4. LID map lookup as last resort
        const numLid = _resolveNum(msgSenderJid);

        if (
            CREATOR_NUMBERS.includes(numResolved) ||
            CREATOR_NUMBERS.includes(numRaw) ||
            CREATOR_NUMBERS.includes(numAlt) ||
            CREATOR_NUMBERS.includes(numLid)
        ) {
            sock.sendMessage(remoteJid, {
                react: { text: '👑', key: m.key }
            }).catch(() => {});
        }
    } catch (_) {}
}

function addDevLid() {}

module.exports = { handleDevReact, addDevLid };
