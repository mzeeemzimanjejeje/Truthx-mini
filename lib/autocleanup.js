const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function rmIfExists(p) {
    try {
        if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
    } catch (_) {}
}

// Returns free disk in bytes
function freeBytesSync() {
    try {
        const out = execSync(`df -k "${ROOT}"`, { encoding: 'utf8', stdio: 'pipe' });
        const line = out.split('\n')[1];
        const free = parseInt((line || '').trim().split(/\s+/)[3], 10);
        return isNaN(free) ? Infinity : free * 1024;
    } catch (_) { return Infinity; }
}

// Returns used disk in bytes for a directory tree
function usedBytesSync(dir) {
    try {
        const out = execSync(`du -sk "${dir}" 2>/dev/null`, { encoding: 'utf8', stdio: 'pipe' });
        const kb = parseInt((out || '0').trim().split(/\s+/)[0], 10);
        return isNaN(kb) ? 0 : kb * 1024;
    } catch (_) { return 0; }
}

// Only delete tmp files older than 3 minutes so active media operations aren't cut short
const TMP_FILE_MAX_AGE_MS = 3 * 60 * 1000;

function cleanTmpFiles() {
    const extensions = ['.mp4', '.mp3', '.opus', '.webm', '.gif', '.png', '.jpg', '.webp', '.zip', '.tmp', '.wav', '.ogg', '.pdf'];
    const now = Date.now();

    for (const dir of [path.join(ROOT, 'tmp'), path.join(ROOT, 'temp')]) {
        try {
            if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); continue; }
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                try {
                    const full = path.join(dir, entry.name);
                    const age  = now - (fs.statSync(full).mtimeMs || 0);
                    if (age > TMP_FILE_MAX_AGE_MS) fs.rmSync(full, { recursive: true, force: true });
                } catch (_) {}
            }
        } catch (_) {}
    }

    // Clean root-level stray media files older than 3 minutes
    try {
        for (const entry of fs.readdirSync(ROOT)) {
            if (extensions.some(ext => entry.endsWith(ext))) {
                try {
                    const full = path.join(ROOT, entry);
                    const age  = now - (fs.statSync(full).mtimeMs || 0);
                    if (age > TMP_FILE_MAX_AGE_MS) rmIfExists(full);
                } catch (_) {}
            }
        }
    } catch (_) {}

    // Clean /tmp system junk (never touches truth-md-auth.db)
    try { execSync('rm -rf /tmp/npm-* /tmp/v8-* /tmp/*.log 2>/dev/null || true', { stdio: 'ignore' }); } catch (_) {}
}

function cleanOldSessions() {
    const sessionDir = path.join(ROOT, 'session');
    if (!fs.existsSync(sessionDir)) return;
    // Only keep creds.json and login.json — auth DB lives in /tmp
    const keep = new Set(['creds.json', 'login.json', 'session_id.hash']);
    try {
        for (const file of fs.readdirSync(sessionDir)) {
            if (keep.has(file)) continue;
            // Remove old SQLite auth DB files — auth is now in /tmp
            rmIfExists(path.join(sessionDir, file));
        }
    } catch (_) {}
}

