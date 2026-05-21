const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
const OWNER = 'mzeeemzimanjejeje';
const REPO  = 'Truthx-mini';

if (!TOKEN) { console.error('GITHUB_PERSONAL_ACCESS_TOKEN not set'); process.exit(1); }

function ghRequest(method, endpoint, body) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const req = https.request({
            hostname: 'api.github.com',
            path: endpoint,
            method,
            headers: {
                'Authorization': `token ${TOKEN}`,
                'Content-Type': 'application/json',
                'User-Agent': 'TRUTH-MD-Bot',
                'Accept': 'application/vnd.github.v3+json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
            }
        }, res => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(raw); } });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS  = new Set(['node_modules', '.git', 'tmp', 'temp', 'status_capture', 'baileys_store', '.cache', '.local', 'session', 'auth_info_baileys', 'attached_assets']);
const SKIP_FILES = new Set(['.env', '.env.local', 'baileys_store.json', 'message_backup.json', 'session_id.hash', 'login.json', 'owner.json', 'sudo.json', 'premium.json', 'banned.json', 'lidmap.json', 'messageCount.json', 'antibadword.json', 'antiout.json', 'antipromote.json', 'state.json', 'userGroupData.json', 'groupTracker.json', 'payments.json', 'sessionErrorCount.json']);
const SKIP_EXT   = new Set(['.log', '.zip', '.session', '.db', '.db-wal', '.db-shm']);

function walkDir(dir, base) {
    base = base || '';
    const results = [];
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
    for (const e of entries) {
        if (e.name.startsWith('.') && e.isDirectory()) continue;
        const rel  = base ? base + '/' + e.name : e.name;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (SKIP_DIRS.has(e.name)) continue;
            results.push.apply(results, walkDir(full, rel));
        } else {
            if (SKIP_FILES.has(e.name)) continue;
            if (SKIP_EXT.has(path.extname(e.name))) continue;
            if (e.name.includes('download')) continue;
            results.push({ rel, full });
        }
    }
    return results;
}

async function pushAll() {
    const files = walkDir(ROOT);
    console.log(`Uploading ${files.length} files to github.com/${OWNER}/${REPO} ...`);

    // Check if repo already has a main branch
    let refCheck = await ghRequest('GET', `/repos/${OWNER}/${REPO}/git/refs/heads/main`);
    let hasMain  = !refCheck.message;
    let parentSha  = null;
    let baseTree   = null;

    // Seed empty repo with a stub file first (GitHub API blocks blobs on empty repos)
    if (!hasMain) {
        console.log('Seeding empty repo with initial commit...');
        const seed = await ghRequest('PUT', `/repos/${OWNER}/${REPO}/contents/README.md`, {
            message: 'chore: initial commit',
            content: Buffer.from('# Truthx-mini\nMulti-user WhatsApp Bot Platform\n').toString('base64')
        });
        if (!seed.commit) { console.error('Seed failed:', JSON.stringify(seed).slice(0, 200)); process.exit(1); }
        parentSha = seed.commit.sha;
        baseTree  = seed.commit.tree.sha;
        hasMain   = true;
        console.log('Seed commit:', parentSha.slice(0, 7));
    } else if (refCheck.object) {
        parentSha = refCheck.object.sha;
        const commit = await ghRequest('GET', `/repos/${OWNER}/${REPO}/git/commits/${parentSha}`);
        baseTree = commit.tree ? commit.tree.sha : null;
        console.log(`Updating existing branch on top of commit ${parentSha.slice(0, 7)}`);
    }

    // Upload blobs in small parallel batches
    const treeItems = [];
    let done = 0;
    const BATCH = 8;

    for (let i = 0; i < files.length; i += BATCH) {
        const chunk = files.slice(i, i + BATCH);
        await Promise.all(chunk.map(async ({ rel, full }) => {
            try {
                const raw = fs.readFileSync(full);
                const b64 = raw.toString('base64');
                const blob = await ghRequest('POST', `/repos/${OWNER}/${REPO}/git/blobs`, { content: b64, encoding: 'base64' });
                if (blob.sha) {
                    treeItems.push({ path: rel, mode: '100644', type: 'blob', sha: blob.sha });
                } else {
                    console.warn(`  Skipped ${rel}: ${blob.message || 'no sha'}`);
                }
            } catch (e) {
                console.warn(`  Skipped ${rel}: ${e.message}`);
            }
        }));
        done += chunk.length;
        if (done % 40 === 0 || done >= files.length) process.stdout.write(`  ${done}/${files.length} blobs\r`);
    }
    console.log(`\n${treeItems.length} blobs ready. Creating tree...`);

    const treeBody = { tree: treeItems };
    if (baseTree) treeBody.base_tree = baseTree;
    const tree = await ghRequest('POST', `/repos/${OWNER}/${REPO}/git/trees`, treeBody);
    if (!tree.sha) { console.error('Tree failed:', JSON.stringify(tree).slice(0, 200)); process.exit(1); }
    console.log('Tree SHA:', tree.sha.slice(0, 7));

    const commitBody = {
        message: 'feat: multi-user WhatsApp bot platform\n\n- lib/userAuthState.js — per-user PostgreSQL auth\n- lib/instanceManager.js — manage multiple WA connections\n- public/index.html — web pairing UI (no session ID needed)\n- index.js — multi-user API routes (/users, /api/users/*)',
        tree: tree.sha,
        parents: parentSha ? [parentSha] : []
    };
    const commit = await ghRequest('POST', `/repos/${OWNER}/${REPO}/git/commits`, commitBody);
    if (!commit.sha) { console.error('Commit failed:', JSON.stringify(commit).slice(0, 200)); process.exit(1); }
    console.log('Commit SHA:', commit.sha.slice(0, 7));

    let branchRes;
    if (hasMain) {
        branchRes = await ghRequest('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/main`, { sha: commit.sha, force: false });
    } else {
        branchRes = await ghRequest('POST', `/repos/${OWNER}/${REPO}/git/refs`, { ref: 'refs/heads/main', sha: commit.sha });
    }

    if (branchRes.ref || (branchRes.object && branchRes.object.sha)) {
        console.log(`\nDone! https://github.com/${OWNER}/${REPO}`);
    } else {
        console.error('Branch update response:', JSON.stringify(branchRes).slice(0, 200));
    }
}

pushAll().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
