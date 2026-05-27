const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const pino   = require('pino');

const SESSIONS_DIR = (process.env.VERCEL || process.env.LAMBDA_TASK_ROOT || process.env.AWS_LAMBDA_FUNCTION_NAME)
  ? '/tmp/truthmd-sessions'
  : path.join(__dirname, '..', 'sessions');

try { fs.mkdirSync(SESSIONS_DIR, { recursive: true }); } catch (_) {}

const sessions      = new Map();
const pendingByPhone = new Map(); // phone → sessionId  (dedup concurrent requests)

function log(id, msg) { console.log(`[SessionManager][${id}] ${msg}`); }

function removeDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

function clearSessionData(id) {
  removeDir(path.join(SESSIONS_DIR, id));
  sessions.delete(id);
}

function sessionInfo(id) {
  const s = sessions.get(id);
  if (!s) return null;
  return { id, phone: s.phone, status: s.status, pairingCode: s.pairingCode, connectedAt: s.connectedAt, name: s.name || null };
}

function allSessions() { return [...sessions.keys()].map(sessionInfo).filter(Boolean); }
function getSession(id)  { return sessions.get(id) || null; }

// ─────────────────────────────────────────────────────────────────────────────
// startPairing(phone, onEvent)
//
// Key design decisions:
//
//  1. Deduplicate by phone — only one active session per phone number.
//
//  2. Wait for `qr` event (noise handshake complete) before requestPairingCode
//     so WhatsApp sends the push notification.
//
//  3. keepAliveIntervalMs: 10_000 — ping every 10 s to prevent 408/515 during
//     the code-entry window (~60-160 s).
//
//  4. After code is issued:
//       515 (restart required) → reconnect WITHOUT wiping credentials, skip
//         re-requesting code.  The code remains valid on WhatsApp servers;
//         when user enters it, WhatsApp finds our reconnected socket and
//         completes pairing.
//       408 (timed out)        → same one-shot reconnect attempt; if that
//         also times out tell the user to request a new code.
//       any other close        → tell user to request a new code.
//
//  5. Before code is issued: retry up to MAX_RETRIES with fresh credentials.
// ─────────────────────────────────────────────────────────────────────────────
async function startPairing(phone, onEvent) {
  const phoneKey = phone.replace(/[^0-9]/g, '');

  // ── Dedup: return existing code if session already pending ────────────────
  if (pendingByPhone.has(phoneKey)) {
    const existingId = pendingByPhone.get(phoneKey);
    const existing   = sessions.get(existingId);
    if (existing && existing.pairingCode) {
      log(existingId, `Reusing existing code for ${phoneKey}`);
      return { sessionId: existingId, code: existing.pairingCode };
    }
  }

  const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    DisconnectReason,
    fetchLatestBaileysVersion,
  } = await import('@whiskeysockets/baileys');

  const sessionId  = crypto.randomBytes(8).toString('hex');
  const sessionDir = path.join(SESSIONS_DIR, sessionId);

  const session = { phone: phoneKey, status: 'pending', pairingCode: null, connectedAt: null, name: null };
  sessions.set(sessionId, session);
  pendingByPhone.set(phoneKey, sessionId);

  let _codeResolve, _codeReject;
  const codePromise = new Promise((res, rej) => { _codeResolve = res; _codeReject = rej; });

  // These persist across attempt() calls
  let _retries     = 0;
  const MAX_RETRIES = 3;
  let _codeIssued  = false;   // true after requestPairingCode succeeds
  let _reconnects  = 0;       // reconnects after code issued (515/408 recovery)
  const MAX_RECONNECTS = 2;

  // ── attempt(preserveCredentials) ──────────────────────────────────────────
  // preserveCredentials=false → wipe sessionDir (fresh start, new code)
  // preserveCredentials=true  → keep sessionDir (reconnect, same code)
  async function attempt(preserveCredentials = false) {
    if (!preserveCredentials) {
      removeDir(sessionDir);
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const logger = pino({ level: 'fatal' }).child({ level: 'fatal' });

    let { version } = { version: [2, 3000, 1023531901] };
    try { ({ version } = await fetchLatestBaileysVersion()); } catch (_) {}

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys:  makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal:    false,
      logger,
      browser:              (Browsers?.ubuntu) ? Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '20.0.04'],
      generateHighQualityLinkPreview: false,
      syncFullHistory:      false,
      markOnlineOnConnect:  false,
      // ── keepAlive prevents 408/515 during the code-entry window ──────────
      keepAliveIntervalMs:  10_000,
      // Give the user up to 5 min to enter the code before Baileys times out
      connectTimeoutMs:     300_000,
    });

    session.sock = sock;

    // _requested is local to each attempt but initialised from _codeIssued so
    // a reconnect after code issuance doesn't call requestPairingCode again.
    let _requested = _codeIssued;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // ── qr: noise handshake complete → request pairing code ───────────────
      if (qr && !_requested) {
        _requested   = true;
        _codeIssued  = true;
        try {
          const num      = phoneKey;
          const prefixes = ['TRUTHXMD', 'BOTLINKS', 'PAIRMDUP'];
          const prefix   = prefixes[Math.floor(Math.random() * prefixes.length)];
          log(sessionId, `Socket ready (qr) — requesting pairing code for ${num}`);

          const raw  = await sock.requestPairingCode(num, prefix);
          const code = raw?.match(/.{1,4}/g)?.join('-') || raw;

          session.pairingCode = code;
          session.status      = 'awaiting_scan';
          log(sessionId, `Pairing code issued: ${code}`);
          _codeResolve(code);
        } catch (err) {
          log(sessionId, `requestPairingCode error: ${err.message} — will retry`);
          _requested  = false;
          _codeIssued = false;
          try { sock.ws?.close?.(); } catch (_) {}
        }
      }

      // ── connection open: user entered the code ─────────────────────────────
      if (connection === 'open') {
        session.status      = 'connected';
        session.connectedAt = Date.now();
        session.name        = sock.user?.name || phoneKey;
        pendingByPhone.delete(phoneKey);
        log(sessionId, `Connected as ${session.name}`);

        if (typeof onEvent === 'function') onEvent('session', { name: session.name });

        try {
          await delay(2000);
          await sock.sendMessage(sock.user.id, {
            text: `✅ *TRUTH-MD Bot Connected!*\n\nYour bot is now active.\nType *.menu* to see all commands.`,
          });
        } catch (_) {}

        setTimeout(() => {
          try { sock?.end?.(); } catch (_) {}
          removeDir(sessionDir);
          sessions.delete(sessionId);
        }, 300_000);
      }

      // ── connection close ───────────────────────────────────────────────────
      if (connection === 'close') {
        const statusCode  = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === (DisconnectReason?.loggedOut ?? 401) || statusCode === 401;
        const is515       = statusCode === 515;   // restart required
        const is408       = statusCode === 408;   // timed out
        log(sessionId, `Connection closed — code ${statusCode ?? 'unknown'} | codeIssued=${_codeIssued}`);

        // ── After code issued ─────────────────────────────────────────────
        // 515 = restart required: WhatsApp wants us to reconnect; the pairing
        //       code is still valid on their servers → reconnect preserving
        //       creds so the same session can complete when user enters code.
        // 408 = timed out / any other: partial creds are invalid; reconnecting
        //       always causes 401.  Just tell the user to get a new code.
        if (_codeIssued && session.status !== 'connected') {
          if (is515 && !isLoggedOut && _reconnects < MAX_RECONNECTS) {
            _reconnects++;
            log(sessionId, `Reconnecting (${_reconnects}/${MAX_RECONNECTS}) after 515 — preserving session`);
            await delay(2000);
            return attempt(true);   // keep credentials, skip re-requesting
          }
          // 408, 401, exhausted reconnects — code expired or invalid
          session.status = 'disconnected';
          pendingByPhone.delete(phoneKey);
          clearSessionData(sessionId);
          if (typeof onEvent === 'function') onEvent('error', { message: 'Code expired — please request a new one' });
          return;
        }

        // ── Before code issued: retry with fresh credentials ──────────────
        if (!_codeIssued && !isLoggedOut && _retries < MAX_RETRIES) {
          _retries++;
          log(sessionId, `Retrying (${_retries}/${MAX_RETRIES}) in 5 s — fresh credentials`);
          await delay(5000);
          return attempt(false);
        }

        // ── Give up ───────────────────────────────────────────────────────
        if (session.status !== 'connected') {
          session.status = 'disconnected';
          pendingByPhone.delete(phoneKey);
          clearSessionData(sessionId);
          const msg = isLoggedOut
            ? 'Session logged out — please try again'
            : `Connection failed (code ${statusCode ?? 'unknown'}) — please try again`;
          if (typeof onEvent === 'function') onEvent('error', { message: msg });
          if (!_codeIssued) _codeReject(new Error(msg));
        }
      }
    });
  }

  try {
    await attempt(false);
  } catch (err) {
    pendingByPhone.delete(phoneKey);
    clearSessionData(sessionId);
    throw err;
  }

  const code = await codePromise;
  return { sessionId, code };
}

async function destroySession(id) {
  const s = sessions.get(id);
  if (!s) return;
  s.status = 'disconnected';
  try { s.sock?.end?.(); } catch (_) {}
  clearSessionData(id);
}

module.exports = { startPairing, destroySession, allSessions, getSession, sessionInfo };
