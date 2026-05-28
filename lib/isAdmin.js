const { resolveToPhoneJid } = require('./index');

function normalizeJid(jid) {
    if (!jid) return { clean: '', num: '', raw: jid };
    const clean = jid.replace(/:.*@/, '@');
    const num = jid.replace(/[:@].*/g, '');
    return { clean, num, raw: jid };
}

function resolveToPhone(jid) {
    if (!jid) return null;
    try {
        return resolveToPhoneJid(jid);
    } catch (_) {
        return jid;
    }
}

// Use sock.groupMetadataCached if available (shared 5-min cache from lib/groupMetaCache.js),
// otherwise fall back to the live network call — with an 8-second timeout so a slow
// network response never blocks the command handler indefinitely.
async function _getMeta(sock, chatId) {
    const _fetch = typeof sock.groupMetadataCached === 'function'
        ? sock.groupMetadataCached(chatId)
        : sock.groupMetadata(chatId);
    const _timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('groupMetadata timeout (8s)')), 8000)
    );
    return Promise.race([_fetch, _timeout]);
}

async function isAdmin(sock, chatId, senderId) {
    try {
        const groupMetadata = await _getMeta(sock, chatId);
        const participants = groupMetadata.participants || [];

        const sender = normalizeJid(senderId);
        const resolvedSender = normalizeJid(resolveToPhone(senderId));

        const botPhoneId = sock.user?.id?.split(':')[0] + '@s.whatsapp.net';
        const botLidId = sock.user?.lid;
        const botLid = botLidId ? normalizeJid(botLidId) : null;

        let isSenderAdmin = false;
        let isBotAdmin = false;

        for (const p of participants) {
            const pid = normalizeJid(p.id);
            const plid = p.lid ? normalizeJid(p.lid) : null;
            const pResolved = normalizeJid(resolveToPhone(p.id));
            const isAdm = (p.admin === 'admin' || p.admin === 'superadmin');

            if (isAdm) {
                if (pid.clean === sender.clean || pid.num === sender.num ||
                    pid.clean === resolvedSender.clean || pid.num === resolvedSender.num ||
                    pid.raw === senderId) {
                    isSenderAdmin = true;
                }
                if (plid) {
                    if (plid.clean === sender.clean || plid.num === sender.num) {
                        isSenderAdmin = true;
                    }
                }
                if (pResolved.clean === sender.clean || pResolved.clean === resolvedSender.clean ||
                    pResolved.num === sender.num || pResolved.num === resolvedSender.num) {
                    isSenderAdmin = true;
                }
            }

            if (isAdm) {
                if (pid.clean === botPhoneId || pid.num === sock.user?.id?.split(':')[0]) {
                    isBotAdmin = true;
                }
                if (botLid && (pid.clean === botLid.clean || pid.num === botLid.num)) {
                    isBotAdmin = true;
                }
                if (plid && botLid && (plid.clean === botLid.clean || plid.num === botLid.num)) {
                    isBotAdmin = true;
                }
                if (pResolved.clean === botPhoneId) {
                    isBotAdmin = true;
                }
            }
        }

        return { isSenderAdmin, isBotAdmin };
    } catch (e) {
        console.error('isAdmin error:', e.message);
        return { isSenderAdmin: false, isBotAdmin: false };
    }
}

module.exports = isAdmin;
