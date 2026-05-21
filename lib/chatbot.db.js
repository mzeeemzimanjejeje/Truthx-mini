const path = require('path');
const fs   = require('fs');

const DATA_DIR      = path.join(__dirname, '..', 'data');
const SETTINGS_PATH = path.join(DATA_DIR, 'chatbot_settings.json');
const MESSAGES_PATH = path.join(DATA_DIR, 'chatbot_messages.json');
const MAX_PER_USER  = 50;

// ── In-memory caches (reads always instant; disk is persistence layer) ────────
let _settings     = null;
let _messages     = null;
let _settTimer    = null;
let _msgTimer     = null;

function _ensureDir() { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {} }

function _loadSettings() {
    if (_settings) return _settings;
    _ensureDir();
    try { _settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); } catch (_) {}
    if (!_settings || typeof _settings !== 'object') _settings = {};
    return _settings;
}

function _loadMessages() {
    if (_messages) return _messages;
    _ensureDir();
    try { _messages = JSON.parse(fs.readFileSync(MESSAGES_PATH, 'utf8')); } catch (_) {}
    if (!_messages || typeof _messages !== 'object') _messages = {};
    return _messages;
}

function _saveSettings() {
    if (_settTimer) return;
    _settTimer = setTimeout(() => {
        _settTimer = null;
        fs.writeFile(SETTINGS_PATH, JSON.stringify(_settings, null, 2), () => {});
    }, 2000);
}

function _saveMessages() {
    if (_msgTimer) return;
    _msgTimer = setTimeout(() => {
        _msgTimer = null;
        fs.writeFile(MESSAGES_PATH, JSON.stringify(_messages, null, 2), () => {});
    }, 2000);
}

// ── API ────────────────────────────────────────────────────────────────────────
function getSetting(key) {
    try { const v = _loadSettings()[key]; return v !== undefined ? v : null; } catch (_) { return null; }
}

function setSetting(key, value) {
    try { _loadSettings()[key] = String(value); _saveSettings(); return true; } catch (_) { return false; }
}

function storeUserMessage(userId, message) {
    try {
        const store = _loadMessages();
        if (!store[userId]) store[userId] = [];
        store[userId].push(message);
        if (store[userId].length > MAX_PER_USER) store[userId] = store[userId].slice(-MAX_PER_USER);
        _saveMessages();
        return true;
    } catch (_) { return false; }
}

function getUserMessages(userId, limit = 10) {
    try { return (_loadMessages()[userId] || []).slice(-limit); } catch (_) { return []; }
}

module.exports = { getSetting, setSetting, storeUserMessage, getUserMessages };
