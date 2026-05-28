const https = require('https');
const settings = require('../settings');
const path = require('path');
const fs = require('fs');

let _updateCache = null;
let _notifierTimer = null;
let _lastNotifiedVersion = null;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const KNOWN_BROKEN_REPOS = ['Courtney250/TRUTH-MD'];

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'TRUTH-MD-UpdateChecker/1.0' } }, res => {
            let data = '';
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => req.destroy(new Error('timeout')));
    });
}

const NIX_GIT_PATH = '/nix/store/60rvdhr04h70r6dyybakaqzbwy15vwdc-replit-runtime-path/bin';

function getGitToken() {
    return (process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '').trim();
}

function apiRequest(apiPath, token, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
        const opts = {
            hostname: 'api.github.com',
            path: apiPath,
            headers: {
                'User-Agent': 'TRUTH-MD-UpdateChecker/1.0',
                'Accept': 'application/vnd.github.v3+json',
                ...(token ? { 'Authorization': `token ${token}` } : {})
            },
            timeout: timeoutMs
        };
        require('https').get(opts, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        }).on('error', reject).on('timeout', function() { this.destroy(new Error('timeout')); });
    });
}

async function checkViaGit() {
    const { exec } = require('child_process');
    const extraPath = [NIX_GIT_PATH, '/usr/bin', '/usr/local/bin'].join(':');
    const GIT_ENV = {
        ...process.env,
        PATH: `${extraPath}:${process.env.PATH || ''}`,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: 'echo',
        GIT_SSH_COMMAND: 'ssh -o BatchMode=yes'
    };
    const run = cmd => new Promise((res, rej) => exec(cmd, { timeout: 15000, env: GIT_ENV }, (e, out, err) => e ? rej(new Error(err || out || e.message)) : res(out.trim())));

    const gitDir = path.join(process.cwd(), '.git');
    if (!fs.existsSync(gitDir)) return null;

    const token = getGitToken();
    const repo = settings.githubRepo || '';

    // Try GitHub API first (works on Replit where git fetch is blocked by gitsafe)
    if (token && repo) {
        try {
            const oldRev = await run('git rev-parse HEAD').catch(() => '');
            const apiRes = await apiRequest(`/repos/${repo}/commits/main`, token);
            if (apiRes.status === 200 && apiRes.body?.sha) {
                const newRev = apiRes.body.sha;
                if (!oldRev || oldRev === newRev) return { available: false, method: 'git', currentRev: oldRev || newRev };
                const compareRes = await apiRequest(`/repos/${repo}/compare/${oldRev}...${newRev}`, token).catch(() => null);
                let commits = '', fileCount = 0;
                if (compareRes?.status === 200 && compareRes.body) {
                    commits = (compareRes.body.commits || []).slice(-10).map(c => `• ${c.commit.message.split('\n')[0]}`).join('\n');
                    fileCount = compareRes.body.files?.length || 0;
                }
                return { available: true, method: 'git', oldRev, newRev, commits, fileCount };
            }
        } catch (_) {}
    }

    // Fast visibility check — avoids a 15 s hang on private repos with no token
    if (!token && repo) {
        try {
            const visRes = await apiRequest(`/repos/${repo}`, '', 5000);
            if (visRes.status === 404 || visRes.status === 403 || visRes.status === 401) {
                return null; // Private repo, no token — silently skip
            }
        } catch { /* network error — fall through and let git try */ }
    }

    try {
        const oldRev = await run('git rev-parse HEAD').catch(() => '');
        if (!oldRev) return null;

        await run('git fetch --depth 1 origin main').catch(() => run('git fetch origin main'));
        const newRev = await run('git rev-parse origin/main').catch(() => '');
        if (!newRev) return null;

        if (oldRev === newRev) return { available: false, method: 'git', currentRev: oldRev };

        let commits = '', fileCount = 0;
        try {
            commits = (await run(`git log --pretty=format:"• %s" ${oldRev}..${newRev}`)).trim();
            const files = (await run(`git diff --name-only ${oldRev} ${newRev}`)).trim();
            fileCount = files ? files.split('\n').length : 0;
        } catch {}

        return { available: true, method: 'git', oldRev, newRev, commits, fileCount };
    } catch {
        return null;
    }
}

