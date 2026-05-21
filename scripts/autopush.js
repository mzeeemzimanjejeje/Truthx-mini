/**
 * autopush.js — Instantly push new commits to GitHub the moment they appear.
 *
 * Uses fs.watch on .git/refs/heads/main so pushes fire the instant Replit
 * creates a checkpoint (no polling delay). A 3-second debounce prevents
 * duplicate pushes when the file is written multiple times in quick succession.
 * A fallback poll every 5 minutes catches anything the watcher might miss.
 */

require('dotenv').config();
const fs        = require('fs');
const path      = require('path');
const { spawnSync } = require('child_process');

const REPO_OWNER    = 'mzeeemzimanjejeje';
const REPO_NAME     = 'Maintaining';
const BRANCH        = 'main';
const POLL_MS       = 5 * 60 * 1000;   // fallback poll every 5 minutes
const DEBOUNCE_MS   = 3000;            // wait 3 s after last change before pushing
const GIT_REF_FILE  = path.join(process.cwd(), '.git', 'refs', 'heads', BRANCH);
const REMOTE_URL    = () =>
    `https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/${REPO_OWNER}/${REPO_NAME}.git`;

function log(msg) {
    const ts = new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi', hour12: false });
    console.log(`[autopush] ${ts} — ${msg}`);
}

function run(cmd) {
    return spawnSync('bash', ['-c', cmd], {
        encoding: 'utf8',
        cwd: process.cwd(),
        env: { ...process.env }
    });
}

function aheadCount() {
    run(`git fetch ${REMOTE_URL()} ${BRANCH}:refs/remotes/origin/${BRANCH} --quiet 2>/dev/null || true`);
    const res = run(`git rev-list --count origin/${BRANCH}..HEAD 2>/dev/null || echo 0`);
    return parseInt((res.stdout || '0').trim(), 10) || 0;
}

function push() {
    const res = run(`git push ${REMOTE_URL()} HEAD:${BRANCH} 2>&1`);
    if (res.status !== 0) {
        const err = (res.stdout + res.stderr).trim();
        if (err.includes('rejected') || err.includes('non-fast-forward')) {
            log('Push rejected (non-fast-forward) — pulling with rebase to reconcile...');
            const pull = run(`git pull --rebase ${REMOTE_URL()} ${BRANCH} 2>&1`);
            if (pull.status !== 0) {
                throw new Error(`Rebase failed — manual intervention required: ${(pull.stdout + pull.stderr).trim()}`);
            }
            const retry = run(`git push ${REMOTE_URL()} HEAD:${BRANCH} 2>&1`);
            if (retry.status !== 0) {
                throw new Error(`Push after rebase failed — manual intervention required: ${(retry.stdout + retry.stderr).trim()}`);
            }
        } else {
            throw new Error(err);
        }
    }
}

let _busy   = false;
let _timer  = null;

function schedulePush(reason) {
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(async () => {
        _timer = null;
        if (_busy) { schedulePush('retry-busy'); return; }
        _busy = true;
        try {
            if (!process.env.GITHUB_TOKEN) { log('⚠️  GITHUB_TOKEN not set — skipping'); return; }
            const ahead = aheadCount();
            if (ahead === 0) { log('✅ Up to date — nothing to push'); return; }
            log(`📦 ${ahead} new commit(s) detected (${reason}) — pushing now...`);
            push();
            log(`✅ Pushed ${ahead} commit(s) to ${REPO_OWNER}/${REPO_NAME}:${BRANCH}`);
        } catch (err) {
            log(`❌ Push failed: ${err.message}`);
        } finally {
            _busy = false;
        }
    }, DEBOUNCE_MS);
}

function watchRefFile() {
    // Watch the git ref file for the branch — changes the instant a commit lands
    const refDir = path.dirname(GIT_REF_FILE);
    if (!fs.existsSync(refDir)) {
        log(`⚠️  Ref dir not found (${refDir}) — watcher skipped, relying on poll`);
        return;
    }

    try {
        // Watch the directory so we catch file creation too (first commit edge case)
        fs.watch(refDir, (event, filename) => {
            if (filename === BRANCH || filename === `${BRANCH}.lock`) {
                if (filename.endsWith('.lock')) return; // ignore lock files
                schedulePush('watcher');
            }
        });
        log(`👁  Watching .git/refs/heads/ for instant push on new commits`);
    } catch (err) {
        log(`⚠️  Watcher failed (${err.message}) — relying on poll only`);
    }
}

async function main() {
    log(`🚀 Auto-push started`);
    log(`📌 Target: ${REPO_OWNER}/${REPO_NAME}:${BRANCH}`);
    log(`⚡ Mode: instant watcher + ${POLL_MS / 60000}-min fallback poll`);

    // Push immediately on startup in case commits built up while stopped
    schedulePush('startup');

    // Watch git ref for instant push
    watchRefFile();

    // Fallback poll in case watcher misses anything
    setInterval(() => schedulePush('poll'), POLL_MS);
}

process.on('SIGTERM', () => { log('Shutting down'); process.exit(0); });
process.on('SIGINT',  () => { log('Shutting down'); process.exit(0); });

main();
