const path = require('path');
const fs   = require('fs');

const DATA_DIR    = path.join(__dirname, '..', 'data');
const USER_PATH   = path.join(DATA_DIR, 'user_settings.json');
const GLOBAL_PATH = path.join(DATA_DIR, 'global_settings.json');

let _persist;
try { _persist = require('./persistentStore'); } catch (_) {}

let _pgData;
try { _pgData = require('./pgDataStore'); } catch (_) {}

let _pg;
try { _pg = require('./pgUserSettings'); } catch (_) {}

// ── In-memory caches ──────────────────────────────────────────────────────────
let _users       = null;
let _globals     = null;
let _userTimer   = null;
let _globalTimer = null;

function _ensureDir() { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {} }

function _readOrMirror(primaryPath, mirrorSubpath) {
    try { return JSON.parse(fs.readFileSync(primaryPath, 'utf8')); } catch (_) {}
    if (_persist) {
        const m = path.join(_persist.PERSIST_DIR, mirrorSubpath);
        try { return JSON.parse(fs.readFileSync(m, 'utf8')); } catch (_) {}
    }
    return null;
}

function _loadUsers() {
    if (_users) return _users;
    _ensureDir();
    _users = _readOrMirror(USER_PATH, 'data/user_settings.json');
    if (!_users || typeof _users !== 'object') _users = {};
    return _users;
}

function _loadGlobals() {
    if (_globals) return _globals;
    _ensureDir();
    _globals = _readOrMirror(GLOBAL_PATH, 'data/global_settings.json');
    if (!_globals || typeof _globals !== 'object') _globals = {};
    return _globals;
}

function _writeNowUsers() {
    try {
        _ensureDir();
        fs.writeFileSync(USER_PATH, JSON.stringify(_users, null, 2), 'utf8');
        if (_persist) _persist.mirrorFile(USER_PATH);
        if (_pgData)  _pgData.mirrorFile(USER_PATH);
    } catch (_) {}
}

function _writeNowGlobals() {
    try {
        _ensureDir();
        fs.writeFileSync(GLOBAL_PATH, JSON.stringify(_globals, null, 2), 'utf8');
        if (_persist) _persist.mirrorFile(GLOBAL_PATH);
        if (_pgData)  _pgData.mirrorFile(GLOBAL_PATH);
    } catch (_) {}
}

function _saveUsers() {
    if (_userTimer) return;
    _userTimer = setTimeout(() => { _userTimer = null; _writeNowUsers(); }, 2000);
}

function _saveGlobals() {
    if (_globalTimer) return;
    _globalTimer = setTimeout(() => { _globalTimer = null; _writeNowGlobals(); }, 2000);
}

// Flush any pending debounced writes synchronously. Call before process.exit().
function flushSync() {
    if (_userTimer)   { clearTimeout(_userTimer);   _userTimer   = null; _writeNowUsers();   }
    if (_globalTimer) { clearTimeout(_globalTimer); _globalTimer = null; _writeNowGlobals(); }
}

// ── PG bootstrap ────────────────────────────────────────────────────────────
// Called once at startup after the PG pool is ready.
async function initFromPG() {
    if (!_pg) return;
    try {
        await _pg.init();
        if (!_pg.isReady()) return;

        // Merge PG per-user values into the local JSON cache
        const users = _loadUsers();
        let changed = false;
        for (const jid of _pg.getAllUsersWithSettings()) {
            const pgUser = _pg.getAllUserSettings(jid);
            if (!users[jid]) users[jid] = {};
            for (const [k, v] of Object.entries(pgUser)) {
                const strVal = typeof v === 'object' ? JSON.stringify(v) : String(v);
                if (users[jid][k] !== strVal) { users[jid][k] = strVal; changed = true; }
            }
        }
        // Push local-only keys up to PG (migration)
        for (const [jid, settings] of Object.entries(users)) {
            for (const [k, v] of Object.entries(settings)) {
                if (_pg.getUserSetting(jid, k) === null) _pg.setUserSetting(jid, k, v);
            }
        }
        if (changed) _writeNowUsers();
    } catch (e) {
        console.error('[userSettings] initFromPG error:', e.message);
    }
}

// ── User settings ──────────────────────────────────────────────────────────────
function getUserSetting(userJid, key, defaultValue = null) {
    try {
        // Prefer PG cache if ready (already in-memory, same speed)
        if (_pg && _pg.isReady()) {
            const v = _pg.getUserSetting(userJid, key);
            if (v !== null) return v;
        }
        const val = _loadUsers()[userJid]?.[key];
        if (val === undefined || val === null) return defaultValue;
        try { return JSON.parse(val); } catch (_) { return val; }
    } catch (_) { return defaultValue; }
}

