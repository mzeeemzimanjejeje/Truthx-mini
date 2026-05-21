const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const settings = require('../settings');
const { rmSync } = require('fs');

const NIX_GIT_PATH = '/nix/store/60rvdhr04h70r6dyybakaqzbwy15vwdc-replit-runtime-path/bin';

function run(cmd, options = {}) {
    return new Promise((resolve, reject) => {
        const extraPath = [NIX_GIT_PATH, '/usr/bin', '/usr/local/bin'].join(':');
        const env = {
            ...process.env,
            PATH: `${extraPath}:${process.env.PATH || ''}`,
            GIT_TERMINAL_PROMPT: '0',
            GIT_ASKPASS: 'echo',
            GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
            ...(options.env || {})
        };
        exec(cmd, { windowsHide: true, timeout: options.timeout || 60000, env }, (err, stdout, stderr) => {
            if (err) {
                let msg = (stderr || stdout || err.message || '').toString();
                const token = getGitToken();
                if (token) msg = msg.split(token).join('***');
                return reject(new Error(msg));
            }
            resolve((stdout || '').toString());
        });
    });
}

function apiRequest(apiPath, token, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const opts = {
            hostname: 'api.github.com',
            path: apiPath,
            headers: {
                'User-Agent': 'TRUTH-MD-Updater/1.0',
                'Accept': 'application/vnd.github.v3+json',
                ...(token ? { 'Authorization': `token ${token}` } : {})
            }
        };
        const req = require('https').get(opts, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
            res.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => req.destroy(new Error(`API timeout after ${timeoutMs / 1000}s`)));
    });
}

// Quick unauthenticated check to see if a repo is publicly accessible.
// Returns true if public, false if private/missing, null on network error.
async function isRepoPublic(repo) {
    try {
        const res = await apiRequest(`/repos/${repo}`, '', 5000);
        return res.status === 200;
    } catch {
        return null;
    }
}

// Wraps any promise so it can never hang forever.
function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function getGitToken() {
    // GITHUB_PERSONAL_ACCESS_TOKEN is the Replit-managed token name; also accept the
    // standard GITHUB_TOKEN / GH_TOKEN names so Heroku config vars work too.
    return (
        process.env.GITHUB_TOKEN ||
        process.env.GH_TOKEN ||
        process.env.GITHUB_PERSONAL_ACCESS_TOKEN ||
        ''
    ).trim();
}

function getAuthenticatedRemoteUrl() {
    const token = getGitToken();
    if (!token) return null;
    try {
        const configPath = path.join(process.cwd(), '.git', 'config');
        const config = fs.readFileSync(configPath, 'utf8');
        const match = config.match(/url\s*=\s*https:\/\/(?:[^@]+@)?github\.com\/(.+)/m);
        if (match) {
            const repoPath = match[1].replace(/\.git\s*$/, '').trim();
            return `https://${token}@github.com/${repoPath}.git`;
        }
    } catch {}
    const repo = settings.githubRepo;
    if (repo) return `https://${token}@github.com/${repo}.git`;
    return null;
}

function isAuthError(errorMessage) {
    const msg = (errorMessage || '').toLowerCase();
    return msg.includes('authentication') || msg.includes('403') ||
        msg.includes('404') || msg.includes('could not read') ||
        msg.includes('terminal prompts disabled') || msg.includes('denied') ||
        msg.includes('repository not found');
}

function getRepoPath() {
    try {
        const configPath = path.join(process.cwd(), '.git', 'config');
        const config = fs.readFileSync(configPath, 'utf8');
        const match = config.match(/url\s*=\s*https:\/\/(?:[^@]+@)?github\.com\/(.+)/m);
        if (match) return match[1].replace(/\.git\s*$/, '').trim();
    } catch {}
    return settings.githubRepo || '';
}

async function hasGitRepo() {
    // Only check for the .git directory — git CLI may be blocked (e.g. Replit
    // gitsafe) but we can still use GitHub API + ZIP updates.
    return fs.existsSync(path.join(process.cwd(), '.git'));
}

const PROTECTED_PATHS = [
    'session', 'sessions', 'data', 'database', 'auth_info_baileys',
    '.env', 'baileys_store.json', 'settings.js',
    'message_backup.json', 'sessionErrorCount.json',
    'lib/userSettings.js', 'lib/sqliteAuthState.js', 'lib/cleanup.js'
];

// Critical files that must ALWAYS be preserved during updates
const CRITICAL_FILES = [
    'data/user_settings.db',           // User settings database (SQLite)
    'data/config.db',                  // Bot config (AUTOTYPING, ALWAYSONLINE, CHATBOT, etc.)
    'data/custom_apis.json',           // Custom fallback APIs
    'data/owner.json',                 // Owner number
    'data/sudo.json',                  // Sudo users list
    'data/prefix.json',                // Bot prefix
    'data/deployments.json',           // Deployment data
    'database/usersettings.json'       // Per-user persistent settings (JSON)
];

function backupProtected() {
    const backed = {};

    for (const p of PROTECTED_PATHS) {
        const full = path.join(process.cwd(), p);
        if (!fs.existsSync(full)) continue;
        const stat = fs.lstatSync(full);
        if (stat.isDirectory()) {
            const tmpCopy = full + '_update_bak';
            try {
                if (fs.existsSync(tmpCopy)) fs.rmSync(tmpCopy, { recursive: true, force: true });
                fs.cpSync(full, tmpCopy, { recursive: true });
                backed[p] = { type: 'dir', backup: tmpCopy };
            } catch {}
        } else {
            const tmpCopy = full + '.update_bak';
            try {
                fs.copyFileSync(full, tmpCopy);
                backed[p] = { type: 'file', backup: tmpCopy };
            } catch {}
        }
    }
    return backed;
}

