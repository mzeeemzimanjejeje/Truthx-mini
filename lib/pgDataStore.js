/**
 * pgDataStore.js
 *
 * Persists bot data files (data/*.json, database/*.json) to a PostgreSQL
 * `bot_data` table so they survive ephemeral filesystem resets on Heroku
 * (new deploys), Render (no persistent disk), Railway, and similar platforms.
 *
 * Table schema:
 *   CREATE TABLE bot_data (
 *     key        TEXT PRIMARY KEY,   -- relative path, e.g. "data/prefix.json"
 *     value      TEXT NOT NULL,      -- file content (UTF-8)
 *     updated_at TIMESTAMPTZ DEFAULT NOW()
 *   );
 *
 * Only activates when DATABASE_URL is set. All errors are caught and logged
 * without crashing the bot.
 */

const path = require('path');
const fs   = require('fs');

let _pool  = null;
let _ready = false;

const TABLE = 'bot_data';

const SKIP_DIRS  = new Set(['defaults']);
const SKIP_EXTS  = new Set(['.db', '.sqlite', '.sqlite3']);
const SKIP_FILES = new Set(['baileys_store.json', 'store.json']);
const MAX_SIZE   = 2 * 1024 * 1024; // 2 MB safety cap per file

function isAvailable() {
    return !!process.env.DATABASE_URL;
}

function _getPool() {
    if (_pool) return _pool;
    const url = process.env.DATABASE_URL;
    if (!url) return null;
    try {
        const { Pool } = require('pg');
        _pool = new Pool({
            connectionString: url,
            ssl: { rejectUnauthorized: false },
            max: 3,
            idleTimeoutMillis: 30000,
        });
    } catch (_) { return null; }
    return _pool;
}

async function _init(pool) {
    if (_ready) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ${TABLE} (
            key        TEXT PRIMARY KEY,
            value      TEXT NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    _ready = true;
}

function _shouldSkip(relPath) {
    const parts = relPath.split(path.sep);
    if (parts.length >= 3 && SKIP_DIRS.has(parts[1])) return true;
    const ext  = path.extname(relPath).toLowerCase();
    const base = path.basename(relPath);
    if (SKIP_EXTS.has(ext))   return true;
    if (SKIP_FILES.has(base)) return true;
    return false;
}

async function saveFile(relPath, content) {
    if (_shouldSkip(relPath)) return;
    const pool = _getPool();
    if (!pool) return;
    try {
        await _init(pool);
        const val = typeof content === 'string' ? content : JSON.stringify(content);
        if (val.length > MAX_SIZE) return;
        await pool.query(
            `INSERT INTO ${TABLE} (key, value, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (key) DO UPDATE
               SET value = EXCLUDED.value, updated_at = NOW()`,
            [relPath, val]
        );
    } catch (_) {}
}

async function saveAll(cwd) {
    const pool = _getPool();
    if (!pool) return 0;
    cwd = cwd || process.cwd();
    let n = 0;
    try {
        await _init(pool);
        for (const dir of ['data', 'database']) {
            const absDir = path.join(cwd, dir);
            if (!fs.existsSync(absDir)) continue;
            let entries;
            try { entries = fs.readdirSync(absDir); } catch (_) { continue; }
            for (const entry of entries) {
                const absFile = path.join(absDir, entry);
                const relPath = path.join(dir, entry);
                if (_shouldSkip(relPath)) continue;
                try {
                    const stat = fs.lstatSync(absFile);
                    if (!stat.isFile() || stat.size > MAX_SIZE) continue;
                    const content = fs.readFileSync(absFile, 'utf8');
                    await pool.query(
                        `INSERT INTO ${TABLE} (key, value, updated_at)
                         VALUES ($1, $2, NOW())
                         ON CONFLICT (key) DO UPDATE
                           SET value = EXCLUDED.value, updated_at = NOW()`,
                        [relPath, content]
                    );
                    n++;
                } catch (_) {}
            }
        }
    } catch (e) {
        console.error('[pgData] saveAll error:', e.message);
    }
    return n;
}

async function restoreAll(cwd) {
    const pool = _getPool();
    if (!pool) return 0;
    cwd = cwd || process.cwd();
    let n = 0;
    try {
        await _init(pool);
        const { rows } = await pool.query(`SELECT key, value FROM ${TABLE}`);
        for (const row of rows) {
            if (_shouldSkip(row.key)) continue;
            const abs = path.join(cwd, row.key);
            try {
                fs.mkdirSync(path.dirname(abs), { recursive: true });
                fs.writeFileSync(abs, row.value, 'utf8');
                n++;
            } catch (_) {}
        }
        if (n > 0) console.log(`[pgData] Restored ${n} file(s) from PostgreSQL bot_data`);
    } catch (e) {
        console.error('[pgData] restoreAll error:', e.message);
    }
    return n;
}

function mirrorFile(absoluteSrcPath) {
    const pool = _getPool();
    if (!pool) return Promise.resolve();
    try {
        const cwd = process.cwd();
        const rel = path.relative(cwd, absoluteSrcPath);
        if (rel.startsWith('..') || _shouldSkip(rel)) return Promise.resolve();
        const stat = fs.lstatSync(absoluteSrcPath);
        if (!stat.isFile() || stat.size > MAX_SIZE) return Promise.resolve();
        const content = fs.readFileSync(absoluteSrcPath, 'utf8');
        return saveFile(rel, content).catch(() => {});
    } catch (_) { return Promise.resolve(); }
}

module.exports = { isAvailable, saveFile, saveAll, restoreAll, mirrorFile };
