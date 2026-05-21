'use strict';
const fs   = require('fs');
const path = require('path');
const http  = require('https');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');

const RELAY_URL   = process.env.VERCEL_RELAY_URL || 'https://techcourtney-relay-one.vercel.app/api/repo';
const ACCESS_KEY  = process.env.ACCESS_KEY || 'techworld_secure_2026';
const DATABASE_URL = process.env.DATABASE_URL;
const GITHUB_REPO = 'mzeeemzimanjejeje/Maintaining';
const BOT_DIR     = path.join(__dirname, '.botcache');
const LOG         = (...a) => console.log('[Launcher]', ...a);

// ── tiny https GET helper (no axios needed at launcher level) ─────────────────
function httpsGet(url, headers = {}, binary = false) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        http.get(url, { headers: { 'User-Agent': 'truth-md-launcher', ...headers } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return httpsGet(res.headers.location, headers, binary).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(binary ? Buffer.concat(chunks) : Buffer.concat(chunks).toString()));
        }).on('error', reject);
    });
}

// ── PostgreSQL helper (only if DATABASE_URL is set) ───────────────────────────
let _pg = null;
async function pg(sql, params = []) {
    if (!DATABASE_URL) return null;
    try {
        if (!_pg) {
            const { Client } = require('pg');
            _pg = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
            await _pg.connect();
            await _pg.query(`CREATE TABLE IF NOT EXISTS launcher_cache (
                key TEXT PRIMARY KEY, val TEXT, updated_at BIGINT DEFAULT 0
            )`);
        }
        const r = await _pg.query(sql, params);
        return r;
    } catch (e) {
        LOG('⚠️  PostgreSQL:', e.message);
        return null;
    }
}

async function pgGet(key) {
    const r = await pg('SELECT val FROM launcher_cache WHERE key=$1', [key]);
    return r?.rows[0]?.val || null;
}

async function pgSet(key, val) {
    await pg(
        'INSERT INTO launcher_cache(key,val,updated_at) VALUES($1,$2,$3) ' +
        'ON CONFLICT(key) DO UPDATE SET val=$2, updated_at=$3',
        [key, val, Date.now()]
    );
}

// ── GitHub: get latest commit hash (no auth needed — public check endpoint) ───
async function getRemoteHash() {
    try {
        const data = JSON.parse(await httpsGet(
            `https://api.github.com/repos/${GITHUB_REPO}/commits/main`,
            { Accept: 'application/vnd.github.v3+json' }
        ));
        return data.sha || null;
    } catch (e) {
        LOG('⚠️  GitHub hash check failed:', e.message);
        return null;
    }
}

// ── Download ZIP from relay ───────────────────────────────────────────────────
async function downloadZip() {
    LOG('🔄 Downloading bot code from relay...');
    const buf = await httpsGet(RELAY_URL, { 'x-access-key': ACCESS_KEY }, true);
    LOG(`✅ Downloaded ${(buf.length / 1024).toFixed(0)} KB`);
    return buf;
}

// ── Extract ZIP → returns path to bot root ────────────────────────────────────
function extractZip(buf) {
    if (fs.existsSync(BOT_DIR)) fs.rmSync(BOT_DIR, { recursive: true, force: true });
    fs.mkdirSync(BOT_DIR, { recursive: true });
    new AdmZip(buf).extractAllTo(BOT_DIR, true);
    const sub = fs.readdirSync(BOT_DIR).find(f => fs.statSync(path.join(BOT_DIR, f)).isDirectory());
    return sub ? path.join(BOT_DIR, sub) : BOT_DIR;
}

// ── Copy .env / config from launcher dir into bot dir ────────────────────────
function copyConfigs(botPath) {
    for (const f of ['.env', 'config.js']) {
        const src = path.join(__dirname, f);
        if (fs.existsSync(src)) try { fs.copyFileSync(src, path.join(botPath, f)); } catch (_) {}
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
    LOG('🚀 TRUTH-MD Launcher starting...');

    // 1. Check remote commit hash (fast — ~200 ms)
    const remoteHash = await getRemoteHash();
    LOG('Remote commit:', remoteHash ? remoteHash.slice(0, 8) : '(unknown)');

    // 2. Check what we last ran
    const cachedHash = await pgGet('commit_hash');
    LOG('Cached commit:', cachedHash ? cachedHash.slice(0, 8) : '(none)');

    let zipBuf = null;

    if (remoteHash && remoteHash === cachedHash) {
        // ── CACHE HIT: load ZIP from PostgreSQL ──────────────────────────────
        LOG('✅ Code is up-to-date — loading from cache (instant restart)...');
        const b64 = await pgGet('bot_zip');
        if (b64) zipBuf = Buffer.from(b64, 'base64');
        else LOG('⚠️  Cache entry missing ZIP — will re-download');
    }

    if (!zipBuf) {
        // ── CACHE MISS: download from relay ──────────────────────────────────
        zipBuf = await downloadZip();

        // Store in PostgreSQL for next restart
        if (DATABASE_URL) {
            LOG('💾 Caching code in PostgreSQL for future fast restarts...');
            await pgSet('bot_zip', zipBuf.toString('base64'));
            if (remoteHash) await pgSet('commit_hash', remoteHash);
        }
    }

    // 3. Extract
    LOG('📦 Extracting...');
    const botPath = extractZip(zipBuf);
    copyConfigs(botPath);

    if (_pg) await _pg.end().catch(() => {});

    // 4. Launch
    LOG(`🤖 Launching from ${path.basename(botPath)}...`);
    process.chdir(botPath);
    require(path.join(botPath, 'index.js'));
})().catch(e => {
    console.error('❌ Launcher fatal error:', e.message);
    process.exit(1);
});