function restoreProtected(backed) {
    for (const [p, info] of Object.entries(backed)) {
        const full = path.join(process.cwd(), p);
        try {
            if (info.type === 'dir') {
                if (fs.existsSync(full)) fs.rmSync(full, { recursive: true, force: true });
                fs.cpSync(info.backup, full, { recursive: true });
                fs.rmSync(info.backup, { recursive: true, force: true });
            } else {
                fs.copyFileSync(info.backup, full);
                fs.unlinkSync(info.backup);
            }
        } catch {}
    }
}

async function updateViaGit() {
    const oldRev = (await run('git rev-parse HEAD').catch(() => 'unknown')).trim();
    const authUrl = getAuthenticatedRemoteUrl();
    const fetchTarget = authUrl || 'origin';
    // Use explicit 20 s timeouts so a private-repo hang never blocks the caller
    await run(`git fetch --depth 1 ${fetchTarget} main`, { timeout: 20000 }).catch(() =>
        run(`git fetch ${fetchTarget} main`, { timeout: 20000 })
    );
    if (authUrl) {
        await run(`git update-ref refs/remotes/origin/main FETCH_HEAD`).catch(() => {});
    }
    const newRev = (await run('git rev-parse origin/main').catch(() => '')).trim();

    if (!newRev) {
        throw new Error('Could not fetch latest commit from origin/main');
    }

    const alreadyUpToDate = oldRev === newRev;
    let commits = '';
    let files = '';

    if (!alreadyUpToDate) {
        commits = await run(`git log --pretty=format:"%h %s (%an)" ${oldRev}..${newRev} 2>/dev/null`).catch(() => '');
        files = await run(`git diff --name-status ${oldRev} ${newRev} 2>/dev/null`).catch(() => '');

        // settings.js is in PROTECTED_PATHS — backupProtected/restoreProtected handles it untouched

        // Backup critical files explicitly
        console.log('💾 Backing up critical files before update...');
        const criticalBackup = {};
        for (const filePath of CRITICAL_FILES) {
            const fullPath = path.join(process.cwd(), filePath);
            if (fs.existsSync(fullPath)) {
                try {
                    console.log(`  ✅ Backing up: ${filePath}`);
                    const backupPath = fullPath + '.critical_backup';
                    fs.copyFileSync(fullPath, backupPath);
                    criticalBackup[filePath] = backupPath;
                } catch (e) {
                    console.log(`  ⚠️ Failed to backup ${filePath}: ${e.message}`);
                }
            }
        }

        const backed = backupProtected();

        try {
            try {
                await run('git stash');
            } catch {}
            const pullTarget = authUrl || 'origin';
            await run(`git pull --rebase --no-tags ${pullTarget} main`).catch(() =>
                run('git reset --hard origin/main')
            );
        } finally {
            restoreProtected(backed);
            
            // Restore critical files
            console.log('♻️ Restoring critical files after update...');
            for (const [filePath, backupPath] of Object.entries(criticalBackup)) {
                try {
                    const fullPath = path.join(process.cwd(), filePath);
                    // Ensure directory exists
                    const fileDir = path.dirname(fullPath);
                    if (!fs.existsSync(fileDir)) {
                        fs.mkdirSync(fileDir, { recursive: true });
                    }
                    fs.copyFileSync(backupPath, fullPath);
                    fs.unlinkSync(backupPath); // Remove backup after restore
                    console.log(`  ✅ Restored: ${filePath}`);
                } catch (e) {
                    console.log(`  ⚠️ Failed to restore ${filePath}: ${e.message}`);
                }
            }
        }

    }

    try {
        const { runGuard } = require('../lib/gitguard');
        runGuard();
    } catch {}

    return { oldRev, newRev, alreadyUpToDate, commits, files };
}

