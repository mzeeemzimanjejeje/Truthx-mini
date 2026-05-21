const fs = require('fs');
const path = require('path');
const settings = require('../settings');

const SUDO_FILE = path.join(__dirname, '..', 'data', 'sudo.json');
const ANTILINK_FILE = path.join(__dirname, '..', 'data', 'antilink.json');
const ANTITAG_FILE = path.join(__dirname, '..', 'data', 'antitag.json');
const LIDMAP_FILE = path.join(__dirname, '..', 'data', 'lidmap.json');

// In-memory cache for isSudo — avoids disk reads on every message
const _sudoCache = new Map(); // senderNum -> { result, expiry }
const SUDO_CACHE_TTL = 300000; // 5 minutes
function _invalidateSudoCache() { _sudoCache.clear(); _sudoListMem = null; _ownerJsonMem = null; }

// Pre-warmed in-memory copies of owner.json and sudo.json —
// eliminates synchronous disk reads on every isSudo cache miss.
let _sudoListMem  = null;   // string[] — phone numbers from sudo.json
let _ownerJsonMem = null;   // string   — ownerNumber from owner.json

function _ensureSudoMem() {
    if (_sudoListMem === null) {
        try { _sudoListMem = loadJSON(SUDO_FILE, []); } catch (_) { _sudoListMem = []; }
    }
    return _sudoListMem;
}

function _ensureOwnerMem() {
    if (_ownerJsonMem === null) {
        try {
            const ownerFile = path.join(__dirname, '..', 'data', 'owner.json');
            if (fs.existsSync(ownerFile)) {
                const d = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
                _ownerJsonMem = extractNumber(d.ownerNumber || '');
            } else {
                _ownerJsonMem = '';
            }
        } catch (_) { _ownerJsonMem = ''; }
    }
    return _ownerJsonMem;
}

// LID map in-memory cache — resolveLidToPhone was calling loadJSON on every call
let _lidMapMem = null;
let _lidMapMemTs = 0;
const LID_MAP_TTL = 60000; // refresh at most every 60s

function _getLidMap() {
    const now = Date.now();
    if (_lidMapMem && (now - _lidMapMemTs) < LID_MAP_TTL) return _lidMapMem;
    try { _lidMapMem = loadJSON(LIDMAP_FILE, {}); } catch (_) { _lidMapMem = {}; }
    _lidMapMemTs = now;
    return _lidMapMem;
}

function _invalidateLidMap() { _lidMapMem = null; _lidMapMemTs = 0; }

function loadJSON(filePath, defaultValue = {}) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
    } catch (e) {
        console.error(`Error loading ${filePath}:`, e.message);
    }
    return defaultValue;
}

function saveJSON(filePath, data) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        try { require('./persistentStore').mirrorFile(filePath); } catch (_) {}
        try { require('./pgDataStore').mirrorFile(filePath); } catch (_) {}
    } catch (e) {
        console.error(`Error saving ${filePath}:`, e.message);
    }
}

function extractNumber(jid) {
    if (!jid) return '';
    return jid.replace(/:.*@/, '@').split('@')[0];
}

function isLidFormat(jid) {
    return jid && jid.includes('@lid');
}

function resolveLidToPhone(lidJid) {
    if (!lidJid || !isLidFormat(lidJid)) return null;
    const map = _getLidMap(); // in-memory cache — no disk read on every call
    const cleanLid = lidJid.replace(/:.*@/, '@');
    const lidNum = extractNumber(lidJid);
    const fromMap = map[lidJid] || map[cleanLid] || map[lidNum] || null;
    if (fromMap) return fromMap;
    try {
        const store = require('./lightweight_store');
        if (store && store.contacts) {
            for (const [id, contact] of Object.entries(store.contacts)) {
                if (contact.lid) {
                    const contactLid = contact.lid.replace(/:.*@/, '@');
                    const contactLidNum = extractNumber(contact.lid);
                    if (contact.lid === lidJid || contactLid === cleanLid || contactLidNum === lidNum) {
                        const phoneJid = contact.id.replace(/:.*@/, '@');
                        updateLidMap([{ id: contact.id, lid: contact.lid }]);
                        return phoneJid;
                    }
                }
            }
        }
    } catch (_) {}
    return null;
}

function updateLidMap(participants) {
    if (!participants || !Array.isArray(participants)) return;
    const map = _getLidMap();
    let changed = false;
    for (const p of participants) {
        if (p.id && p.lid) {
            const phoneJid = p.id.replace(/:.*@/, '@');
            const cleanLid = p.lid.replace(/:.*@/, '@');
            const lidNum = extractNumber(p.lid);
            if (!map[cleanLid] || map[cleanLid] !== phoneJid) {
                map[cleanLid] = phoneJid;
                changed = true;
            }
            if (!map[lidNum] || map[lidNum] !== phoneJid) {
                map[lidNum] = phoneJid;
                changed = true;
            }
        }
    }
    if (changed) {
        saveJSON(LIDMAP_FILE, map);
        _invalidateLidMap(); // force reload from disk on next access
    }
}

