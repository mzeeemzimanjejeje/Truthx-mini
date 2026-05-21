/**
 * pgUserSettings.js
 * PostgreSQL-backed settings store with in-memory cache.
 *
 * Key format:
 *   cfg:<KEY>         → global bot config (replaces data/config.json)
 *   usr:<JID>:<KEY>  → per-user settings
 *
 * Reads are always synchronous (served from the in-memory cache).
 * Writes update the cache immediately and flush to PG asynchronously.
 * If PG is unavailable the module degrades silently — the caller's own
 * JSON/file fallback still works.
 */

'use strict';

let _pool = null;
const _cache = new Map(); // key → string value
let _ready = false;
let _initPromise = null;

// ── Pool ──────────────────────────────────────────────────────────────────────
function _getPool() {
    if (_pool) return _pool;
    const url = process.env.DATABASE_URL;
    if (!url) return null;
    try {
        const { Pool } = require('pg');
        _pool = new Pool({
            connectionString: url,
            ssl: { rejectUnauthorized: false },
            max: 3,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });
        _pool.on('error', () => {}); // suppress unhandled errors
    } catch (_) {}
    return _pool;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function _bootstrap() {
    const pool = _getPool();
    if (!pool) return false;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bot_settings (
                key        TEXT PRIMARY KEY,
                value      TEXT NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        // Load entire table into cache
        const { rows } = await pool.query('SELECT key, value FROM bot_settings');
        for (const r of rows) _cache.set(r.key, r.value);
        _ready = true;
        console.log(`[pgSettings] Ready — loaded ${rows.length} setting(s) from PostgreSQL`);
        return true;
    } catch (e) {
        console.error('[pgSettings] Init error:', e.message);
        return false;
    }
}

/**
 * Call once at startup.  Safe to call multiple times — only runs once.
 */
function init() {
    if (_initPromise) return _initPromise;
    _initPromise = _bootstrap();
    return _initPromise;
}

// ── Low-level read/write ──────────────────────────────────────────────────────

/** Synchronous read — always returns instantly from cache. */
function getSync(key, defaultValue = null) {
    const v = _cache.get(key);
    if (v === undefined || v === null) return defaultValue;
    try { return JSON.parse(v); } catch (_) { return v; }
}

/** Synchronous read — returns raw string value. */
function getRawSync(key) {
    return _cache.has(key) ? _cache.get(key) : null;
}

/**
 * Bulk-upsert a map of { key: value } into bot_settings.
 * Returns a promise that resolves when all rows are written.
 * Use before process.exit() to guarantee PG is up-to-date.
 */
async function bulkFlush(entries) {
    if (!entries || !Object.keys(entries).length) return;
    const pool = _getPool();
    if (!pool) return;
    await _bootstrap().catch(() => {});
    const promises = Object.entries(entries).map(([k, v]) => {
        const strVal = (v !== null && typeof v === 'object') ? JSON.stringify(v) : String(v);
        _cache.set(k, strVal);
        return pool.query(
            `INSERT INTO bot_settings (key, value, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
            [k, strVal]
        ).catch(() => {});
    });
    await Promise.all(promises);
}

/** Write to cache immediately; flush to PG asynchronously. */
function set(key, value) {
    const strVal = (value !== null && typeof value === 'object')
        ? JSON.stringify(value)
        : String(value);
    _cache.set(key, strVal);

    const pool = _getPool();
    if (!pool) return;
    pool.query(
        `INSERT INTO bot_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, strVal]
    ).catch(() => {});
}

/** Delete from cache and PG. */
function del(key) {
    _cache.delete(key);
    const pool = _getPool();
    if (!pool) return;
    pool.query('DELETE FROM bot_settings WHERE key = $1', [key]).catch(() => {});
}

// ── Config helpers (global bot settings) ────────────────────────────────────

function getCfg(key, defaultValue = null) {
    return getSync(`cfg:${key}`, defaultValue);
}

function setCfg(key, value) {
    set(`cfg:${key}`, value);
}

function deleteCfg(key) {
    del(`cfg:${key}`);
}

function getAllCfg() {
    const out = {};
    for (const [k, v] of _cache) {
        if (k.startsWith('cfg:')) {
            const shortKey = k.slice(4);
            try { out[shortKey] = JSON.parse(v); } catch (_) { out[shortKey] = v; }
        }
    }
    return out;
}

// ── Per-user setting helpers ───────────────────────────────────────────────

function getUserSetting(jid, key, defaultValue = null) {
    return getSync(`usr:${jid}:${key}`, defaultValue);
}

function setUserSetting(jid, key, value) {
    set(`usr:${jid}:${key}`, value);
    // Update _updated timestamp for this user
    set(`usr:${jid}:_updated`, new Date().toISOString());
}

function deleteUserSetting(jid, key) {
    del(`usr:${jid}:${key}`);
}

function getAllUserSettings(jid) {
    const prefix = `usr:${jid}:`;
    const out = {};
    for (const [k, v] of _cache) {
        if (k.startsWith(prefix)) {
            const shortKey = k.slice(prefix.length);
            try { out[shortKey] = JSON.parse(v); } catch (_) { out[shortKey] = v; }
        }
    }
    return out;
}

function deleteAllUserSettings(jid) {
    const prefix = `usr:${jid}:`;
    const keys = [..._cache.keys()].filter(k => k.startsWith(prefix));
    for (const k of keys) del(k);
}

function getAllUsersWithSettings() {
    const jids = new Set();
    for (const k of _cache.keys()) {
        if (k.startsWith('usr:')) {
            const rest = k.slice(4);
            const colonIdx = rest.indexOf(':');
            if (colonIdx > 0) jids.add(rest.slice(0, colonIdx));
        }
    }
    return [...jids];
}

/**
 * Bulk-import existing JSON data into PG (used for one-time migration).
 * @param {Object} cfgMap   - { KEY: value } for global config
 * @param {Object} usersMap - { JID: { KEY: value } } for per-user settings
 */
async function bulkImport(cfgMap = {}, usersMap = {}) {
    await init();
    for (const [k, v] of Object.entries(cfgMap)) setCfg(k, v);
    for (const [jid, settings] of Object.entries(usersMap)) {
        for (const [k, v] of Object.entries(settings)) setUserSetting(jid, k, v);
    }
}

/**
 * Returns true if PG has been successfully initialised.
 */
function isReady() { return _ready; }

module.exports = {
    init, isReady,
    getSync, getRawSync, set, del, bulkFlush,
    getCfg, setCfg, deleteCfg, getAllCfg,
    getUserSetting, setUserSetting, deleteUserSetting,
    getAllUserSettings, deleteAllUserSettings, getAllUsersWithSettings,
    bulkImport,
};