function downloadFile(url, dest, visited = new Set(), retries = 3, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        try {
            if (visited.has(url) || visited.size > 5) {
                return reject(new Error('Too many redirects'));
            }
            visited.add(url);

            const useHttps = url.startsWith('https://');
            const client = useHttps ? require('https') : require('http');
            const GITHUB_HOSTS = ['github.com', 'api.github.com', 'codeload.github.com', 'objects.githubusercontent.com'];
            const currentHost = new URL(url).hostname;
            const safeHeaders = { ...extraHeaders };
            if (safeHeaders['Authorization'] && !GITHUB_HOSTS.includes(currentHost)) {
                delete safeHeaders['Authorization'];
            }
            const req = client.get(url, {
                headers: {
                    'User-Agent': 'TRUTH-MD-Updater/1.0',
                    'Accept': '*/*',
                    ...safeHeaders
                }
            }, res => {
                if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                    const location = res.headers.location;
                    if (!location) return reject(new Error(`HTTP ${res.statusCode} without Location`));
                    const nextUrl = new URL(location, url).toString();
                    res.resume();
                    return downloadFile(nextUrl, dest, visited, retries, extraHeaders).then(resolve).catch(reject);
                }

                // Retry on server-side errors (503, 502, 504, etc.)
                // Read the body first — if it contains a clear error (e.g. relay
                // returning "GitHub fetch failed: 401") fail immediately with a
                // useful message instead of burning time on pointless retries.
                if (res.statusCode >= 500) {
                    let errBody = '';
                    res.on('data', chunk => { errBody += chunk.toString(); });
                    res.on('end', () => {
                        errBody = errBody.trim().slice(0, 300);
                        const hasDetail = /github|fetch|unauthorized|token|auth/i.test(errBody);
                        if (hasDetail || retries <= 0) {
                            const isRelay = url.includes('vercel.app') || url.includes('relay');
                            const hint = isRelay
                                ? '\n\nFix: in your Vercel dashboard add a GITHUB_TOKEN env var with a token that can access the private source repo, then redeploy the relay.'
                                : '';
                            return reject(new Error(`HTTP ${res.statusCode} from update server: ${errBody}${hint}`));
                        }
                        const delay = (4 - retries) * 3000;
                        console.log(`[UPDATE] HTTP ${res.statusCode} — retrying in ${delay / 1000}s (${retries} left)...`);
                        setTimeout(() => {
                            downloadFile(url, dest, new Set(), retries - 1, extraHeaders).then(resolve).catch(reject);
                        }, delay);
                    });
                    return;
                }

                if (res.statusCode === 401 || res.statusCode === 403) {
                    res.resume();
                    const isRelay = url.includes('vercel.app') || url.includes('relay');
                    const msg = isRelay
                        ? `Relay returned HTTP ${res.statusCode} — set the RELAY_KEY environment variable to authenticate with your relay server (${new URL(url).hostname})`
                        : `HTTP ${res.statusCode} — authentication required. Set GITHUB_TOKEN env var with a GitHub personal access token.`;
                    return reject(Object.assign(new Error(msg), { statusCode: res.statusCode, isAuthError: true }));
                }

                if (res.statusCode !== 200) {
                    res.resume();
                    return reject(new Error(`HTTP ${res.statusCode}`));
                }

                const file = fs.createWriteStream(dest);
                res.pipe(file);
                file.on('finish', () => file.close(resolve));
                file.on('error', err => {
                    try { file.close(() => {}); } catch {}
                    fs.unlink(dest, () => reject(err));
                });
            });
            req.on('error', err => {
                fs.unlink(dest, () => {});
                if (retries > 0) {
                    console.log(`[UPDATE] Network error — retrying in 3s (${retries} left)...`);
                    setTimeout(() => {
                        downloadFile(url, dest, new Set(), retries - 1, extraHeaders).then(resolve).catch(reject);
                    }, 3000);
                } else {
                    reject(err);
                }
            });
            req.setTimeout(60000, () => {
                req.destroy(new Error('Download timeout'));
            });
        } catch (e) {
            reject(e);
        }
    });
}

async function extractZip(zipPath, outDir) {
    if (process.platform === 'win32') {
        const cmd = `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir.replace(/\\/g, '/')}' -Force"`;
        await run(cmd);
        return;
    }
    try {
        await run('command -v unzip');
        await run(`unzip -o '${zipPath}' -d '${outDir}'`);
        return;
    } catch {}
    try {
        await run('command -v 7z');
        await run(`7z x -y '${zipPath}' -o'${outDir}'`);
        return;
    } catch {}
    try {
        await run('busybox unzip -h');
        await run(`busybox unzip -o '${zipPath}' -d '${outDir}'`);
        return;
    } catch {}
    throw new Error("No system unzip tool found (unzip/7z/busybox). Git mode is recommended.");
}

// Copies src → dest recursively, skipping items in ignore[].
// changeLog entries: { status: 'added'|'modified'|'unchanged', file: 'rel/path' }
function copyRecursive(src, dest, ignore = [], relative = '', outList = [], changeLog = null) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
        if (ignore.includes(entry)) continue;
        const s    = path.join(src, entry);
        const d    = path.join(dest, entry);
        const rel  = path.join(relative, entry).replace(/\\/g, '/');
        const stat = fs.lstatSync(s);
        if (stat.isDirectory()) {
            copyRecursive(s, d, ignore, rel, outList, changeLog);
        } else {
            let status = 'added';
            if (changeLog && fs.existsSync(d)) {
                try {
                    const oldBuf = fs.readFileSync(d);
                    const newBuf = fs.readFileSync(s);
                    status = oldBuf.equals(newBuf) ? 'unchanged' : 'modified';
                } catch { status = 'modified'; }
            }
            fs.copyFileSync(s, d);
            if (outList) outList.push(rel);
            if (changeLog) changeLog.push({ status, file: rel });
        }
    }
}

function getRelayKey() {
    return (process.env.RELAY_KEY || settings.relayKey || '').trim();
}

function getPublicRepo() {
    return (process.env.PUBLIC_REPO || settings.publicRepo || '').trim();
}

function isRelayUrl(url) {
    return url && (url.includes('vercel.app') || url.includes('relay'));
}

function isPublicGithubZip(url) {
    return url && url.includes('github.com') && !url.includes('api.github.com');
}

function buildDownloadHeaders(zipUrl) {
    const headers = {};
    const token = getGitToken();
    const relayKey = getRelayKey();

    if (isRelayUrl(zipUrl)) {
        if (relayKey) headers['x-access-key'] = relayKey;
    } else if (isPublicGithubZip(zipUrl)) {
        // Public repo — no auth header needed
    } else if (token && zipUrl.includes('api.github.com')) {
        headers['Authorization'] = `token ${token}`;
        headers['Accept'] = 'application/vnd.github.v3+json';
    }
    return headers;
}