function cleanRelayDirs() {
    const relayDir = '/tmp/truth-md-bot';
    if (!fs.existsSync(relayDir)) return;
    try {
        const dirs = fs.readdirSync(relayDir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => ({ full: path.join(relayDir, d.name), mtime: fs.statSync(path.join(relayDir, d.name)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);
        if (dirs.length > 1) dirs.slice(1).forEach(d => rmIfExists(d.full));
    } catch (_) {}
}

// Checkpoint SQLite WAL files to reclaim disk space
function checkpointDataDbs() {
    try {
        const Database = require('better-sqlite3');
        const dataDir = path.join(ROOT, 'data');
        if (!fs.existsSync(dataDir)) return;
        for (const f of fs.readdirSync(dataDir).filter(f => f.endsWith('.db'))) {
            try {
                const db = new Database(path.join(dataDir, f), { readonly: false });
                db.pragma('wal_checkpoint(TRUNCATE)');
                db.close();
            } catch (_) {}
        }
    } catch (_) {}
}

// Trim message_backup.json if > 1 MB
function trimMessageBackup() {
    const f = path.join(ROOT, 'message_backup.json');
    try {
        if (fs.existsSync(f) && fs.statSync(f).size > 1 * 1024 * 1024) {
            fs.writeFileSync(f, '{}');
        }
    } catch (_) {}
}

// Disk overflow protection — if project app data is using > 15 MB, aggressively clean
function diskOverflowGuard() {
    try {
        const sessionUsed  = usedBytesSync(path.join(ROOT, 'session'));
        const dataUsed     = usedBytesSync(path.join(ROOT, 'data'));
        const tmpUsed      = usedBytesSync(path.join(ROOT, 'tmp'));
        const tempUsed     = usedBytesSync(path.join(ROOT, 'temp'));
        const backupFile   = path.join(ROOT, 'message_backup.json');
        const storeFile    = path.join(ROOT, 'baileys_store.json');
        const backupUsed   = fs.existsSync(backupFile) ? fs.statSync(backupFile).size : 0;
        const storeUsed    = fs.existsSync(storeFile)  ? fs.statSync(storeFile).size  : 0;

        const totalMB = (sessionUsed + dataUsed + tmpUsed + tempUsed + backupUsed + storeUsed) / 1024 / 1024;

        if (totalMB > 15) {
            console.log(`[DiskGuard] ⚠️ App data using ${totalMB.toFixed(1)} MB — running emergency cleanup`);
            // Force-clean ALL tmp files regardless of age
            for (const dir of [path.join(ROOT, 'tmp'), path.join(ROOT, 'temp')]) {
                try {
                    if (fs.existsSync(dir)) {
                        for (const e of fs.readdirSync(dir)) {
                            try { fs.rmSync(path.join(dir, e), { recursive: true, force: true }); } catch (_) {}
                        }
                    }
                } catch (_) {}
            }
            trimMessageBackup();
            checkpointDataDbs();
            try { fs.writeFileSync(backupFile, '{}'); } catch (_) {}
            // Zero out store file — it will be rebuilt in memory from live events
            try { fs.writeFileSync(storeFile, '{"chats":{},"contacts":{},"messages":{}}'); } catch (_) {}
        }
    } catch (_) {}
}

// ─── Startup-only: remove caches and logs that should never persist ───────────
function cleanStartupCaches() {
    // TypeScript / build caches (Replit artifacts — not needed on Pterodactyl)
    rmIfExists(path.join(ROOT, '.cache'));
    rmIfExists(path.join(ROOT, 'logs'));
    rmIfExists(path.join(ROOT, '.npm'));

    // node_modules/.cache (babel, webpack, etc.)
    rmIfExists(path.join(ROOT, 'node_modules', '.cache'));

    // Old auth_state.db files in session dir (migrated to /tmp)
    for (const ext of ['', '-wal', '-shm']) {
        rmIfExists(path.join(ROOT, 'session', `auth_state.db${ext}`));
    }

    // Any stray log files
    try {
        for (const entry of fs.readdirSync(ROOT)) {
            if (entry.endsWith('.log') || entry === 'pm2.log') {
                rmIfExists(path.join(ROOT, entry));
            }
        }
    } catch (_) {}
}

function runCleanup() {
    cleanTmpFiles();
    cleanOldSessions();
    cleanRelayDirs();
    trimMessageBackup();
    checkpointDataDbs();
    diskOverflowGuard();
}

let _cleanupIntervalId = null;
function startAutoCleanup(intervalMs = 5 * 60 * 1000) {   // 5 minutes
    cleanStartupCaches();
    // At startup, zero out store file if it's already bloated
    try {
        const storeFile = path.join(ROOT, 'baileys_store.json');
        if (fs.existsSync(storeFile) && fs.statSync(storeFile).size > 2 * 1024 * 1024) {
            fs.writeFileSync(storeFile, '{"chats":{},"contacts":{},"messages":{}}');
            console.log('[Cleanup] Startup: reset oversized baileys_store.json');
        }
    } catch (_) {}
    runCleanup();
    // Replace any existing interval so reconnects never stack duplicate timers.
    // Returns the new ID so the caller can register it for cleanup tracking.
    if (_cleanupIntervalId) clearInterval(_cleanupIntervalId);
    _cleanupIntervalId = setInterval(runCleanup, intervalMs);
    return _cleanupIntervalId;
}

module.exports = { runCleanup, startAutoCleanup, cleanStartupCaches, diskOverflowGuard };
