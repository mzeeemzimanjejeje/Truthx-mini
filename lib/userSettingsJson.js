const fs   = require('fs');
const path = require('path');

const SETTINGS_DIR  = path.join(__dirname, '..', 'database');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'usersettings.json');

let _persist;
try { _persist = require('./persistentStore'); } catch (_) {}

let _pgData;
try { _pgData = require('./pgDataStore'); } catch (_) {}

let _pg;
try { _pg = require('./pgUserSettings'); } catch (_) {}

let userSettings = {};
let loaded = false;

function ensureFile() {
    if (!fs.existsSync(SETTINGS_DIR)) fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, '{}', 'utf8');
}

function loadSettings() {
    try {
        ensureFile();
        let raw;
        try {
            raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
        } catch (_) {
            if (_persist) {
                const mirror = path.join(_persist.PERSIST_DIR, 'database', 'usersettings.json');
                if (fs.existsSync(mirror)) raw = fs.readFileSync(mirror, 'utf8');
            }
        }
        userSettings = (raw ? JSON.parse(raw) : null) || {};
        loaded = true;
    } catch (e) {
        console.error('[userSettingsJson] Failed to load settings:', e.message);
        userSettings = {};
        loaded = true;
    }
}

function saveSettings() {
    try {
        ensureFile();
        const data = JSON.stringify(userSettings, null, 2);
        fs.writeFileSync(SETTINGS_FILE, data, 'utf8');
        if (_persist) _persist.mirrorFile(SETTINGS_FILE);
        if (_pgData)  _pgData.mirrorFile(SETTINGS_FILE);
    } catch (e) {
        console.error('[userSettingsJson] Failed to save settings:', e.message);
    }
}

function init() {
    if (!loaded) loadSettings();
}

function getUserSettings(jid) {
    if (!loaded) loadSettings();
    // Merge PG data if ready
    if (_pg && _pg.isReady()) {
        const pgData = _pg.getAllUserSettings(jid);
        const local  = userSettings[jid] ? { ...userSettings[jid] } : {};
        return { ...local, ...pgData };
    }
    return userSettings[jid] ? { ...userSettings[jid] } : {};
}

function getUserSetting(jid, key, defaultValue = null) {
    if (!loaded) loadSettings();
    // Prefer PG if ready
    if (_pg && _pg.isReady()) {
        const v = _pg.getUserSetting(jid, key);
        if (v !== null) return v;
    }
    const u = userSettings[jid];
    if (!u || u[key] === undefined) return defaultValue;
    return u[key];
}

function setUserSetting(jid, key, value) {
    if (!loaded) loadSettings();
    if (!userSettings[jid]) userSettings[jid] = {};
    userSettings[jid][key] = value;
    userSettings[jid]._updated = new Date().toISOString();
    saveSettings();
    // Dual-write to PG
    if (_pg) _pg.setUserSetting(jid, key, value);
}

function setUserSettings(jid, settingsObj) {
    if (!loaded) loadSettings();
    userSettings[jid] = {
        ...(userSettings[jid] || {}),
        ...settingsObj,
        _updated: new Date().toISOString()
    };
    saveSettings();
    // Dual-write all keys to PG
    if (_pg) {
        for (const [k, v] of Object.entries(settingsObj)) _pg.setUserSetting(jid, k, v);
    }
}

function deleteUserSetting(jid, key) {
    if (!loaded) loadSettings();
    if (userSettings[jid]) {
        delete userSettings[jid][key];
        saveSettings();
    }
    if (_pg) _pg.deleteUserSetting(jid, key);
}

function deleteUserSettings(jid) {
    if (!loaded) loadSettings();
    delete userSettings[jid];
    saveSettings();
    if (_pg) _pg.deleteAllUserSettings(jid);
}

function getAllUsers() {
    if (!loaded) loadSettings();
    const local = Object.keys(userSettings);
    if (_pg && _pg.isReady()) {
        const pgUsers = _pg.getAllUsersWithSettings();
        return [...new Set([...local, ...pgUsers])];
    }
    return local;
}

function exportAll() {
    if (!loaded) loadSettings();
    return JSON.parse(JSON.stringify(userSettings));
}

module.exports = {
    init, loadSettings, saveSettings,
    getUserSettings, getUserSetting,
    setUserSetting, setUserSettings,
    deleteUserSetting, deleteUserSettings,
    getAllUsers, exportAll
};
