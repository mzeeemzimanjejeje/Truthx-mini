const fs = require('fs');
const path = require('path');
let axios;
try {
    axios = require('axios');
} catch (e) {
    console.warn('[HEROKU] axios module not found, skipping Heroku API calls');
    axios = null;
}

const isHeroku = !!process.env.DYNO;
const SESSION_DIR = path.join(__dirname, '..', 'session');
const CREDS_PATH = path.join(SESSION_DIR, 'creds.json');

let saveTimeout = null;
let isSaving = false;

function log(msg, color = 'white') {
    try {
        const chalk = require('chalk');
        const prefix = chalk.magenta.bold('[ TRUTH - MD ]');
        console.log(`${prefix} ${chalk[color] ? chalk[color](msg) : msg}`);
    } catch {
        console.log(`[ TRUTH - MD ] ${msg}`);
    }
}

async function saveSessionToHeroku() {
    if (!isHeroku) return;

    const apiKey = process.env.HEROKU_API_KEY;
    const appName = process.env.HEROKU_APP_NAME;

    if (!apiKey || !appName) {
        return;
    }

    if (isSaving) return;
    isSaving = true;

    try {
        if (!fs.existsSync(CREDS_PATH)) {
            isSaving = false;
            return;
        }

        const credsData = fs.readFileSync(CREDS_PATH, 'utf-8');
        const encoded = Buffer.from(credsData).toString('base64');
        const newSessionId = `TRUTH-MD:~${encoded}`;

        const currentSessionId = process.env.SESSION_ID;
        if (currentSessionId === newSessionId) {
            isSaving = false;
            return;
        }

        await axios.patch(
            `https://api.heroku.com/apps/${appName}/config-vars`,
            { SESSION_ID: newSessionId },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.heroku+json; version=3',
                    'Authorization': `Bearer ${apiKey}`
                },
                timeout: 15000
            }
        );

        process.env.SESSION_ID = newSessionId;
        log('[HEROKU] Session saved to config vars successfully.', 'green');
    } catch (err) {
        log(`[HEROKU] Failed to save session: ${err.message}`, 'red');
    } finally {
        isSaving = false;
    }
}

function debouncedSave() {
    if (!isHeroku) return;
    if (!process.env.HEROKU_API_KEY || !process.env.HEROKU_APP_NAME) return;

    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveSessionToHeroku();
    }, 30000);
}

function setupHerokuShutdownHandler() {
    if (!isHeroku) return;

    process.on('SIGTERM', async () => {
        log('[HEROKU] SIGTERM received. Waiting for in-flight writes to complete...', 'yellow');
        if (saveTimeout) clearTimeout(saveTimeout);
        // Give any in-flight PostgreSQL writes (saveCreds / keys.set) time to finish
        // before Heroku force-kills the process. No API key needed — PG is the source of truth.
        await new Promise(resolve => setTimeout(resolve, 3000));
        log('[HEROKU] Graceful shutdown complete.', 'green');
        process.exit(0);
    });

    log('[HEROKU] Shutdown handler registered (session persisted via PostgreSQL).', 'cyan');
}

function getChromiumPath() {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    if (isHeroku) {
        const herokuChromePaths = [
            '/app/.apt/usr/bin/google-chrome-stable',
            '/app/.apt/usr/bin/google-chrome',
            '/app/.chrome/opt/google/chrome/google-chrome'
        ];
        for (const p of herokuChromePaths) {
            if (fs.existsSync(p)) return p;
        }
    }

    const commonPaths = [
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
    ];
    for (const p of commonPaths) {
        if (fs.existsSync(p)) return p;
    }

    return null;
}

function getFfmpegPath() {
    if (isHeroku) {
        const herokuFfmpegPaths = [
            '/app/vendor/ffmpeg/ffmpeg',
            '/app/.heroku/vendor/ffmpeg',
            '/usr/bin/ffmpeg'
        ];
        for (const p of herokuFfmpegPaths) {
            if (fs.existsSync(p)) return p;
        }
    }
    return 'ffmpeg';
}

function configureHerokuEnvironment() {
    if (!isHeroku) return;

    const chromePath = getChromiumPath();
    if (chromePath) {
        process.env.PUPPETEER_EXECUTABLE_PATH = chromePath;
        process.env.PUPPETEER_SKIP_DOWNLOAD = 'true';
        log(`[HEROKU] Chromium path: ${chromePath}`, 'cyan');
    }

    const ffmpegPath = getFfmpegPath();
    if (ffmpegPath !== 'ffmpeg') {
        process.env.FFMPEG_PATH = ffmpegPath;
        log(`[HEROKU] FFmpeg path: ${ffmpegPath}`, 'cyan');
    }

    process.env.PUPPETEER_SKIP_DOWNLOAD = 'true';

    setupHerokuShutdownHandler();
    setupSelfPing();

    log('[HEROKU] Environment configured successfully.', 'green');
}

// ── Self-ping to prevent eco/free dyno sleeping ───────────────────────────────
// Heroku eco and free dynos sleep after 30 minutes of HTTP inactivity.
// Worker dynos never sleep, but if the user scales a web dyno the bot still
// needs to stay awake. We ping our own public URL every 25 minutes so Heroku
// never sees 30 minutes of silence.
//
// Set APP_URL in your Heroku config vars, OR set HEROKU_APP_NAME and the URL
// is inferred as https://<name>.herokuapp.com
// If neither is set, self-ping is skipped (worker dynos don't need it).
function setupSelfPing() {
    if (!isHeroku) return;

    const appUrl =
        process.env.APP_URL ||
        (process.env.HEROKU_APP_NAME
            ? `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`
            : null);

    if (!appUrl) {
        log('[HEROKU] Self-ping: no APP_URL or HEROKU_APP_NAME set — skipping. Set APP_URL to prevent eco dyno sleep.', 'yellow');
        return;
    }

    const PING_INTERVAL_MS = 25 * 60 * 1000; // 25 min — Heroku eco sleeps at 30
    let _pingTimer = null;

    const ping = async () => {
        try {
            const ctrl = new AbortController();
            const timeout = setTimeout(() => ctrl.abort(), 10000);
            const resp = await fetch(appUrl, { method: 'GET', signal: ctrl.signal });
            clearTimeout(timeout);
            log(`[HEROKU] Self-ping OK (${resp.status})`, 'cyan');
        } catch (err) {
            log(`[HEROKU] Self-ping failed: ${err.message}`, 'yellow');
        } finally {
            _pingTimer = setTimeout(ping, PING_INTERVAL_MS);
        }
    };

    // First ping after 25 minutes; subsequent pings are scheduled by the callback.
    _pingTimer = setTimeout(ping, PING_INTERVAL_MS);
    log(`[HEROKU] Self-ping active → ${appUrl} (every 25 min)`, 'green');
}

module.exports = {
    isHeroku,
    saveSessionToHeroku,
    debouncedSave,
    setupHerokuShutdownHandler,
    setupSelfPing,
    configureHerokuEnvironment,
    getChromiumPath,
    getFfmpegPath
};
