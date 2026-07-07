const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

let _pool = null;

function getPool(dbUrl) {
    if (!_pool) {
        // Lazy-require pg so a missing package degrades gracefully instead of crashing
        let Pool;
        try { Pool = require('pg').Pool; } catch (_) {
            throw new Error('pg package not available in this environment');
        }
        _pool = new Pool({
            connectionString: dbUrl,
            ssl: { rejectUnauthorized: false },
            max: 5,
            idleTimeoutMillis: 30000,
        });
    }
    return _pool;
}

async function initPgAuthTable(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS baileys_auth (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    `);
}

const APP_PREFIX = process.env.HEROKU_APP_NAME || 'default';

async function pgReadData(pool, key) {
    try {
        const fullKey = `${APP_PREFIX}:${key}`;
        const { rows } = await pool.query(
            'SELECT value FROM baileys_auth WHERE key = $1', [fullKey]
        );
        if (!rows[0]) return null;
        return JSON.parse(rows[0].value, BufferJSON.reviver);
    } catch { return null; }
}

async function pgWriteData(pool, key, data) {
    const fullKey = `${APP_PREFIX}:${key}`;
    const value = JSON.stringify(data, BufferJSON.replacer);
    await pool.query(
        'INSERT INTO baileys_auth (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        [fullKey, value]
    );
}

async function pgRemoveData(pool, key) {
    const fullKey = `${APP_PREFIX}:${key}`;
    await pool.query('DELETE FROM baileys_auth WHERE key = $1', [fullKey]);
}

async function pgHasValidCreds(pool) {
    try {
        const creds = await pgReadData(pool, 'creds');
        return !!(creds && creds.me);
    } catch { return false; }
}

async function pgGetSessionIdHash(pool) {
    try {
        const val = await pgReadData(pool, '_session_id_hash');
        return val ? String(val) : null;
    } catch { return null; }
}

async function pgSetSessionIdHash(pool, hash) {
    const value = JSON.stringify(hash, BufferJSON.replacer);
    await pool.query(
        'INSERT INTO baileys_auth (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        ['_session_id_hash', value]
    );
}

async function pgClearAuth(pool) {
    await pool.query("DELETE FROM baileys_auth WHERE key != '_session_id_hash'");
}

async function usePgAuthState(dbUrl, phone = null) {
    const pool = getPool(dbUrl);
    await initPgAuthTable(pool);

    // If phone is provided, use it as part of the prefix to isolate sessions
    const EFFECTIVE_PREFIX = phone ? `${APP_PREFIX}:${phone}` : APP_PREFIX;

    const readData = async (key) => {
        try {
            const fullKey = `${EFFECTIVE_PREFIX}:${key}`;
            const { rows } = await pool.query('SELECT value FROM baileys_auth WHERE key = $1', [fullKey]);
            if (!rows[0]) return null;
            return JSON.parse(rows[0].value, BufferJSON.reviver);
        } catch { return null; }
    };

    const writeData = async (key, data) => {
        const fullKey = `${EFFECTIVE_PREFIX}:${key}`;
        const value = JSON.stringify(data, BufferJSON.replacer);
        await pool.query(
            'INSERT INTO baileys_auth (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
            [fullKey, value]
        );
    };

    // Try to load creds from PG
    let creds = await readData('creds');

    // If PG is empty (first boot), seed from creds.json written by downloadSessionData()
    // This allows SESSION_ID to bootstrap PG on the very first run without HEROKU_API_KEY
    if (!creds) {
        try {
            const credsFile = path.join(__dirname, '..', 'session', 'creds.json');
            if (fs.existsSync(credsFile)) {
                const raw = fs.readFileSync(credsFile, 'utf-8');
                const parsed = JSON.parse(raw, BufferJSON.reviver);
                if (parsed && typeof parsed === 'object') {
                    creds = parsed;
                    // Seed PG immediately so all future restarts use PG directly
                    await pgWriteData(pool, 'creds', creds);
                    console.log('[ TRUTH - MD ] [AUTH] Seeded PostgreSQL creds from SESSION_ID — future restarts will use PG directly');
                }
            }
        } catch (_) {}
        if (!creds) creds = initAuthCreds();
    }

    const state = {
        creds,
        keys: {
            get: async (type, ids) => {
                if (!ids || ids.length === 0) return {};
                const keys = ids.map(id => `${type}-${id}`);
                try {
                    const fullKeys = keys.map(k => `${EFFECTIVE_PREFIX}:${k}`);
                    const { rows } = await pool.query(
                        'SELECT key, value FROM baileys_auth WHERE key = ANY($1)', [fullKeys]
                    );
                    const data = {};
                    for (const row of rows) {
                        const keyWithoutPrefix = row.key.slice(EFFECTIVE_PREFIX.length + 1);
                        const id = keyWithoutPrefix.slice(type.length + 1);
                        try {
                            const parsed = JSON.parse(row.value, BufferJSON.reviver);
                            data[id] = type === 'app-state-sync-key'
                                ? proto.Message.AppStateSyncKeyData.fromObject(parsed)
                                : parsed;
                        } catch (_) {}
                    }
                    return data;
                } catch { return {}; }
            },
            set: async (data) => {
                const toWrite = [];
                const toDelete = [];
                for (const category in data) {
                    for (const id in data[category]) {
                        const value = data[category][id];
                        const key = `${category}-${id}`;
                        if (value) {
                            toWrite.push([key, JSON.stringify(value, BufferJSON.replacer)]);
                        } else {
                            toDelete.push(key);
                        }
                    }
                }
                const client = await pool.connect();
                try {
                    await client.query('BEGIN');
                    if (toDelete.length) {
                        const fullToDelete = toDelete.map(k => `${EFFECTIVE_PREFIX}:${k}`);
                        await client.query('DELETE FROM baileys_auth WHERE key = ANY($1)', [fullToDelete]);
                    }
                    for (const [k, v] of toWrite) {
                        const fullK = `${EFFECTIVE_PREFIX}:${k}`;
                        await client.query(
                            'INSERT INTO baileys_auth (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
                            [fullK, v]
                        );
                    }
                    await client.query('COMMIT');
                } catch (e) {
                    try { await client.query('ROLLBACK'); } catch (_) {}
                } finally {
                    client.release();
                }
            }
        }
    };

    const saveCreds = async () => {
        const fullKey = `${EFFECTIVE_PREFIX}:creds`;
        const value = JSON.stringify(state.creds, BufferJSON.replacer);
        await pool.query(
            'INSERT INTO baileys_auth (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
            [fullKey, value]
        );
    };

    return { state, saveCreds };
}

module.exports = {
    usePgAuthState,
    pgHasValidCreds,
    pgGetSessionIdHash,
    pgSetSessionIdHash,
    pgClearAuth,
    getPool,
    initPgAuthTable,
};
