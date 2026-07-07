const { useUserAuthState, upsertUserStatus, getConnectedUsers } = require('./userAuthState');
const EventEmitter = require('events');

class MultiInstanceManager extends EventEmitter {
    constructor() {
        super();
        this.instances = new Map();
        this.maxSessions = parseInt(process.env.MAX_SESSIONS) || 100;
        this.dbUrl = process.env.DATABASE_URL || process.env.POSTGRESQL_URL;
        this.isRestoring = false;
        
        // Memory management: aggressive GC for low-RAM environments
        setInterval(() => this.cleanupMemory(), 10 * 60 * 1000); // Every 10 mins
    }

    cleanupMemory() {
        if (global.gc) {
            const before = process.memoryUsage().rss / 1024 / 1024;
            global.gc();
            const after = process.memoryUsage().rss / 1024 / 1024;
            console.log(`[Memory] GC run: ${before.toFixed(1)}MB -> ${after.toFixed(1)}MB`);
        }
        
        // Cleanup inactive instances that failed to reconnect for too long
        const now = Date.now();
        for (const [phone, inst] of this.instances) {
            if (inst.status === 'reconnecting' && inst.reconnectAttempts > 15) {
                console.log(`[InstanceManager] 🗑️ Removing dead instance ${phone} (too many retries)`);
                this.stopInstance(phone);
            }
        }
    }

    async stopInstance(phone) {
        const inst = this.instances.get(phone);
        if (!inst) return;
        try { inst.sock.end(); } catch (_) {}
        this.instances.delete(phone);
        this.emit('update', this.getStats());
    }

    async init() {
        if (!this.dbUrl) {
            console.error('[MultiInstanceManager] ❌ DATABASE_URL not found. Multi-tenant mode requires PostgreSQL.');
            return;
        }
        await this.restoreAll();
    }

    getStats() {
        const active = Array.from(this.instances.values()).filter(i => i.status === 'connected').length;
        const total = this.instances.size;
        return {
            active,
            total,
            max: this.maxSessions,
            remaining: Math.max(0, this.maxSessions - total),
            isFull: total >= this.maxSessions
        };
    }

    async startInstance(phone, options = {}) {
        if (this.instances.size >= this.maxSessions && !this.instances.has(phone)) {
            throw new Error('SERVER_FULL');
        }

        const existing = this.instances.get(phone);
        if (existing && existing.status === 'connected') {
            return { alreadyConnected: true, phone };
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

        const authState = await useUserAuthState(phone, this.dbUrl);
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
            retryRequestDelayMs: 5000,
        });

        const instance = {
            sock,
            phone,
            status: alreadyHasCreds ? 'connecting' : 'pairing',
            pairingCode: null,
            connectedAt: null,
            startedAt: Date.now(),
            reconnectAttempts: options.reconnectAttempts || 0,
        };

        this.instances.set(phone, instance);
        this.emit('update', this.getStats());
        await upsertUserStatus(this.dbUrl, phone, instance.status);