function resolveToPhoneJid(senderId) {
    if (!senderId) return senderId;
    if (!isLidFormat(senderId)) return senderId;
    const resolved = resolveLidToPhone(senderId);
    return resolved || senderId;
}

async function isSudo(senderId) {
    if (!senderId) return false;
    const senderNum = extractNumber(senderId);
    const now = Date.now();
    const cached = _sudoCache.get(senderNum);
    if (cached && now < cached.expiry) return cached.result;

    // Use pre-warmed memory — zero disk reads on every cache miss
    const ownerNumbers = [settings.ownerNumber];
    const envOwner = (process.env.OWNER_NUMBER || '').trim();
    if (envOwner && !ownerNumbers.includes(envOwner)) ownerNumbers.push(envOwner);
    const jsonOwner = _ensureOwnerMem();
    if (jsonOwner && !ownerNumbers.includes(jsonOwner)) ownerNumbers.push(jsonOwner);

    for (const num of ownerNumbers) {
        if (!num) continue;
        if (senderId === num + '@s.whatsapp.net' || senderNum === num) {
            _sudoCache.set(senderNum, { result: true, expiry: now + SUDO_CACHE_TTL });
            return true;
        }
    }
    const sudoList = _ensureSudoMem();
    const result = sudoList.some(j => extractNumber(j) === senderNum);
    _sudoCache.set(senderNum, { result, expiry: now + SUDO_CACHE_TTL });
    return result;
}

async function addSudo(jid) {
    try {
        const sudoList = loadJSON(SUDO_FILE, []);
        const num = extractNumber(jid);
        if (!num) return false;
        if (sudoList.includes(num)) return true;
        sudoList.push(num);
        saveJSON(SUDO_FILE, sudoList);
        _sudoListMem = null; // invalidate pre-warmed list
        _invalidateSudoCache();
        return true;
    } catch (e) {
        console.error('Error adding sudo:', e.message);
        return false;
    }
}

async function removeSudo(jid) {
    try {
        const sudoList = loadJSON(SUDO_FILE, []);
        const num = extractNumber(jid);
        if (!num) return false;
        const filtered = sudoList.filter(j => extractNumber(j) !== num);
        if (filtered.length === sudoList.length) return false;
        saveJSON(SUDO_FILE, filtered);
        _sudoListMem = null; // invalidate pre-warmed list
        _invalidateSudoCache();
        return true;
    } catch (e) {
        console.error('Error removing sudo:', e.message);
        return false;
    }
}

async function getSudoList() {
    return loadJSON(SUDO_FILE, []);
}

async function setAntilink(chatId, key, action) {
    try {
        const data = loadJSON(ANTILINK_FILE, {});
        if (!data[chatId]) data[chatId] = {};
        data[chatId][key] = { enabled: true, action: action };
        saveJSON(ANTILINK_FILE, data);
        return true;
    } catch (e) {
        console.error('Error setting antilink:', e.message);
        return false;
    }
}

async function getAntilink(chatId, key) {
    try {
        const data = loadJSON(ANTILINK_FILE, {});
        return data[chatId]?.[key] || null;
    } catch (e) {
        return null;
    }
}

async function removeAntilink(chatId, key) {
    try {
        const data = loadJSON(ANTILINK_FILE, {});
        if (data[chatId]) {
            delete data[chatId][key];
            if (Object.keys(data[chatId]).length === 0) delete data[chatId];
            saveJSON(ANTILINK_FILE, data);
        }
        return true;
    } catch (e) {
        console.error('Error removing antilink:', e.message);
        return false;
    }
}

async function setAntitag(chatId, key, action) {
    try {
        const data = loadJSON(ANTITAG_FILE, {});
        if (!data[chatId]) data[chatId] = {};
        data[chatId][key] = { enabled: true, action: action };
        saveJSON(ANTITAG_FILE, data);
        return true;
    } catch (e) {
        console.error('Error setting antitag:', e.message);
        return false;
    }
}

async function getAntitag(chatId, key) {
    try {
        const data = loadJSON(ANTITAG_FILE, {});
        return data[chatId]?.[key] || null;
    } catch (e) {
        return null;
    }
}

async function removeAntitag(chatId, key) {
    try {
        const data = loadJSON(ANTITAG_FILE, {});
        if (data[chatId]) {
            delete data[chatId][key];
            if (Object.keys(data[chatId]).length === 0) delete data[chatId];
            saveJSON(ANTITAG_FILE, data);
        }
        return true;
    } catch (e) {
        console.error('Error removing antitag:', e.message);
        return false;
    }
}

module.exports = {
    isSudo,
    addSudo,
    removeSudo,
    getSudoList,
    updateLidMap,
    resolveToPhoneJid,
    extractNumber,
    loadJSON,
    setAntilink,
    getAntilink,
    removeAntilink,
    setAntitag,
    getAntitag,
    removeAntitag
};