async function checkViaVersion() {
    // Prefer public repo for version check (no auth needed, obfuscated public release)
    const publicRepo = (process.env.PUBLIC_REPO || settings.publicRepo || '').trim();
    const privateRepo = settings.githubRepo || '';

    // Try public repo first (accessible without token)
    if (publicRepo) {
        const url = `https://raw.githubusercontent.com/${publicRepo}/main/package.json`;
        try {
            const remote = await fetchJson(url);
            const local = require('../package.json');
            if (remote.version && local.version) {
                if (remote.version !== local.version) {
                    return { available: true, localVersion: local.version, remoteVersion: remote.version, method: 'version', source: 'public' };
                }
                return { available: false, localVersion: local.version, source: 'public' };
            }
        } catch (_) {}
    }

    // Fall back to private repo version check (needs token or public)
    const repo = privateRepo;
    if (!repo || KNOWN_BROKEN_REPOS.includes(repo)) return null;

    const url = `https://raw.githubusercontent.com/${repo}/main/package.json`;
    try {
        const remote = await fetchJson(url);
        const local = require('../package.json');
        if (!remote.version || !local.version) return null;
        if (remote.version !== local.version) {
            return { available: true, localVersion: local.version, remoteVersion: remote.version, method: 'version' };
        }
        return { available: false, localVersion: local.version };
    } catch {
        return null;
    }
}

async function checkForUpdatesVerified() {
    // On Replit, code is always the live dev version — update checks are not meaningful
    if (process.env.REPL_ID || process.env.REPL_SLUG || process.env.REPLIT_DB_URL) {
        return { available: false, method: 'replit' };
    }

    const gitResult = await checkViaGit();
    if (gitResult !== null) return gitResult;

    const versionResult = await checkViaVersion();
    if (versionResult !== null) return versionResult;

    return { available: false, method: 'none' };
}

function getCachedUpdate() {
    return _updateCache;
}

function getOwnerJid() {
    const num = (global.OWNER_NUMBER || process.env.OWNER_NUMBER || settings.ownerNumber || '').replace(/[^0-9]/g, '');
    if (!num) return null;
    return `${num}@s.whatsapp.net`;
}

function getUpdateKey(result) {
    if (result.method === 'git' && result.newRev) return result.newRev;
    if (result.method === 'version' && result.remoteVersion) return result.remoteVersion;
    return null;
}

async function runCheck(sock) {
    try {
        const result = await checkForUpdatesVerified();
        _updateCache = result;

        if (!result || !result.available) return;

        const updateKey = getUpdateKey(result);
        if (updateKey && updateKey === _lastNotifiedVersion) return;

        const ownerJid = getOwnerJid();
        if (!ownerJid || !sock) return;

        let msg = `🆙 *TRUTH-MD Update Available!*\n\n`;

        if (result.method === 'version') {
            msg += `Current: *v${result.localVersion}*\n`;
            msg += `Latest:  *v${result.remoteVersion}*\n\n`;
        } else if (result.method === 'git' && result.oldRev) {
            msg += `${result.oldRev.substring(0, 7)} → ${result.newRev.substring(0, 7)}\n`;
            if (result.fileCount) msg += `Files changed: ${result.fileCount}\n`;
            if (result.commits) msg += `\n*Changes:*\n${result.commits}\n\n`;
        }

        msg += `Run *.update* to install the latest version.`;

        try {
            await sock.sendMessage(ownerJid, { text: msg });
            if (updateKey) _lastNotifiedVersion = updateKey;
        } catch {}
    } catch (err) {
        console.error('[UpdateCheck] Error:', err.message);
    }
}

function startUpdateNotifier(sock) {
    if (_notifierTimer) clearInterval(_notifierTimer);

    setTimeout(() => runCheck(sock), 60 * 1000);

    _notifierTimer = setInterval(() => runCheck(sock), CHECK_INTERVAL_MS);
}

function stopUpdateNotifier() {
    if (_notifierTimer) { clearInterval(_notifierTimer); _notifierTimer = null; }
}

module.exports = { startUpdateNotifier, stopUpdateNotifier, getCachedUpdate, runCheck };