        // Request pairing code later on connection.update when QR is ready
        let pairingCodeRequested = false;

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr && !alreadyHasCreds && !options.isRestoring && !pairingCodeRequested) {
                pairingCodeRequested = true;
                try {
                    if (!this.instances.has(phone)) return;
                    const code = await sock.requestPairingCode(phone);
                    instance.pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
                    this.emit('update', this.getStats());
                    this.emit('pairingCode', { phone, code: instance.pairingCode });
                } catch (e) {
                    console.error(`[InstanceManager] Pairing error for ${phone}:`, e.message);
                    pairingCodeRequested = false;
                }
            }

            if (connection === 'open') {
                instance.status = 'connected';
                instance.pairingCode = null;
                instance.connectedAt = Date.now();
                instance.reconnectAttempts = 0;
                console.log(`[InstanceManager] ✅ ${phone} connected`);
                await upsertUserStatus(this.dbUrl, phone, 'connected');
                this.emit('update', this.getStats());
                
                // Optional: Send welcome message
                if (!options.isRestoring) {
                    try {
                        await sock.sendMessage(phone + '@s.whatsapp.net', {
                            text: `✅ *TRUTH-MD Bot Connected!*\n\nYour bot is now active.\n\n📋 *Commands:* Send *.menu*\n🔑 *Prefix:* .`
                        });
                    } catch (_) {}
                }
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;
                const is515 = statusCode === 515;
                const shouldReconnect = !isLoggedOut;
                
                console.log(`[InstanceManager] ${phone} disconnected. Reason: ${statusCode}, Reconnect: ${shouldReconnect}`);

                if (is515 && instance.status === 'pairing' && instance.reconnectAttempts < 3) {
                    console.log(`[InstanceManager] Reconnecting after 515 (restart required) to preserve pairing code for ${phone}`);
                    instance.status = 'reconnecting';
                    instance.reconnectAttempts++;
                    setTimeout(() => {
                        if (this.instances.get(phone)?.status === 'reconnecting') {
                            this.startInstance(phone, { isRestoring: true, reconnectAttempts: instance.reconnectAttempts }).catch(() => {});
                        }
                    }, 2000);
                    return;
                }

                if (!shouldReconnect) {
                    instance.status = 'logged_out';
                    this.instances.delete(phone);
                    await upsertUserStatus(this.dbUrl, phone, 'logged_out');
                    try { await authState.clearAuth(); } catch (_) {}
                    this.emit('update', this.getStats());
                } else {
                    instance.status = 'reconnecting';
                    await upsertUserStatus(this.dbUrl, phone, 'reconnecting');
                    this.emit('update', this.getStats());
                    
                    // Exponential backoff
                    const delay = Math.min(Math.pow(2, instance.reconnectAttempts) * 2000 + Math.random() * 1000, 60000);
                    instance.reconnectAttempts++;
                    
                    setTimeout(() => {
                        if (this.instances.get(phone)?.status === 'reconnecting') {
                            this.startInstance(phone, { isRestoring: true, reconnectAttempts: instance.reconnectAttempts }).catch(() => {});
                        }
                    }, delay);
                }
            }
        });

        // Hook into main message handler
        sock.ev.on('messages.upsert', async (update) => {
            try {
                const { handleMessages } = require('../main');
                await handleMessages(sock, update, false);
            } catch (e) {
                if (!e.message?.includes('FEATURE_DISABLED')) {
                    console.error(`[${phone}] Msg Error:`, e.message);
                }
            }
        });

        // Other event listeners (groups, status, etc.)
        sock.ev.on('group-participants.update', async (u) => {
            try { require('../main').handleGroupParticipantUpdate(sock, u); } catch (_) {}
        });
        
        sock.ev.on('messages.update', async (u) => {
            try {
                const { handleStatus } = require('../main');
                if (Array.isArray(u)) {
                    for (const m of u) {
                        if (m.key?.remoteJid === 'status@broadcast') await handleStatus(sock, { messages: [m], type: 'notify' });
                    }
                }
            } catch (_) {}
        });

        return instance;
    }

    async restoreAll() {
        if (this.isRestoring) return;
        this.isRestoring = true;
        try {
            const users = await getConnectedUsers(this.dbUrl);
            console.log(`[InstanceManager] 🔄 Restoring ${users.length} sessions...`);
            for (const user of users) {
                try {
                    await this.startInstance(user.phone, { isRestoring: true });
                    await new Promise(r => setTimeout(r, 3000)); // Staggered start to prevent CPU spikes
                } catch (e) {
                    console.error(`[InstanceManager] Failed to restore ${user.phone}:`, e.message);
                }
            }
        } catch (e) {
            console.error('[InstanceManager] restoreAll error:', e.message);
        } finally {
            this.isRestoring = false;
        }
    }

    getInstance(phone) {
        return this.instances.get(phone);
    }
}

module.exports = new MultiInstanceManager();
