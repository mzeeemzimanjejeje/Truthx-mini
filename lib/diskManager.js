const { execSync } = require('child_process');

let _cached = null;
let _lastCheck = 0;
const CACHE_TTL = 30000;

function getDiskStats() {
    const now = Date.now();
    if (_cached && now - _lastCheck < CACHE_TTL) return _cached;
    try {
        const line = execSync('df -k . 2>/dev/null', { timeout: 3000 }).toString().split('\n')[1];
        if (line) {
            const parts = line.trim().split(/\s+/);
            const total = parseInt(parts[1]) * 1024;
            const used  = parseInt(parts[2]) * 1024;
            const free  = parseInt(parts[3]) * 1024;
            const pct   = parseInt(parts[4]) || 0;
            _cached = { total, used, free, pct, ok: true };
            _lastCheck = now;
            return _cached;
        }
    } catch (_) {}
    return { total: 0, used: 0, free: 0, pct: 0, ok: false };
}

function fmtBytes(b) {
    if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
    if (b >= 1048576)    return (b / 1048576).toFixed(0)    + ' MB';
    return (b / 1024).toFixed(0) + ' KB';
}

function getDiskSummary() {
    const s = getDiskStats();
    if (!s.ok) return '⚠️ unavailable';
    return `${fmtBytes(s.free)} free · ${s.pct}% used`;
}

function isActive() {
    const s = getDiskStats();
    return s.ok;
}

module.exports = { getDiskStats, getDiskSummary, fmtBytes, isActive };
