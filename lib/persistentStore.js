const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ── Persistent directory ──────────────────────────────────────────────────────
// Must survive relay hash changes (Heroku: HOME=/app which persists within same
// release; on plain VPS/PM2 this is the user's home directory).
// Override with TRUTH_MD_PERSIST env var for custom locations.
function _resolveDir() {
    if (process.env.TRUTH_MD_PERSIST) return process.env.TRUTH_MD_PERSIST;
    const home = process.env.HOME || process.env.USERPROFILE || os.homedir() || '';
    if (home && home !== '/') return path.join(home, '.truth_md');
    return path.join(os.tmpdir(), 'truth_md_persist');
}

const PERSIST_DIR = _resolveDir();

function _ensureDir(dir) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
}

// Recursively copy src → dest, returns count of files copied
function _copyDir(src, dest) {
    if (!fs.existsSync(src)) return 0;
    _ensureDir(dest);
    let n = 0;
    let entries;
    try { entries = fs.readdirSync(src); } catch (_) { return 0; }
    for (const entry of entries) {
        const s = path.join(src, entry);
        const d = path.join(dest, entry);
        try {
            if (fs.lstatSync(s).isDirectory()) {
                n += _copyDir(s, d);
            } else {
                fs.copyFileSync(s, d);
                n++;
            }
        } catch (_) {}
    }
    return n;
}

// Directories that must survive a relay-hash change (new extraction dir).
// 'session' holds creds.json + auth_state.db — without it the bot cannot
// reconnect after a new commit is extracted to a fresh directory.
const PERSIST_DIRS = ['data', 'database'];

// Called on bot startup — copies persisted data files back into the current
// working directory so any code using relative paths finds them.
function restoreAll(cwd) {
    cwd = cwd || process.cwd();
    let n = 0;
    try {
        if (!fs.existsSync(PERSIST_DIR)) return 0;
        for (const dir of PERSIST_DIRS) {
            n += _copyDir(path.join(PERSIST_DIR, dir), path.join(cwd, dir));
        }
        if (n > 0) console.log(`[persist] Restored ${n} data file(s) from ${PERSIST_DIR}`);
    } catch (e) {
        console.error('[persist] restoreAll error:', e.message);
    }
    return n;
}

// Called before process.exit() — copies runtime data back to persistent dir.
// Also called periodically by storage modules after each write.
function backupAll(cwd) {
    cwd = cwd || process.cwd();
    let n = 0;
    try {
        _ensureDir(PERSIST_DIR);
        for (const dir of PERSIST_DIRS) {
            n += _copyDir(path.join(cwd, dir), path.join(PERSIST_DIR, dir));
        }
        if (n > 0) console.log(`[persist] Backed up ${n} data file(s) to ${PERSIST_DIR}`);
    } catch (e) {
        console.error('[persist] backupAll error:', e.message);
    }
    return n;
}

// Mirror a single file write into PERSIST_DIR (called from storage modules
// after every save so the persistent copy is always up-to-date without
// needing a full backupAll scan).
function mirrorFile(absoluteSrcPath) {
    try {
        const cwd = process.cwd();
        const rel = path.relative(cwd, absoluteSrcPath);
        if (rel.startsWith('..')) return; // outside cwd, skip
        const dest = path.join(PERSIST_DIR, rel);
        _ensureDir(path.dirname(dest));
        fs.copyFileSync(absoluteSrcPath, dest);
    } catch (_) {}
}

// Called from the Baileys saveCreds callback so that session files are
// immediately mirrored to the persistent store on every credentials update.
// This is critical on Pterodactyl where the extraction dir changes per commit.
function backupCreds(cwd) {
    cwd = cwd || process.cwd();
    try {
        let n = 0;
        n += _copyDir(path.join(cwd, 'session'),           path.join(PERSIST_DIR, 'session'));
        n += _copyDir(path.join(cwd, 'auth_info_baileys'), path.join(PERSIST_DIR, 'auth_info_baileys'));
        // silent — creds backup is routine, no need to log every time
    } catch (_) {}
}

module.exports = { PERSIST_DIR, restoreAll, backupAll, mirrorFile, backupCreds };
