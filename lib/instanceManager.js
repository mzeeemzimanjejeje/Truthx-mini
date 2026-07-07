const { useUserAuthState, upsertUserStatus, getConnectedUsers } = require('./userAuthState');

const instances = new Map();

async function startInstance(phone, dbUrl) {
    const existing = instances.get(phone);
    if (existing) {
        if (existing.status === 'connected') return { alreadyConnected: true, phone };
        if (existing.status === 'pairing' || existing.status === 'connecting') {
            return { waiting: true, phone, pairingCode: existing.pairingCode };
        }
    }

    let baileys;
    try {
        baileys = require('@whiskeysockets/baileys');
    } catch (e) {
        const mod = await import('@whiskeysockets/baileys');
        baileys = mod.default || mod;
    }

    const {
        default: makeWASocket,
        DisconnectReason,
        fetchLatestBaileysVersion,
        makeCacheableSignalKeyStore,
    } = baileys;

    const NodeCache = require('node-cache');
    const pino = require('pino');

    const authState = await useUserAuthState(phone, dbUrl);
    const { state, saveCreds, alreadyHasCreds } = authState;

    const { version } = await fetchLatestBaileysVersion();
    const msgRetryCounterCache = new NodeCache();

    const logger = pino({ level: 'silent' });

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        browser: ['Mac OS', 'Chrome', '14.4.1'],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        msgRetryCounterCache,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
    });

    const instance = {
        sock,
        phone,
        status: alreadyHasCreds ? 'connecting' : 'pairing',
        pairingCode: null,
        connectedAt: null,
        startedAt: Date.now(),
        dbUrl,
    };
    instances.set(phone, instance);

    await upsertUserStatus(dbUrl, phone, instance.status);

    // Request pairing code on QR event (noise handshake complete), not on a fixed timer
    let pairingCodeRequested = false;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !alreadyHasCreds && !pairingCodeRequested) {
            pairingCodeRequested = true;
            try {
                if (!instances.has(phone)) return;
                const code = await sock.requestPairingCode(phone);
                const formatted = code?.match(/.{1,4}/g)?.join('-') || code;
                instance.pairingCode = formatted;
                console.log(`[InstanceManager] Pairing code for ${phone}: ${formatted}`);
            } catch (e) {
                console.error(`[InstanceManager] Pairing code error for ${phone}: ${e.message}`);
                pairingCodeRequested = false;
            }
        }

        if (connection === 'open') {
            instance.status = 'connected';
            instance.pairingCode = null;
            instance.connectedAt = Date.now();
            console.log(`[InstanceManager] ✅ ${phone} connected`);
            await upsertUserStatus(dbUrl, phone, 'connected');

            try {
                await sock.sendMessage(phone + '@s.whatsapp.net', {
                    text: `✅ *TRUTH-MD Bot Connected!*\n\nYour WhatsApp bot is now active and ready to use.\n\n` +
                          `📋 *Commands:* Send *.menu* to see all available commands.\n` +
                          `🔑 *Prefix:* . (dot)\n\n` +
                          `_Bot is running on TRUTH-MD platform_`
                });
            } catch (_) {}
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;
            const is515 = statusCode === 515;
            console.log(`[InstanceManager] ${phone} disconnected — loggedOut: ${isLoggedOut}, code: ${statusCode}`);

            if (is515 && instance.status === 'pairing') {
                console.log(`[InstanceManager] 515 restart required during pairing for ${phone} — reconnecting with same creds`);
                instance.status = 'reconnecting';
                await upsertUserStatus(dbUrl, phone, 'reconnecting');
                setTimeout(() => {
                    if (instances.get(phone)?.status === 'reconnecting') {
                        instances.delete(phone);
                        startInstance(phone, dbUrl).catch(e =>
                            console.error(`[InstanceManager] 515 reconnect failed for ${phone}:`, e.message)
                        );
                    }
                }, 2000);
                return;
            }

            if (isLoggedOut) {
                instance.status = 'disconnected';
                instances.delete(phone);
                await upsertUserStatus(dbUrl, phone, 'disconnected');
                try { await authState.clearAuth(); } catch (_) {}
            } else {
                instance.status = 'reconnecting';
                await upsertUserStatus(dbUrl, phone, 'reconnecting');
                const delay = Math.min(5000 + Math.random() * 3000, 15000);
                setTimeout(() => {
                    if (instances.get(phone)?.status === 'reconnecting') {
                        instances.delete(phone);
                        startInstance(phone, dbUrl).catch(e =>
                            console.error(`[InstanceManager] Reconnect failed for ${phone}:`, e.message)
                        );
                    }
                }, delay);
            }
        }
    });

    sock.ev.on('messages.upsert', async (update) => {
        try {
            const { handleMessages } = require('../main');
            await handleMessages(sock, update, false);
        } catch (e) {
            if (!e.message?.includes('FEATURE_DISABLED')) {
                console.error(`[${phone}] Message handler error:`, e.message);
            }
        }
    });

    sock.ev.on('group-participants.update', async (update) => {
        try {
            const { handleGroupParticipantUpdate } = require('../main');
            await handleGroupParticipantUpdate(sock, update);
        } catch (_) {}
    });

    sock.ev.on('messages.update', async (update) => {
        try {
            const { handleStatus } = require('../main');
            if (Array.isArray(update)) {
                for (const msg of update) {
                    if (msg.key?.remoteJid === 'status@broadcast') {
                        await handleStatus(sock, { messages: [msg], type: 'notify' });
                    }
                }
            }
        } catch (_) {}
    });

    return instance;
}

function getInstance(phone) {
    const inst = instances.get(phone);
    if (!inst) return null;
    return {
        phone: inst.phone,
        status: inst.status,
        pairingCode: inst.pairingCode,
        connectedAt: inst.connectedAt,
        startedAt: inst.startedAt,
    };
}

function listInstances() {
    const result = [];
    for (const [phone, inst] of instances) {
        result.push({
            phone,
            status: inst.status,
            connectedAt: inst.connectedAt,
            startedAt: inst.startedAt,
            hasPairingCode: !!inst.pairingCode,
        });
    }
    return result;
}

async function stopInstance(phone) {
    const inst = instances.get(phone);
    if (!inst) return false;
    try { inst.sock.end(new Error('Manually stopped')); } catch (_) {}
    instances.delete(phone);
    await upsertUserStatus(inst.dbUrl, phone, 'stopped');
    return true;
}

async function restoreInstances(dbUrl) {
    try {
        const users = await getConnectedUsers(dbUrl);
        console.log(`[InstanceManager] Restoring ${users.length} user instance(s)...`);
        for (const user of users) {
            try {
                await startInstance(user.phone, dbUrl);
                await new Promise(r => setTimeout(r, 2000));
            } catch (e) {
                console.error(`[InstanceManager] Failed to restore ${user.phone}:`, e.message);
            }
        }
    } catch (e) {
        console.error('[InstanceManager] restoreInstances error:', e.message);
    }
}

module.exports = { startInstance, getInstance, listInstances, stopInstance, restoreInstances };
