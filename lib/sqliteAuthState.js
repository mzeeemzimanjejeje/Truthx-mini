const path = require('path');
const fs = require('fs');
const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

// ─── Writable root detection ──────────────────────────────────────────────────
// On Pterodactyl panels using xsqlite3, __dirname resolves deep inside a
// read-only extraction folder (.../node_modules/xsqlite3/core0/.../lib_signals/
// mzeee/<repo-hash>/lib). Regular file writes may succeed there but SQLite
// cannot create journal/lock files on that FS — we must skip it entirely.
// Strategy: if __dirname is inside node_modules, jump straight to
// /home/container (always writable on Pterodactyl). Writability is verified
// by writing a probe file inside the session/ subdirectory specifically
// (not the root), since that is where auth_state.db will live.
function _findWritableRoot() {
    const _inNodeModules = __dirname.includes('node_modules') ||
                           __dirname.includes('xsqlite3');

    // Build ordered candidate list. When inside node_modules (xsqlite3 panel)
    // put /home/container first so we never accidentally pick the extraction dir.
    const candidates = _inNodeModules
        ? [
            '/home/container',
            path.resolve(__dirname, '..', '..', '..', '..', '..', '..', '..', '..'), // xsqlite3 ~8 up
            path.resolve(__dirname, '..', '..', '..', '..', '..', '..'),
            path.resolve(__dirname, '..', '..', '..'),
            process.cwd(),
          ]
        : [
            process.cwd(),
            path.resolve(__dirname, '..'),   // normal: lib/ → project root
            '/home/container',
          ];

    const seen = new Set();
    for (const dir of candidates) {
        if (!dir || seen.has(dir)) continue;
        seen.add(dir);
        // Skip paths still inside node_modules — they may allow plain file
        // writes but SQLite journal files fail on their FS.
        if (dir.includes('node_modules')) continue;
        try {
            // Test at the session/ subdirectory level: create it, write a probe,
            // clean up. This mirrors exactly what auth_state.db setup does.
            const sessionTest = path.join(dir, 'session');
            fs.mkdirSync(sessionTest, { recursive: true });
            const probe = path.join(sessionTest, '.sqlite_probe_' + process.pid);
            fs.writeFileSync(probe, '1');
            fs.unlinkSync(probe);
            return dir;
        } catch (_) {}
    }
    return '/home/container';
}

const _ROOT      = _findWritableRoot();
const SESSION_DIR = path.join(_ROOT, 'session');
const CREDS_FILE  = path.join(SESSION_DIR, 'creds.json');
// Store auth DB inside session/ so signal keys survive Heroku dyno restarts
// and Pterodactyl panel restarts (both wipe /tmp on every restart, which
// caused the bot to lose all pre-keys and appear to never respond).
const DB_PATH = path.join(SESSION_DIR, 'auth_state.db');

// ─── Try loading better-sqlite3; fall back to in-memory if binary missing ────
let Database = null;
let usingMemory = false;
try {
    Database = require('better-sqlite3');
} catch (e) {
    console.warn('[AUTH] better-sqlite3 unavailable (' + e.message.split('\n')[0] + ')');
    console.warn('[AUTH] Falling back to in-memory auth state — session will not persist across restarts');
    usingMemory = true;
}

// ─── In-memory store (fallback) ───────────────────────────────────────────────
function makeMemoryStore() {
    const store = new Map();
    return {
        get: (key) => store.get(key) || null,
        set: (key, value) => store.set(key, value),
        del: (key) => store.delete(key),
        count: () => store.size,
        close: () => {}
    };
}

