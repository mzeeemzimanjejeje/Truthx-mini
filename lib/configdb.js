const path = require('path');
const fs   = require('fs');

const DATA_DIR  = path.join(__dirname, '..', 'data');
const JSON_PATH = path.join(DATA_DIR, 'config.json');

let _persist;
try { _persist = require('./persistentStore'); } catch (_) {}

let _pgData;
try { _pgData = require('./pgDataStore'); } catch (_) {}

let _pg;
try { _pg = require('./pgUserSettings'); } catch (_) {}

// ─── In-memory cache (reads always instant; disk is persistence layer) ────────
let _cache = null;
let _timer = null;

function _load() {
    if (_cache) return _cache;
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        let raw;
        try { raw = fs.readFileSync(JSON_PATH, 'utf8'); } catch (_) {
            if (_persist) {
                const mirror = path.join(_persist.PERSIST_DIR, 'data', 'config.json');
                if (fs.existsSync(mirror)) raw = fs.readFileSync(mirror, 'utf8');
            }
        }
        if (raw) _cache = JSON.parse(raw);
    } catch (_) {}
    if (!_cache || typeof _cache !== 'object') _cache = {};
    return _cache;
}

// Debounced async write — flushes at most once per 2 s; never blocks the caller.
function _scheduleSave() {
    if (_timer) return;
    _timer = setTimeout(() => {
        _timer = null;
        _writeNow();
    }, 2000);
}

function _writeNow() {
    try {
        if (!_cache) return;
        fs.mkdirSync(DATA_DIR, { recursive: true });
        const snap = JSON.stringify(_cache, null, 2);
        fs.writeFileSync(JSON_PATH, snap, 'utf8');
        if (_persist) _persist.mirrorFile(JSON_PATH);
        if (_pgData)  _pgData.mirrorFile(JSON_PATH);
    } catch (_) {}
}

// Flush any pending debounced write synchronously. Call this before process.exit().
function flushSync() {
    if (_timer) { clearTimeout(_timer); _timer = null; }
    _writeNow();
    // Also flush any pending pg writes — the pg module is fire-and-forget so
    // we just ensure the cache was already written above.
}

// ─── PG integration ──────────────────────────────────────────────────────────
// Called once at startup (after PG pool is ready) to load PG values into the
// in-memory cache. PG values take precedence over the JSON file so that any
// settings saved after the last shutdown are always honoured.
async function initFromPG() {
    if (!_pg) return;
    try {
        await _pg.init();
        if (!_pg.isReady()) return;

        // Merge PG cfg:* values into the local cache
        const pgCfg = _pg.getAllCfg();
        const store = _load();
        let changed = false;
        for (const [k, v] of Object.entries(pgCfg)) {
            const strVal = typeof v === 'object' ? JSON.stringify(v) : String(v);
            if (store[k] !== strVal) {
                store[k] = strVal;
                changed = true;
            }
        }
        // Also push any local keys that PG doesn't have yet (migration)
        for (const [k, v] of Object.entries(store)) {
            if (_pg.getCfg(k) === null) _pg.setCfg(k, v);
        }
        if (changed) _writeNow();
    } catch (e) {
        console.error('[configdb] initFromPG error:', e.message);
    }
}

// ─── Public API ──────────────────────────────────────────────────────────────

function getConfig(key, defaultValue = null) {
    try { const s = _load(); return key in s ? s[key] : defaultValue; } catch (_) { return defaultValue; }
}

function setConfig(key, value) {
    try {
        _load()[key] = String(value);
        _scheduleSave();
        // Dual-write to PG (fire-and-forget)
        if (_pg) _pg.setCfg(key, value);
        return true;
    } catch (_) { return false; }
}

function deleteConfig(key) {
    try {
        delete _load()[key];
        _scheduleSave();
        if (_pg) _pg.deleteCfg(key);
        return true;
    } catch (_) { return false; }
}

function getBotName() {
    try { return getConfig('BOTNAME', require('../settings').botName || 'TRUTH MD'); } catch (_) { return getConfig('BOTNAME', 'TRUTH MD'); }
}

/**
 * Awaitable flush of all config keys to the bot_settings PG table.
 * Call before process.exit() to guarantee PG is never stale.
 * Complements flushSync() (disk) and pgData.saveAll() (bot_data table).
 */
async function flushToPG() {
    if (!_pg) return;
    try {
        const store = _load();
        const entries = {};
        for (const [k, v] of Object.entries(store)) {
            entries[`cfg:${k}`] = v;
        }
        await _pg.bulkFlush(entries);
    } catch (e) {
        console.error('[configdb] flushToPG error:', e.message);
    }
}

module.exports = { getConfig, setConfig, getBotName, deleteConfig, flushSync, flushToPG, initFromPG };
