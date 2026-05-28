#!/usr/bin/env node
/**
 * push-public.js
 * Syncs bot files from this private repo → Courtney250/TRUTH-MD (public repo)
 * so that users who fork the public repo can always pull the latest code.
 *
 * Usage:
 *   node push-public.js
 *
 * Requires one of these env vars to be set:
 *   COURTNEY_GITHUB_TOKEN  — Personal Access Token for the Courtney250 GitHub account
 *   GITHUB_PERSONAL_ACCESS_TOKEN — fallback (must have write access to Courtney250/TRUTH-MD)
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

const PUBLIC_REPO = process.env.PUBLIC_REPO || 'Courtney250/TRUTH-MD';
const TOKEN = (process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '').trim();

if (!TOKEN) {
    console.error('❌ GITHUB_PERSONAL_ACCESS_TOKEN is not set in your environment secrets.');
    process.exit(1);
}

// ── Files & folders to push ──────────────────────────────────────────────────
const ROOT_FILES = [
    'index.js', 'main.js', 'settings.js', 'config.js',
    'deployManager.js', 'ecosystem.config.js',
    'package.json', 'start.sh', 'Procfile', '.env.example',
    'health-check.sh', 'deploy-pterodactyl.sh'
];

const DIRS_TO_PUSH = ['commands', 'lib', 'plugins'];

// Files/patterns to never push (secrets, sessions, generated files)
const SKIP_FILES = new Set([
    '.env', 'push-public.js', 'main.py', 'addapi.js',
    'test-api.js', 'auth_state.db', 'store.db', 'chatbot.db',
    'settings.db', 'userSettings.db', 'messages.db'
]);

const SKIP_EXTENSIONS = new Set(['.db', '.log', '.zip', '.tgz', '.map']);

// ── Helpers ──────────────────────────────────────────────────────────────────
function githubRequest(method, urlPath, body) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const req = https.request({
            hostname: 'api.github.com',
            path: urlPath,
            method,
            headers: {
                'Authorization': `token ${TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'TRUTH-MD-push-public/1.0',
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
            }
        }, (res) => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode, body: raw }); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function getFileSha(filePath) {
    const r = await githubRequest('GET', `/repos/${PUBLIC_REPO}/contents/${filePath}?ref=main`);
    if (r.status === 200 && r.body.sha) return r.body.sha;
    return null;
}

async function pushFile(filePath, localPath) {
    const content = fs.readFileSync(localPath);
    const encoded = content.toString('base64');
    const sha     = await getFileSha(filePath);

    const body = {
        message: `sync: update ${filePath}`,
        content: encoded,
        branch: 'main'
    };
    if (sha) body.sha = sha;

    const r = await githubRequest('PUT', `/repos/${PUBLIC_REPO}/contents/${filePath}`, body);
    if (r.status === 200 || r.status === 201) {
        console.log(`  ✅ ${filePath}`);
        return true;
    } else {
        console.warn(`  ⚠️  ${filePath} — ${r.status}: ${JSON.stringify(r.body?.message || r.body)}`);
        return false;
    }
}

function shouldSkip(filename) {
    if (SKIP_FILES.has(filename)) return true;
    const ext = path.extname(filename);
    if (SKIP_EXTENSIONS.has(ext)) return true;
    return false;
}

function collectFiles() {
    const files = [];

    // Root-level files
    for (const f of ROOT_FILES) {
        if (fs.existsSync(f) && !shouldSkip(f)) {
            files.push({ local: f, remote: f });
        }
    }

    // Directory files
    for (const dir of DIRS_TO_PUSH) {
        if (!fs.existsSync(dir)) continue;
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
            if (shouldSkip(entry)) continue;
            const localPath  = path.join(dir, entry);
            const remotePath = `${dir}/${entry}`;
            if (fs.statSync(localPath).isFile()) {
                files.push({ local: localPath, remote: remotePath });
            }
        }
    }

    return files;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
    console.log(`\n🚀 Syncing private repo → ${PUBLIC_REPO}\n`);

    // Verify repo access
    const check = await githubRequest('GET', `/repos/${PUBLIC_REPO}`);
    if (check.status !== 200) {
        console.error(`❌ Cannot access ${PUBLIC_REPO} — check your token has write permission.`);
        console.error(`   Status: ${check.status} — ${JSON.stringify(check.body?.message)}`);
        process.exit(1);
    }
    console.log(`✅ Repo accessible: ${check.body.full_name} (${check.body.private ? 'private' : 'public'})\n`);

    const files = collectFiles();
    console.log(`📦 ${files.length} files to sync...\n`);

    let ok = 0, fail = 0;
    for (const { local, remote } of files) {
        const success = await pushFile(remote, local);
        if (success) ok++; else fail++;
        // Small delay to avoid GitHub rate limits
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`\n─────────────────────────────`);
    console.log(`✅ Pushed:  ${ok}`);
    if (fail > 0) console.log(`⚠️  Failed: ${fail}`);
    console.log(`🔗 https://github.com/${PUBLIC_REPO}`);
    console.log(`─────────────────────────────\n`);

    if (fail > 0) process.exit(1);
})();
