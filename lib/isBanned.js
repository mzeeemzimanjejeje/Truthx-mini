const fs = require('fs');
const path = require('path');

const BANNED_FILE = path.join(__dirname, '..', 'data', 'banned.json');

// ── In-memory Set cache — O(1) lookups, no disk read on every message ─────────
// Invalidated immediately whenever the list is mutated (addBan / removeBan).
let _bannedSet = null;

function _ensureCache() {
    if (_bannedSet) return _bannedSet;
    try {
        if (fs.existsSync(BANNED_FILE)) {
            const list = JSON.parse(fs.readFileSync(BANNED_FILE, 'utf-8'));
            _bannedSet = new Set(Array.isArray(list) ? list : []);
        } else {
            _bannedSet = new Set();
        }
    } catch (e) {
        console.error('Error loading banned list:', e.message);
        _bannedSet = new Set();
    }
    return _bannedSet;
}

function _invalidateCache() {
    _bannedSet = null;
}

function _saveList(list) {
    try {
        const dir = path.dirname(BANNED_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(BANNED_FILE, JSON.stringify(list, null, 2));
    } catch (e) {
        console.error('Error saving banned list:', e.message);
    }
}

function isBanned(senderId) {
    return _ensureCache().has(senderId);
}

function addBan(senderId) {
    const set = _ensureCache();
    if (set.has(senderId)) return false;
    set.add(senderId);
    _saveList([...set]);
    return true;
}

function removeBan(senderId) {
    const set = _ensureCache();
    if (!set.has(senderId)) return false;
    set.delete(senderId);
    _saveList([...set]);
    return true;
}

function getBannedList() {
    return [..._ensureCache()];
}

module.exports = { isBanned, addBan, removeBan, getBannedList };
