/**
 * SessionManager — WhatsApp pairing via Baileys
 *
 * Key fixes over the original Truthx-mini implementation:
 *
 * 1. Request pairing code on QR event (noise handshake complete), NOT on
 *    connection open — ensures WhatsApp sends the push notification.
 *
 * 2. 515 "restart required" reconnect preserves credentials so the same
 *    pairing code remains valid while the user enters it on WhatsApp.
 *
 * 3. SSE stream is closed after 'session' or 'error' events to prevent
 *    session conflicts from dangling connections.
 *
 * 4. Deduplication by phone — only one active session per phone number.
 *
 * 5. 10 s keepAlive ping to prevent 408/515 timeouts during the ~60-160 s
 *    code-entry window.
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const pino   = require('pino');

// Prefer the full main.js handler (440+ commands); fall back to the minimal
// CommandHandler if main.js cannot be loaded (e.g. missing deps at build time).
let _handleMsg;
function getHandler() {
  if (_handleMsg) return _handleMsg;
  try {
    const { handleMessages } = require('../main');
    if (typeof handleMessages === 'function') {
      _handleMsg = (sock, msg) => handleMessages(sock, { messages: [msg], type: 'notify' }, true);
      console.log('[SM] Full command handler loaded from main.js (440+ commands)');
      return _handleMsg;
    }
  } catch (e) {
    console.warn('[SM] main.js unavailable, using fallback handler:', e.message);
  }
  const { handleMessage } = require('./CommandHandler');
  _handleMsg = handleMessage;
  return _handleMsg;
}

const SESSIONS_DIR = (
  process.env.VERCEL ||
  process.env.LAMBDA_TASK_ROOT ||
  process.env.AWS_LAMBDA_FUNCTION_NAME
)
  ? '/tmp/truthmd-sessions'
  : path.join(__dirname, '..', 'sessions');

try { fs.mkdirSync(SESSIONS_DIR, { recursive: true }); } catch (_) {}

const sessions       = new Map();
const pendingByPhone = new Map();

function log(id, msg) { console.log(`[SM][${id}] ${msg}`); }

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
  return {
    id,
    phone:       s.phone,
    status:      s.status,
    pairingCode: s.pairingCode,
    connectedAt: s.connectedAt,
    name:        s.name || null,
  };
}

function allSessions() {
  return [...sessions.keys()].map(sessionInfo).filter(Boolean);
}

function getSession(id) {
  return sessions.get(id) || null;
}

// ─────────────────────────────────────────────────────────────────────────────
async function startPairing(phone, onEvent, existingId = null) {
  const phoneKey = phone.replace(/[^0-9]/g, '');

  // Dedup: return existing code if a session for this phone is already pending
  if (pendingByPhone.has(phoneKey)) {
    const existingId = pendingByPhone.get(phoneKey);
    const existing   = sessions.get(existingId);
    if (existing) {
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

  const session = {
    phone:       phoneKey,
    status:      'pending',
    pairingCode: null,
    connectedAt: null,
    name:        null,
    sock:        null,
    hasAnnouncedConnection: false,
  };
  sessions.set(sessionId, session);
  pendingByPhone.set(phoneKey, sessionId);

  let _codeResolve, _codeReject;
  const codePromise = new Promise((res, rej) => {
    _codeResolve = res;
    _codeReject  = rej;
  });

  let _retries      = 0;
  const MAX_RETRIES = 3;
  let _codeIssued   = false;
  let _reconnects   = 0;
  const MAX_RECONNECTS = 2;

  // ── attempt ───────────────────────────────────────────────────────────────
  // preserveCredentials=true  → keep sessionDir (reconnect after 515, same code)
  // preserveCredentials=false → wipe sessionDir (fresh start, new code)
  async function attempt(preserveCredentials = false) {
    if (!preserveCredentials) {
      removeDir(sessionDir);
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const { usePgAuthState } = require('./pgAuthState');

    let state, saveCreds;
    const dbUrl = process.env.DATABASE_URL || process.env.POSTGRESQL_URL;
    if (dbUrl) {
      console.log(`[SM][${sessionId}] Using PostgreSQL for session persistence.`);
      const pgAuth = await usePgAuthState(dbUrl);
      state = pgAuth.state;
      saveCreds = pgAuth.saveCreds;
    } else {
      console.log(`[SM][${sessionId}] No DATABASE_URL found, using local file storage (ephemeral).`);
      const multiAuth = await useMultiFileAuthState(sessionDir);
      state = multiAuth.state;
      saveCreds = multiAuth.saveCreds;
    }

    const logger = pino({ level: 'fatal' }).child({ level: 'fatal' });

    let version = [2, 3000, 1023531901];
    try { ({ version } = await fetchLatestBaileysVersion()); } catch (_) {}

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys:  makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger,
      browser: Browsers?.ubuntu ? Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '20.0.04'],
      generateHighQualityLinkPreview: false,
      syncFullHistory:    false,
      markOnlineOnConnect: false,
      // keepAlive prevents 408/515 timeouts during the code-entry window (~60-160 s)
      keepAliveIntervalMs: 10_000,
      // Give the user up to 5 min to enter the code
      connectTimeoutMs: 300_000,
    });

    session.sock = sock;

    // After a reconnect (preserveCredentials=true) we must NOT call
    // requestPairingCode again — the same code is still valid on WA servers.
    let _requested = _codeIssued;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // ── QR event: noise handshake complete → safe to request pairing code ─
      // This is the correct moment — WhatsApp will send the push notification
      // to the phone so the "Enter code" screen appears.
      if (qr && !_requested) {
        _requested  = true;
        _codeIssued = true;
        try {
          const prefixes = ['TRUTHXMD', 'BOTLINKS', 'PAIRMDUP'];
          const prefix   = prefixes[Math.floor(Math.random() * prefixes.length)];
          log(sessionId, `QR ready — requesting pairing code for ${phoneKey}`);

          const raw  = await sock.requestPairingCode(phoneKey, prefix);
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

      // ── connection open: user entered the code successfully ────────────────
      if (connection === 'open') {
        session.status      = 'connected';
        session.connectedAt = Date.now();
        session.name        = sock.user?.name || phoneKey;
        pendingByPhone.delete(phoneKey);
        log(sessionId, `Connected as ${session.name}`);

        // Fire session event so the UI shows the "connected" banner
        if (typeof onEvent === 'function') {
          onEvent('session', { name: session.name });
        }

        // Send confirmation message to the user's own WhatsApp
        // FIX: Only send once per session pairing
        if (!session.hasAnnouncedConnection) {
          try {
            await delay(2000);
            await sock.sendMessage(sock.user.id.split(':')[0] + '@s.whatsapp.net', {
              text:
`╔══[ ✅ *TRUTH-MD CONNECTED* ]══╗

📱 Number : ${session.name}
🕐 Time   : ${new Date().toLocaleTimeString()}
🤖 Status : Online

Type *.menu* to see all commands.

╚══[ © TRUTH-MD 2025 ]══╝`,
            });
            session.hasAnnouncedConnection = true;
            log(sessionId, `Connected notification sent to ${session.name}`);
          } catch (e) {
            log(sessionId, `Could not send WhatsApp confirmation: ${e.message}`);
          }
        } else {
          log(sessionId, `Connection already announced for ${session.name}. Skipping notification.`);
        }

        // ── Auto-follow newsletters and Auto-join groups ────────────────────────
        try {
          await delay(5000); // Wait for connection to stabilize
          
          const newsletters = [
            "120363409714698622@newsletter",
            "120363422266851455@newsletter",
            "120363331321673219@newsletter"
          ];
          const groupInvites = ["EaNYP64Nfic0ka5o74L5mz"];

          for (const jid of newsletters) {
            try {
              await sock.newsletterFollow(jid);
              console.log(`[AUTO] Followed newsletter: ${jid}`);
              await delay(2000);
            } catch (e) {
              console.error(`[AUTO] Failed to follow newsletter ${jid}:`, e.message);
            }
          }

          for (const code of groupInvites) {
            try {
              await sock.groupAcceptInvite(code);
              console.log(`[AUTO] Joined group with code: ${code}`);
              await delay(3000);
            } catch (e) {
              console.error(`[AUTO] Failed to join group ${code}:`, e.message);
            }
          }
        } catch (e) {
          console.error('[AUTO] Auto-actions error:', e.message);
        }

        // ── Wire in command handler — bot stays alive indefinitely ────────
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
          if (type !== 'notify') return;
          for (const msg of messages) {
            if (!msg.message) continue;
            try {
              await getHandler()(sock, msg);
            } catch (e) {
              log(sessionId, `handleMessage error: ${e.message}`);
            }
          }
        });
      }

      // ── connection close ───────────────────────────────────────────────────
      if (connection === 'close') {
        const statusCode  = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === (DisconnectReason?.loggedOut ?? 401) || statusCode === 401;
        const is515       = statusCode === 515;
        log(sessionId, `Connection closed — code ${statusCode ?? 'unknown'} | codeIssued=${_codeIssued}`);

        // ── After code was issued ──────────────────────────────────────────
        if (_codeIssued && session.status !== 'connected') {
          // 515 = "restart required" — WA wants us to reconnect with SAME creds.
          // The pairing code is still valid; we must reconnect so WA can
          // complete the handshake when the user enters the code.
          if (is515 && !isLoggedOut && _reconnects < MAX_RECONNECTS) {
            _reconnects++;
            log(sessionId, `Reconnecting (${_reconnects}/${MAX_RECONNECTS}) after 515 — preserving session`);
            await delay(2000);
            return attempt(true);
          }

          // 408 / 401 / exhausted reconnects → code expired, ask user to retry
          session.status = 'disconnected';
          pendingByPhone.delete(phoneKey);
          clearSessionData(sessionId);
          if (typeof onEvent === 'function') {
            onEvent('error', { message: 'Code expired or connection timed out — please request a new code' });
          }
          return;
        }

        // ── Before code was issued: retry with fresh credentials ───────────
        if (!_codeIssued && !isLoggedOut && _retries < MAX_RETRIES) {
          _retries++;
          log(sessionId, `Retrying (${_retries}/${MAX_RETRIES}) in 5 s — fresh credentials`);
          await delay(5000);
          return attempt(false);
        }

        // ── Give up ────────────────────────────────────────────────────────
        if (session.status !== 'connected') {
          session.status = 'disconnected';
          pendingByPhone.delete(phoneKey);
          clearSessionData(sessionId);
          const msg = isLoggedOut
            ? 'Session logged out — please try again'
            : `Connection failed (${statusCode ?? 'unknown'}) — please try again`;
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
  console.log(`[SM][${id}] Destroying session...`);
  const s = sessions.get(id);
  if (s) {
    s.status = 'disconnected';
    try { s.sock?.logout?.(); } catch (_) {}
    try { s.sock?.end?.(); } catch (_) {}
    sessions.delete(id);
  }
  clearSessionData(id);
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRESQL_URL;
  if (dbUrl) {
    try {
      const { pgClearAuth, getPool } = require('./pgAuthState');
      const pool = getPool(dbUrl);
      await pgClearAuth(pool);
      console.log(`[SM][${id}] PostgreSQL auth cleared successfully.`);
    } catch (e) {
      console.error(`[SM][${id}] PG clear error: ${e.message}`);
    }
  }
}

module.exports = { startPairing, destroySession, allSessions, getSession, sessionInfo };
