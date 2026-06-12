let _settings;
try { _settings = require('../settings'); } catch (_) { _settings = {}; }

const os = require('os');
const _cpuCount = os.cpus().length;
const _ramMB    = Math.floor(os.totalmem() / 1024 / 1024);

// Scale TTL and cache size with available resources.
// High-RAM/high-CPU servers can afford larger caches and longer TTLs.
const CACHE_TTL_MS  = _settings.groupMetaCacheTTL || (_ramMB >= 2048 ? 10 * 60 * 1000 : 5 * 60 * 1000);
const NEG_TTL_MS    = 30 * 1000;   // cache "not found" for 30 s to skip redundant fetches
const MAX_ENTRIES   = _settings.groupMetaCacheMax || (_ramMB >= 2048 ? 2000 : _ramMB >= 512 ? 1000 : 500);
const FETCH_TIMEOUT_MS = 8000;     // hard stop so a cold group lookup never blocks replies forever

// O(1) LRU implemented with a Map (insertion order) + a Set for fast key access.
// On eviction we remove the FIRST key (oldest insertion) in O(1) time.
const _cache = new Map();   // jid → { data, ts, neg }

function _evictOldest() {
    const firstKey = _cache.keys().next().value;
    if (firstKey !== undefined) _cache.delete(firstKey);
}

function getCached(jid) {
    const entry = _cache.get(jid);
    if (!entry) return null;
    const ttl = entry.neg ? NEG_TTL_MS : CACHE_TTL_MS;
    if (Date.now() - entry.ts > ttl) {
        _cache.delete(jid);
        return null;
    }
    // Move to end of Map (most recently used) for LRU correctness
    _cache.delete(jid);
    _cache.set(jid, entry);
    return entry.neg ? undefined : entry.data;  // undefined = negative hit
}

function setCached(jid, data) {
    if (_cache.size >= MAX_ENTRIES) _evictOldest();
    _cache.set(jid, { data, ts: Date.now(), neg: false });
}

function setNegative(jid) {
    if (_cache.size >= MAX_ENTRIES) _evictOldest();
    _cache.set(jid, { data: null, ts: Date.now(), neg: true });
}

function invalidate(jid) {
    if (jid) _cache.delete(jid);
    else _cache.clear();
}

function sweep() {
    const now = Date.now();
    let swept = 0;
    for (const [k, v] of _cache) {
        const ttl = v.neg ? NEG_TTL_MS : CACHE_TTL_MS;
        if (now - v.ts > ttl) { _cache.delete(k); swept++; }
    }
    return swept;
}

setInterval(sweep, Math.max(CACHE_TTL_MS, 60000));

async function getGroupMeta(sock, jid) {
    const cached = getCached(jid);
    if (cached !== null) return cached || null;   // null = negative hit

    try {
        const meta = await Promise.race([
            sock.groupMetadata(jid),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('groupMetadata timeout')), FETCH_TIMEOUT_MS)
            ),
        ]);
        if (meta) setCached(jid, meta);
        else setNegative(jid);
        return meta;
    } catch (e) {
        setNegative(jid);
        throw e;
    }
}

function size() { return _cache.size; }

module.exports = { getGroupMeta, getCached, setCached, setNegative, invalidate, sweep, size };