function setUserSetting(userJid, key, value) {
    try {
        const store = _loadUsers();
        if (!store[userJid]) store[userJid] = {};
        store[userJid][key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
        _saveUsers();
        // Dual-write to PG
        if (_pg) _pg.setUserSetting(userJid, key, value);
        return true;
    } catch (_) { return false; }
}

function deleteUserSetting(userJid, key) {
    try {
        const store = _loadUsers();
        if (store[userJid]) { delete store[userJid][key]; _saveUsers(); }
        if (_pg) _pg.deleteUserSetting(userJid, key);
        return true;
    } catch (_) { return false; }
}

function getAllUserSettings(userJid) {
    try {
        // Merge PG and JSON
        const raw = _loadUsers()[userJid] || {};
        const out = {};
        for (const [k, v] of Object.entries(raw)) { try { out[k] = JSON.parse(v); } catch (_) { out[k] = v; } }
        if (_pg && _pg.isReady()) {
            const pgData = _pg.getAllUserSettings(userJid);
            Object.assign(out, pgData);
        }
        return out;
    } catch (_) { return {}; }
}

// ── Global settings ────────────────────────────────────────────────────────────
function getGlobalSetting(key, defaultValue = null) {
    try {
        const entry = _loadGlobals()[key];
        if (!entry) return defaultValue;
        const val = entry.value !== undefined ? entry.value : entry;
        try { return typeof val === 'string' ? JSON.parse(val) : val; } catch (_) { return val; }
    } catch (_) { return defaultValue; }
}

function setGlobalSetting(key, value, description = '') {
    try {
        _loadGlobals()[key] = {
            value: typeof value === 'object' ? JSON.stringify(value) : String(value),
            type: typeof value,
            description
        };
        _saveGlobals();
        return true;
    } catch (_) { return false; }
}

function deleteGlobalSetting(key) {
    try { delete _loadGlobals()[key]; _saveGlobals(); return true; } catch (_) { return false; }
}

function getAllGlobalSettings() {
    try { return _loadGlobals(); } catch (_) { return {}; }
}

// ── Bulk ops ───────────────────────────────────────────────────────────────────
function exportSettings() {
    try { return { global: getAllGlobalSettings(), users: _loadUsers() }; } catch (_) { return null; }
}

function importSettings(settingsData) {
    try {
        if (!settingsData) return false;
        if (settingsData.global) for (const [k, v] of Object.entries(settingsData.global)) setGlobalSetting(k, v.value !== undefined ? v.value : v, v.description || '');
        if (settingsData.users) for (const [jid, u] of Object.entries(settingsData.users)) for (const [k, v] of Object.entries(u)) setUserSetting(jid, k, v);
        return true;
    } catch (_) { return false; }
}

function migrateExistingSettings() {
    const migrations = [
        { file: 'prefix.json', key: 'PREFIX' }, { file: 'owner.json', key: 'OWNER_INFO' },
        { file: 'sudo.json', key: 'SUDO_USERS' }, { file: 'banned.json', key: 'BANNED_USERS' },
        { file: 'premium.json', key: 'PREMIUM_USERS' }, { file: 'warnings.json', key: 'WARNINGS' },
        { file: 'autoread.json', key: 'AUTOREAD' }, { file: 'autotyping.json', key: 'AUTOTYPING_USERS' },
        { file: 'pmblocker.json', key: 'PM_BLOCKER' }, { file: 'welcome.json', key: 'WELCOME_SETTINGS' },
        { file: 'goodbye.json', key: 'GOODBYE_SETTINGS' }, { file: 'menuSettings.json', key: 'MENU_SETTINGS' },
        { file: 'water.json', key: 'WATERMARK_SETTINGS' }, { file: 'payments.json', key: 'PAYMENT_SETTINGS' },
        { file: 'userGroupData.json', key: 'USER_GROUP_DATA' }, { file: 'custom_apis.json', key: 'CUSTOM_APIS' },
        { file: 'autolike.json', key: 'AUTOLIKE_SETTINGS' }, { file: 'autoview.json', key: 'AUTOVIEW_SETTINGS' },
    ];
    for (const m of migrations) {
        try { if (fs.existsSync(path.join(DATA_DIR, m.file))) setGlobalSetting(m.key, JSON.parse(fs.readFileSync(path.join(DATA_DIR, m.file), 'utf8'))); } catch (_) {}
    }
}

function cleanupOldFiles() {}

module.exports = {
    getUserSetting, setUserSetting, deleteUserSetting, getAllUserSettings,
    getGlobalSetting, setGlobalSetting, deleteGlobalSetting, getAllGlobalSettings,
    exportSettings, importSettings, cleanupOldFiles, migrateExistingSettings,
    flushSync, initFromPG,
};
