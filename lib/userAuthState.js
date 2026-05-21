const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

let _pool = null;

function getPool(dbUrl) {
    if (_pool) return _pool;
    const { Pool } = require('pg');
    _pool = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    });
    return _pool;
}

async function initTables(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_baileys_auth (
            phone TEXT NOT NULL,
            key   TEXT NOT NULL,
            value TEXT NOT NULL,
            PRIMARY KEY (phone, key)
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS bot_users (
            phone        TEXT PRIMARY KEY,
            status       TEXT    DEFAULT 'pending',
            created_at   TIMESTAMPTZ DEFAULT NOW(),
            connected_at TIMESTAMPTZ,
            last_seen    TIMESTAMPTZ
        )
    `);
}

async function readData(pool, phone, key) {
    try {
        const { rows } = await pool.query(
            'SELECT value FROM user_baileys_auth WHERE phone = $1 AND key = $2',
            [phone, key]
        );
        if (!rows[0]) return null;
        return JSON.parse(rows[0].value, BufferJSON.reviver);
    } catch { return null; }
}

async function writeData(pool, phone, key, data) {
    const value = JSON.stringify(data, BufferJSON.replacer);
    await pool.query(
        `INSERT INTO user_baileys_auth (phone, key, value) VALUES ($1, $2, $3)
         ON CONFLICT (phone, key) DO UPDATE SET value = EXCLUDED.value`,
        [phone, key, value]
    );
}

async function removeData(pool, phone, key) {
    await pool.query(
        'DELETE FROM user_baileys_auth WHERE phone = $1 AND key = $2',
        [phone, key]
    );
}

async function hasValidCreds(pool, phone) {
    try {
        const creds = await readData(pool, phone, 'creds');
        return !!(creds && creds.me);
    } catch { return false; }
}

async function clearUserAuth(pool, phone) {
    await pool.query('DELETE FROM user_baileys_auth WHERE phone = $1', [phone]);
}

async function useUserAuthState(phone, dbUrl) {
    const pool = getPool(dbUrl);
    await initTables(pool);

    let creds = await readData(pool, phone, 'creds');
    if (!creds) creds = initAuthCreds();

    const alreadyHasCreds = !!(creds && creds.me);

    const state = {
        creds,
        keys: {
            get: async (type, ids) => {
                if (!ids || ids.length === 0) return {};
                const keys = ids.map(id => `${type}-${id}`);
                try {
                    const placeholders = keys.map((_, i) => `$${i + 2}`).join(', ');
                    const { rows } = await pool.query(
                        `SELECT key, value FROM user_baileys_auth WHERE phone = $1 AND key IN (${placeholders})`,
                        [phone, ...keys]
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
                        const ph = toDelete.map((_, i) => `$${i + 2}`).join(', ');
                        await client.query(
                            `DELETE FROM user_baileys_auth WHERE phone = $1 AND key IN (${ph})`,
                            [phone, ...toDelete]
                        );
                    }
                    for (const [k, v] of toWrite) {
                        await client.query(
                            `INSERT INTO user_baileys_auth (phone, key, value) VALUES ($1, $2, $3)
                             ON CONFLICT (phone, key) DO UPDATE SET value = EXCLUDED.value`,
                            [phone, k, v]
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
        await writeData(pool, phone, 'creds', state.creds);
    };

    return {
        state,
        saveCreds,
        pool,
        alreadyHasCreds,
        hasValidCreds: () => hasValidCreds(pool, phone),
        clearAuth: () => clearUserAuth(pool, phone),
    };
}

async function upsertUserStatus(dbUrl, phone, status) {
    try {
        const pool = getPool(dbUrl);
        const extra = status === 'connected' ? ', connected_at = NOW()' : '';
        await pool.query(
            `INSERT INTO bot_users (phone, status) VALUES ($1, $2)
             ON CONFLICT (phone) DO UPDATE SET status = $2${extra}, last_seen = NOW()`,
            [phone, status]
        );
    } catch (_) {}
}

async function getConnectedUsers(dbUrl) {
    try {
        const pool = getPool(dbUrl);
        const { rows } = await pool.query(
            "SELECT phone, status, created_at, connected_at FROM bot_users WHERE status IN ('connected', 'reconnecting') ORDER BY connected_at DESC"
        );
        return rows;
    } catch { return []; }
}

module.exports = { useUserAuthState, getPool, upsertUserStatus, getConnectedUsers };
