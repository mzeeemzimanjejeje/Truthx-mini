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

async function pgReadData(pool, key) {
    try {
        const { rows } = await pool.query(
            'SELECT value FROM baileys_auth WHERE key = $1', [key]
        );
        if (!rows[0]) return null;
        return JSON.parse(rows[0].value, BufferJSON.reviver);
    } catch { return null; }
}

async function pgWriteData(pool, key, data) {
    const value = JSON.stringify(data, BufferJSON.replacer);
    await pool.query(
        'INSERT INTO baileys_auth (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        [key, value]
    );
}

async function pgRemoveData(pool, key) {
    await pool.query('DELETE FROM baileys_auth WHERE key = $1', [key]);
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

async function usePgAuthState(dbUrl) {
    const pool = getPool(dbUrl);
    await initPgAuthTable(pool);

    // Try to load creds from PG
    let creds = await pgReadData(pool, 'creds');

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
                    const { rows } = await pool.query(
                        'SELECT key, value FROM baileys_auth WHERE key = ANY($1)', [keys]
                    );
                    const data = {};
                    for (const row of rows) {
                        const id = row.key.slice(type.length + 1);
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
                        await client.query('DELETE FROM baileys_auth WHERE key = ANY($1)', [toDelete]);
                    }
                    for (const [k, v] of toWrite) {
                        await client.query(
                            'INSERT INTO baileys_auth (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
                            [k, v]
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
        await pgWriteData(pool, 'creds', state.creds);
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