// ─── SQLite store (primary) ───────────────────────────────────────────────────
function makeSqliteStore(dbPath) {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -2000'); // 2 MB page cache — keeps RAM low
    db.exec(`CREATE TABLE IF NOT EXISTS auth_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    const stmtGet = db.prepare('SELECT value FROM auth_state WHERE key = ?');
    const stmtSet = db.prepare('INSERT OR REPLACE INTO auth_state (key, value) VALUES (?, ?)');
    const stmtDel = db.prepare('DELETE FROM auth_state WHERE key = ?');
    const stmtCnt = db.prepare('SELECT COUNT(*) as cnt FROM auth_state');
    return {
        get: (key) => { const r = stmtGet.get(key); return r ? r.value : null; },
        set: (key, value) => stmtSet.run(key, value),
        del: (key) => stmtDel.run(key),
        count: () => stmtCnt.get().cnt,
        transaction: (fn) => db.transaction(fn),
        close: () => db.close(),
        db
    };
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────
function seedFromCredsFile(store) {
    // Try multiple candidate paths in priority order.
    // On xsqlite3 panels __dirname in index.js resolves to a node_modules
    // extraction folder, so downloadSessionData() may write creds.json to a
    // different directory than the one _findWritableRoot() chose for the DB.
    // Trying all likely locations makes the seeding robust regardless of env.
    const seen = new Set();
    const candidates = [
        CREDS_FILE,                                                           // primary: from _findWritableRoot()
        path.join(process.cwd(), 'session', 'creds.json'),                   // cwd-based (most panels)
        path.join('/home/container', 'session', 'creds.json'),                // Pterodactyl fixed path
        path.join(path.resolve(__dirname, '..'), 'session', 'creds.json'),   // lib/ → project root
    ];
    for (const candidate of candidates) {
        if (seen.has(candidate)) continue;
        seen.add(candidate);
        try {
            if (!fs.existsSync(candidate)) continue;
            const raw = fs.readFileSync(candidate, 'utf8');
            const data = JSON.parse(raw, BufferJSON.reviver);
            if (!data || typeof data !== 'object') continue;
            store.set('creds', JSON.stringify(data, BufferJSON.replacer));
            console.log('[AUTH] Seeded auth store from creds.json: ' + candidate);
            // If the file was found at a non-primary location, copy it to CREDS_FILE
            // so future reads are consistent.
            if (candidate !== CREDS_FILE) {
                try {
                    fs.mkdirSync(path.dirname(CREDS_FILE), { recursive: true });
                    fs.copyFileSync(candidate, CREDS_FILE);
                    console.log('[AUTH] Copied creds.json to canonical location: ' + CREDS_FILE);
                } catch (_) {}
            }
            return;
        } catch (_) {}
    }
}

function migrateJsonFiles(store) {
    try {
        if (!fs.existsSync(SESSION_DIR)) return;
        const files = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith('.json') && f !== 'login.json');
        for (const file of files) {
            try {
                const raw  = fs.readFileSync(path.join(SESSION_DIR, file), 'utf8');
                const data = JSON.parse(raw, BufferJSON.reviver);
                store.set(file.replace('.json', ''), JSON.stringify(data, BufferJSON.replacer));
                fs.unlinkSync(path.join(SESSION_DIR, file));
            } catch (_) {}
        }
    } catch (_) {}
}

// Migrate any leftover /tmp auth DB from old deployments into the session dir.
// Skipped automatically when the old and current paths are identical.
function migrateTmpDb(store) {
    if (!Database) return;
    const oldPath = path.join('/tmp', 'truth-md-auth.db');
    if (!fs.existsSync(oldPath)) return;
    try {
        const oldDb = new Database(oldPath, { readonly: true });
        const rows  = oldDb.prepare('SELECT key, value FROM auth_state').all();
        oldDb.close();
        if (rows.length === 0) return;
        for (const row of rows) store.set(row.key, row.value);
        for (const ext of ['', '-wal', '-shm']) {
            try { fs.unlinkSync(oldPath + ext); } catch (_) {}
        }
        console.log('[AUTH] Migrated auth state from /tmp to session/ — signal keys now persist across restarts');
    } catch (_) {}
}

// ─── Main export ──────────────────────────────────────────────────────────────
function useSQLiteAuthState() {
    fs.mkdirSync(SESSION_DIR, { recursive: true });

    let store;
    let db = null;

    if (!usingMemory) {
        try {
            store = makeSqliteStore(DB_PATH);
            db = store.db;
            // Populate the DB when it is brand-new or empty
            if (store.count() === 0) {
                migrateTmpDb(store);       // pull in any leftover /tmp DB first
                migrateJsonFiles(store);   // then legacy per-key JSON files
                if (store.count() === 0) seedFromCredsFile(store); // finally creds.json
            }
        } catch (e) {
            console.warn('[AUTH] SQLite store failed (' + e.message.split('\n')[0] + ') — using memory fallback');
            usingMemory = true;
            store = makeMemoryStore();
            seedFromCredsFile(store);
        }
    } else {
        store = makeMemoryStore();
        seedFromCredsFile(store);
    }

    function readData(key) {
        const raw = store.get(key);
        if (!raw) return null;
        try { return JSON.parse(raw, BufferJSON.reviver); } catch { return null; }
    }

    function writeData(key, data) {
        store.set(key, JSON.stringify(data, BufferJSON.replacer));
    }

    function removeData(key) {
        store.del(key);
    }

    const _storedCreds = readData('creds');
    if (_storedCreds) {
        console.log(`[AUTH] Credentials restored from SQLite (${store.count()} total keys in store)`);
    } else {
        console.log('[AUTH] No stored credentials found — initialising fresh device registration');
    }
    const creds = _storedCreds || initAuthCreds();

    const state = {
        creds,
        keys: {
            get: async (type, ids) => {
                const data = {};
                for (const id of ids) {
                    const value = readData(`${type}-${id}`);
                    if (value) {
                        data[id] = type === 'app-state-sync-key'
                            ? proto.Message.AppStateSyncKeyData.fromObject(value)
                            : value;
                    }
                }
                return data;
            },
            set: async (data) => {
                const doWrite = () => {
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key   = `${category}-${id}`;
                            if (value) writeData(key, value);
                            else       removeData(key);
                        }
                    }
                };
                if (!usingMemory && store.transaction) {
                    store.transaction(doWrite)();
                } else {
                    doWrite();
                }
            }
        }
    };

    const saveCreds = () => {
        writeData('creds', state.creds);
        try {
            fs.mkdirSync(SESSION_DIR, { recursive: true });
            fs.writeFileSync(CREDS_FILE, JSON.stringify(state.creds, BufferJSON.replacer, 2));
        } catch (_) {}
    };

    return { state, saveCreds, db };
}

module.exports = { useSQLiteAuthState, SESSION_DIR };