async function updateViaZip(sock, chatId, message, zipOverride) {
    const token = getGitToken();
    const relayKey = getRelayKey();
    const publicRepo = getPublicRepo();

    // ── Priority 1: Relay (public repo index.js → pulls from private repo) ──
    // The relay at updateZipUrl is backed by the public repo's index.js which
    // handles authentication to the private repo internally. Always try this
    // first so Heroku/panel deployments without GITHUB_TOKEN can still update.
    let zipUrl = zipOverride || '';
    if (!zipUrl) {
        const relayUrl = (settings.updateZipUrl || process.env.UPDATE_ZIP_URL || '').trim();
        if (relayUrl) {
            zipUrl = relayUrl;
            console.log(`[UPDATE] Using relay (public repo index.js): ${zipUrl}`);
        }
    }

    // ── Priority 2: GitHub API zipball (token + known repo) ───────────────
    // Direct GitHub access when token is available — faster than relay.
    if (!zipUrl && token) {
        const repo = getRepoPath();
        if (repo) {
            zipUrl = `https://api.github.com/repos/${repo}/zipball/main`;
            console.log(`[UPDATE] Using GitHub API zipball: ${zipUrl}`);
        }
    }

    // ── Priority 3: Public repo ZIP (no auth needed, obfuscated) ─────────
    if (!zipUrl && publicRepo) {
        zipUrl = `https://github.com/${publicRepo}/archive/refs/heads/main.zip`;
        console.log(`[UPDATE] Using public repo ZIP: ${zipUrl}`);
    }

    if (!zipUrl) {
        throw new Error('No update source configured. Set PUBLIC_REPO env var with your public GitHub repo (owner/repo).');
    }

    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const zipPath = path.join(tmpDir, 'update.zip');

    // Build ordered fallback list (skip URLs already set as primary)
    const _buildFallbacks = () => {
        const list = [];
        // Fallback A: GitHub API zipball (token path, fastest when available)
        if (token) {
            const repo = getRepoPath();
            if (repo) {
                const apiUrl = `https://api.github.com/repos/${repo}/zipball/main`;
                if (apiUrl !== zipUrl) list.push({ url: apiUrl, label: 'GitHub API zipball' });
            }
        }
        // Fallback B: Public repo ZIP
        if (publicRepo) {
            const pubUrl = `https://github.com/${publicRepo}/archive/refs/heads/main.zip`;
            if (pubUrl !== zipUrl) list.push({ url: pubUrl, label: 'public repo ZIP' });
        }
        // Fallback C: Relay (if relay wasn't already the primary)
        const relayUrl = (settings.updateZipUrl || process.env.UPDATE_ZIP_URL || '').trim();
        if (relayUrl && relayUrl !== zipUrl) list.push({ url: relayUrl, label: 'relay' });
        return list;
    };

    let headers = buildDownloadHeaders(zipUrl);
    try {
        await downloadFile(zipUrl, zipPath, new Set(), 3, headers);
    } catch (dlErr) {
        console.error(`[UPDATE] Primary download failed (${dlErr.message}) — trying fallbacks...`);
        const fallbacks = _buildFallbacks();
        let succeeded = false;
        for (const fb of fallbacks) {
            console.log(`[UPDATE] Trying ${fb.label}: ${fb.url}`);
            zipUrl = fb.url;
            headers = buildDownloadHeaders(zipUrl);
            try {
                await downloadFile(zipUrl, zipPath, new Set(), 3, headers);
                succeeded = true;
                break;
            } catch (fbErr) {
                console.error(`[UPDATE] ${fb.label} failed: ${fbErr.message}`);
            }
        }
        if (!succeeded) throw dlErr;
    }

    // Validate ZIP is not empty/corrupt before applying
    const zipStat = fs.statSync(zipPath);
    if (zipStat.size < 5000) {
        try { fs.rmSync(zipPath, { force: true }); } catch {}
        throw new Error('Downloaded ZIP is too small to be valid — the update source may be empty or broken. Update aborted to protect your bot files.');
    }

    const extractTo = path.join(tmpDir, 'update_extract');
    if (fs.existsSync(extractTo)) fs.rmSync(extractTo, { recursive: true, force: true });
    await extractZip(zipPath, extractTo);

    const entries = fs.readdirSync(extractTo).map(n => path.join(extractTo, n));
    const root = entries.find(e => fs.lstatSync(e).isDirectory()) || extractTo;

    // Validate extracted content has expected bot files
    const requiredFiles = ['index.js', 'package.json'];
    const missingRequired = requiredFiles.filter(f => !fs.existsSync(path.join(root, f)));
    if (missingRequired.length > 0) {
        try { fs.rmSync(extractTo, { recursive: true, force: true }); } catch {}
        try { fs.rmSync(zipPath, { force: true }); } catch {}
        throw new Error(`Update ZIP is missing critical files (${missingRequired.join(', ')}) — update source may be empty. Update aborted.`);
    }

    const ignore = ['node_modules', '.git', 'session', 'sessions', 'auth_info_baileys', 'tmp', 'temp', 'data', 'database', 'baileys_store.json', '.env', '.replit', 'replit.nix', 'replit.md', 'settings.js'];
    const copied = [];

    // Backup critical files before ZIP extraction
    console.log('💾 Backing up critical files before ZIP update...');
    const criticalBackup = {};
    for (const filePath of CRITICAL_FILES) {
        const fullPath = path.join(process.cwd(), filePath);
        if (fs.existsSync(fullPath)) {
            try {
                console.log(`  ✅ Backing up: ${filePath}`);
                const backupPath = fullPath + '.critical_backup';
                fs.copyFileSync(fullPath, backupPath);
                criticalBackup[filePath] = backupPath;
            } catch (e) {
                console.log(`  ⚠️ Failed to backup ${filePath}: ${e.message}`);
            }
        }
    }

    // settings.js is in the ignore list — it is never touched by ZIP extraction
    const backedProtected = backupProtected();
    const changeLog = [];
    copyRecursive(root, process.cwd(), ignore, '', copied, changeLog);
    restoreProtected(backedProtected);

    // Restore critical files after ZIP update
    console.log('♻️ Restoring critical files after ZIP update...');
    for (const [filePath, backupPath] of Object.entries(criticalBackup)) {
        try {
            const fullPath = path.join(process.cwd(), filePath);
            // Ensure directory exists
            const fileDir = path.dirname(fullPath);
            if (!fs.existsSync(fileDir)) {
                fs.mkdirSync(fileDir, { recursive: true });
            }
            fs.copyFileSync(backupPath, fullPath);
            fs.unlinkSync(backupPath); // Remove backup after restore
            console.log(`  ✅ Restored: ${filePath}`);
        } catch (e) {
            console.log(`  ⚠️ Failed to restore ${filePath}: ${e.message}`);
        }
    }

    try { fs.rmSync(extractTo, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(zipPath, { force: true }); } catch {}
    return { copiedFiles: copied, changeLog };
}

// Build a human-readable update summary from a ZIP changeLog.
// Only shows added/modified files (skips unchanged).
// Prioritises commands/ and lib/ lines; caps total output to avoid flooding.
function _buildZipSummary(changeLog, copiedCount) {
    const added    = changeLog.filter(e => e.status === 'added').map(e => `➕ ${e.file}`);
    const modified = changeLog.filter(e => e.status === 'modified').map(e => `✏️  ${e.file}`);
    const changed  = [...modified, ...added];

    if (changed.length === 0) {
        return `✅ Updated via ZIP — ${copiedCount} files applied (no content changes detected).`;
    }

    // Prioritise commands/ and lib/ — users care most about those
    const priority = changed.filter(l => l.includes('commands/') || l.includes('lib/'));
    const rest     = changed.filter(l => !l.includes('commands/') && !l.includes('lib/'));
    const ordered  = [...priority, ...rest];

    const MAX = 20;
    const shown   = ordered.slice(0, MAX);
    const hidden  = ordered.length - shown.length;

    let out = `✅ *Updated via ZIP*\n`;
    out += `📊 ${modified.length} modified · ${added.length} new\n`;
    out += `\n*Changed files:*\n${shown.join('\n')}`;
    if (hidden > 0) out += `\n… and ${hidden} more`;
    return out;
}

async function _flushAndBackup() {
    // Flush any debounced writes that haven't fired yet (prevents data loss
    // when process.exit(0) fires within the 2-second debounce window).
    try { require('../lib/configdb').flushSync?.(); } catch (_) {}
    try { require('../lib/userSettings').flushSync?.(); } catch (_) {}
    try { require('../lib/userSettingsJson').saveSettings?.(); } catch (_) {}

    // Mirror all runtime data files to the persistent store so they survive
    // the relay hash change when Heroku restarts and downloads a new directory.
    try {
        const { backupAll } = require('../lib/persistentStore');
        const n = backupAll(process.cwd());
        if (n > 0) console.log(`[RESTART] Persisted ${n} data file(s) before exit.`);
    } catch (_) {}

    // Flush all config keys to bot_settings PG table (awaitable, guaranteed complete).
    // This ensures initFromPG() on next startup never loads stale values and overrides
    // the correct disk state. Must run AFTER flushSync() so disk is up-to-date.
    try {
        const { flushToPG } = require('../lib/configdb');
        await flushToPG();
    } catch (e) {
        console.error('[RESTART] configdb.flushToPG error:', e.message);
    }

    // Save all data files to PostgreSQL so they survive new Heroku deploys,
    // Render restarts without persistent disk, and other ephemeral environments.
    try {
        const pgData = require('../lib/pgDataStore');
        if (pgData.isAvailable()) {
            const n = await pgData.saveAll(process.cwd());
            if (n > 0) console.log(`[RESTART] Saved ${n} data file(s) to PostgreSQL before exit.`);
        }
    } catch (e) {
        console.error('[RESTART] pgData.saveAll error:', e.message);
    }
}

async function restartProcess(sock, chatId, message) {
    // Detect every known managed host. On all of these, the process manager
    // (Heroku, PM2, Replit workflow, Pterodactyl panel, Render, Railway, Koyeb)
    // will restart the dyno/container automatically after process.exit(0).
    // We ALWAYS prefer a clean exit over an internal reconnect because:
    //   1. Internal reconnect keeps old module cache in memory (new code not loaded).
    //   2. process.exit(0) + manager restart loads everything fresh from disk.
    const onHeroku   = !!process.env.DYNO;
    const onPM2      = !!process.env.PM2_HOME || !!process.env.pm_id;
    const onReplit   = !!process.env.REPL_ID  || !!process.env.REPLIT_DB_URL;
    const onPanel    = !!process.env.P_SERVER_UUID;                  // Pterodactyl
    const onRender   = !!process.env.RENDER;
    const onRailway  = !!process.env.RAILWAY_ENVIRONMENT;
    const onKoyeb    = !!process.env.KOYEB_APP_NAME;
    const isManaged  = onHeroku || onPM2 || onReplit || onPanel || onRender || onRailway || onKoyeb;

    try {
        await sock.sendMessage(chatId, { text: '> *Restarting bot 🔄 Please wait a moment...*' }, { quoted: message });
    } catch {}

    // Flush settings and backup BEFORE the wait so nothing is lost
    await _flushAndBackup();

    // Give the message time to deliver
    await new Promise(r => setTimeout(r, 2000));

    if (isManaged) {
        // Close the WhatsApp socket cleanly so WA doesn't see an abrupt drop.
        // Use global.currentSocket (set by index.js) — more reliable than the
        // sock argument which may be an old reference after multiple reconnects.
        const _sock = global.currentSocket || sock;
        try { _sock.ev?.removeAllListeners(); } catch (_) {}
        try { _sock.ws?.close?.();            } catch (_) {}
        global.currentSocket = null;
        global.isRestarting  = true;

        // Brief pause so the socket close frame can flush
        await new Promise(r => setTimeout(r, 500));

        console.log('[RESTART] Clean exit for managed restart...');
        process.exit(0);
        return;
    }

    // ── Bare node.js (no process manager detected) ───────────────────────────
    // Internal reconnect keeps the process alive. This path does NOT reload
    // modules from disk — use it only for .restart, not after a code update.
    console.log('[RESTART] Internal reconnect (no process manager detected)...');

    global.isRestarting = true;
    global.isBotConnected = false;
    global.reconnectAttempts = 0;
    global.isReconnecting = false;
    if (global.reconnectTimer) { clearTimeout(global.reconnectTimer); global.reconnectTimer = null; }

    const _oldSock = global.currentSocket || sock;
    try { _oldSock.ev?.removeAllListeners(); } catch (_) {}
    try { _oldSock.ws?.terminate?.() || _oldSock.ws?.close?.(); } catch (_) {}
    global.currentSocket = null;

    await new Promise(r => setTimeout(r, 3000));
    global.isRestarting = false;

    try {
        if (typeof global.startXeonBotInc === 'function') {
            global.startXeonBotInc().catch(e => console.error('[RESTART] Reconnect error:', e.message));
        } else {
            process.emit('internalRestart');
        }
    } catch (e) {
        console.error('[RESTART] Failed to restart internally:', e.message);
        process.exit(1);
    }
}

// ── Update state persistence ──────────────────────────────────────────────────
const LAST_UPDATE_FILE = path.join(process.cwd(), 'data', 'last_update.json');

function loadUpdateState() {
    try {
        if (fs.existsSync(LAST_UPDATE_FILE)) return JSON.parse(fs.readFileSync(LAST_UPDATE_FILE, 'utf8'));
    } catch {}
    return {};
}

function saveUpdateState(state) {
    try {
        fs.mkdirSync(path.dirname(LAST_UPDATE_FILE), { recursive: true });
        const current = loadUpdateState();
        fs.writeFileSync(LAST_UPDATE_FILE, JSON.stringify(
            { ...current, ...state, updatedAt: new Date().toISOString() }, null, 2
        ));
    } catch {}
}

// HEAD request to get ETag / Last-Modified without downloading the full content
function getRemoteSignature(url, headers = {}) {
    // Try HEAD first; if the server returns 405 (relay doesn't support HEAD),
    // retry with a Range GET to obtain response headers without downloading the file.
    const _attempt = (method, extraHeaders = {}) => new Promise((resolve) => {
        try {
            const client = url.startsWith('https') ? require('https') : require('http');
            const req = client.request(url, {
                method,
                headers: { 'User-Agent': 'TRUTH-MD-Updater/1.0', ...headers, ...extraHeaders }
            }, res => {
                res.destroy(); // never read the body
                if (method === 'HEAD' && res.statusCode === 405) {
                    resolve({ retry: true });
                    return;
                }
                const sig = res.headers['etag'] || res.headers['last-modified'] || res.headers['content-length'] || null;
                resolve({ sig });
            });
            req.on('error', () => resolve({ sig: null }));
            req.setTimeout(10000, () => { req.destroy(); resolve({ sig: null }); });
            req.end();
        } catch { resolve({ sig: null }); }
    });

    return (async () => {
        const first = await _attempt('HEAD');
        if (first.retry) {
            // Range GET: ask for just the first byte to get real headers cheaply
            const second = await _attempt('GET', { Range: 'bytes=0-0' });
            if (second.sig && second.sig !== first.sig) return second.sig;
            // Range GET also returned 405 (same ETag as HEAD error page) —
            // fall back to a full GET aborted right after headers. Content-Length
            // from the real 200 response is a reliable change indicator.
            const third = await _attempt('GET', {});
            return third.sig || null;
        }
        return first.sig || null;
    })();
}

// ── Update checker ────────────────────────────────────────────────────────────
// Relay is always the primary source — no GitHub token or git access needed.
// Git/GitHub is only attempted when no relay URL is configured at all.
async function checkForUpdates() {
    const relayUrl = (settings.updateZipUrl || process.env.UPDATE_ZIP_URL || '').trim();

    if (relayUrl) {
        // Check relay signature first (HEAD → Range-GET fallback).
        // If the relay is broken (5xx) its error page has a stable ETag that we
        // save after install — so subsequent checks correctly report "up to date"
        // until the relay is fixed and returns a different ETag.
        const headers = buildDownloadHeaders(relayUrl);
        const remoteSig = await getRemoteSignature(relayUrl, headers);
        const state = loadUpdateState();

        if (remoteSig && state.zipSignature && remoteSig === state.zipSignature) {
            const lastDate = state.updatedAt ? new Date(state.updatedAt).toLocaleString() : 'unknown';
            return { available: false, method: 'zip', lastUpdated: lastDate };
        }
        return { available: true, method: 'zip', useRelay: true, remoteSig, prevSig: state.zipSignature };
    }

    // ── No relay configured: fall back to git (last resort) ───────────────────
    if (!await hasGitRepo()) {
        return { available: false, method: 'none', error: 'No update source configured. Set UPDATE_ZIP_URL env var.' };
    }

    const token = getGitToken();
    const repo  = getRepoPath();

    // GitHub API path — only when a token is explicitly provided
    if (token && repo) {
        try {
            let oldRev = (await run('git rev-parse HEAD').catch(() => '')).trim();
            if (!oldRev) oldRev = loadUpdateState().gitRev || '';
            const apiRes = await apiRequest(`/repos/${repo}/commits/main`, token);
            if (apiRes.status === 200 && apiRes.body?.sha) {
                const newRev = apiRes.body.sha;
                if (!oldRev) { saveUpdateState({ gitRev: newRev }); return { available: false, method: 'git', currentRev: newRev }; }
                if (oldRev === newRev) return { available: false, method: 'git', currentRev: oldRev };
                const cmpRes = await apiRequest(`/repos/${repo}/compare/${oldRev}...${newRev}`, token).catch(() => null);
                let commits = '', changedFiles = [];
                if (cmpRes?.status === 200 && cmpRes.body?.commits) {
                    commits = cmpRes.body.commits.slice(-10).map(c => `• ${c.commit.message.split('\n')[0]}`).join('\n');
                    changedFiles = (cmpRes.body.files || []).slice(0, 20).map(f => {
                        const icon = f.status === 'added' ? '➕' : f.status === 'removed' ? '🗑️' : '✏️';
                        return `${icon} ${f.filename}`;
                    });
                }
                return { available: true, method: 'git', oldRev, newRev, commits, changedFiles, useApiZip: true };
            }
        } catch (_) {}
    }

    // Plain git fetch — public repos or token-authenticated private repos
    try {
        const oldRev = (await run('git rev-parse HEAD').catch(() => '')).trim();
        if (!oldRev) return { available: false, method: 'git', error: 'Could not read current revision' };
        const authUrl = getAuthenticatedRemoteUrl();
        const fetchTarget = authUrl || 'origin';
        await run(`git fetch --depth 1 ${fetchTarget} main`, { timeout: 12000 }).catch(() =>
            run(`git fetch ${fetchTarget} main`, { timeout: 12000 })
        );
        if (authUrl) await run('git update-ref refs/remotes/origin/main FETCH_HEAD').catch(() => {});
        const newRev = (await run('git rev-parse origin/main').catch(() => '')).trim();
        if (!newRev) return { available: false, method: 'git', error: 'Could not reach remote. For private repos set GITHUB_TOKEN.' };
        if (oldRev === newRev) return { available: false, method: 'git', currentRev: oldRev };
        let commits = '', changedFiles = [];
        try {
            commits = (await run(`git log --pretty=format:"• %s" ${oldRev}..${newRev}`)).trim();
            changedFiles = (await run(`git diff --name-status ${oldRev} ${newRev}`)).trim().split('\n').filter(Boolean).map(l => {
                const [st, ...rest] = l.trim().split(/\s+/);
                return `${st === 'A' ? '➕' : st === 'D' ? '🗑️' : '✏️'} ${rest.join(' ')}`;
            });
        } catch {}
        return { available: true, method: 'git', oldRev, newRev, commits, changedFiles };
    } catch (err) {
        return { available: false, method: 'git', error: err.message };
    }
}

async function updateCommand(sock, chatId, message, senderIsSudo, zipOverride) {
    const commandText = message.message?.extendedTextMessage?.text || message.message?.conversation || '';
    const isSimpleRestart = commandText.toLowerCase().includes('restart') && !commandText.toLowerCase().includes('update');

    if (!message.key.fromMe && !senderIsSudo) {
        await sock.sendMessage(chatId, { text: 'Only bot owner or sudo can use .restart or .update command' }, { quoted: message });
        return;
    }

    try {
        if (!isSimpleRestart) {
            await sock.sendMessage(chatId, { text: '*🔍 Checking for updates...*' }, { quoted: message });
            // fire-and-forget reaction so a stuck/incompatible reaction never blocks the flow
            sock.sendMessage(chatId, { react: { text: '🔍', key: message.key } }).catch(() => {});

            console.log('[update] Starting checkForUpdates()...');
            let check;
            try {
                check = await withTimeout(checkForUpdates(), 30000, 'Update check');
                console.log('[update] checkForUpdates() returned:', JSON.stringify({
                    available: check.available, method: check.method,
                    error: check.error, useApiZip: check.useApiZip
                }));
            } catch (checkErr) {
                console.error('[update] checkForUpdates() threw:', checkErr.message);
                await sock.sendMessage(chatId, {
                    text: `❌ *Update check failed*\n\n\`${checkErr.message}\`\n\n` +
                          `If your repo is private, set the *GITHUB_TOKEN* env variable with a personal access token.`
                }, { quoted: message }).catch(() => {});
                return;
            }

            if (!check.available) {
                let noUpdateMsg = '';
                if (check.error) {
                    noUpdateMsg = `❌ Update check failed: ${check.error}`;
                } else if (check.method === 'zip') {
                    noUpdateMsg = `✅ *Already up to date*\n\nNo new updates found.\n🕒 Last updated: ${check.lastUpdated || 'unknown'}`;
                } else {
                    noUpdateMsg = `✅ *Already up to date*\n\nYou're on the latest version${check.currentRev ? ` (\`${check.currentRev.substring(0, 7)}\`)` : ''}.`;
                }
                await sock.sendMessage(chatId, { text: noUpdateMsg }, { quoted: message });
                sock.sendMessage(chatId, { react: { text: '✅', key: message.key } }).catch(() => {});
                return;
            }

            let updateNotice = '📦 *Update found!*\n';
            if (check.method === 'git') {
                updateNotice += `\n🔖 ${check.oldRev.substring(0, 7)} → ${check.newRev.substring(0, 7)}\n`;
                if (check.changedFiles && check.changedFiles.length > 0) {
                    const shown = check.changedFiles.slice(0, 15);
                    updateNotice += `\n*Files changed (${check.changedFiles.length}):*\n${shown.join('\n')}`;
                    if (check.changedFiles.length > 15) updateNotice += `\n… and ${check.changedFiles.length - 15} more`;
                }
                if (check.commits) {
                    updateNotice += `\n\n*What changed:*\n${check.commits}`;
                }
            } else {
                updateNotice += check.prevSig
                    ? `\nRemote content has changed since last update.`
                    : `\nFirst update detected — installing latest version.`;
            }
            updateNotice += '\n\n⏳ *Installing now...*';

            await sock.sendMessage(chatId, { text: updateNotice }, { quoted: message });
            sock.sendMessage(chatId, { react: { text: '🆙', key: message.key } }).catch(() => {});

            let updateSummary = '';

            // Relay ZIP is always the install method (matches the check above).
            // Git pull is only attempted when the check returned method:'git',
            // which only happens when no relay URL is configured at all.
            if (check.method === 'git' && !check.useApiZip) {
                console.log('[update] Installing via git pull...');
                try {
                    const { oldRev, newRev, alreadyUpToDate } = await withTimeout(updateViaGit(), 90000, 'git update');
                    if (!alreadyUpToDate && newRev) saveUpdateState({ gitRev: newRev });
                    updateSummary = alreadyUpToDate
                        ? `✅ Already up to date (\`${newRev.substring(0, 7)}\`)`
                        : `✅ Updated \`${oldRev.substring(0, 7)}\` → \`${newRev.substring(0, 7)}\``;
                } catch (gitErr) {
                    console.log('[update] Git failed, falling back to ZIP...');
                    // Fall through to ZIP below
                    check.method = 'zip';
                }
            }

            if (check.method !== 'git' || check.useApiZip) {
                console.log('[update] Installing via relay ZIP...');
                const { copiedFiles, changeLog } = await withTimeout(
                    updateViaZip(sock, chatId, message, zipOverride),
                    180000, 'ZIP update'
                );
                if (check.remoteSig) saveUpdateState({ zipSignature: check.remoteSig });
                if (check.newRev) saveUpdateState({ gitRev: check.newRev });
                updateSummary = _buildZipSummary(changeLog, copiedFiles.length);
            }

            await sock.sendMessage(chatId, { text: updateSummary }, { quoted: message });
        }

        // After any update, check if node_modules needs refreshing.
        // This is critical on Heroku where the build cache may have an old Baileys version
        // (e.g. 6.9.x) while the repo requires 7.x. Running npm install here ensures the
        // correct packages are active without requiring a full Heroku rebuild.
        try {
            const installedBaileys = require('../node_modules/@whiskeysockets/baileys/package.json').version;
            const _baileysDepRaw = require('../package.json').dependencies['@whiskeysockets/baileys'] || '';
            // If using an npm alias (e.g. npm:@trashcore/baileys@latest) skip semver comparison
            const _isAlias = _baileysDepRaw.startsWith('npm:');
            const requiredBaileys = _isAlias ? installedBaileys : _baileysDepRaw.replace(/[\^~]/, '');
            if (!_isAlias && installedBaileys !== requiredBaileys) {
                await sock.sendMessage(chatId, {
                    text: `📦 Baileys mismatch (installed: ${installedBaileys}, required: ${requiredBaileys}) — running npm install...`
                }, { quoted: message });
                await new Promise((resolve, reject) => {
                    require('child_process').exec(
                        'npm install --prefer-offline --no-save 2>&1',
                        { timeout: 120000, cwd: process.cwd() },
                        (err, stdout) => {
                            if (err) { console.error('[update] npm install failed:', err.message); }
                            else { console.log('[update] npm install completed'); }
                            resolve(); // always continue even if npm install fails
                        }
                    );
                });
                await sock.sendMessage(chatId, { text: `✅ npm install complete` }, { quoted: message });
            }
        } catch (npmErr) {
            console.log('[update] Package version check skipped:', npmErr.message);
        }

        try {
            const v = require('../settings').version || '';
            await sock.sendMessage(chatId, { text: `> *Initialization started ...🆙️*` }, { quoted: message });
            await sock.sendMessage(chatId, {
                react: { text: '💓', key: message.key }
            });
        } catch {
            await sock.sendMessage(chatId, { text: 'Restarted Successfully. Enjoy!' }, { quoted: message });
        }

        await restartProcess(sock, chatId, message);
    } catch (err) {
        console.error('Update failed:', err);
        await sock.sendMessage(chatId, { text: `❌ Update failed:\n${String(err.message || err)}` }, { quoted: message });
    }
}

module.exports = updateCommand;
module.exports.checkForUpdates = checkForUpdates;
