const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const pino = require('pino');

const SESSIONS_DIR = (process.env.VERCEL || process.env.LAMBDA_TASK_ROOT || process.env.AWS_LAMBDA_FUNCTION_NAME)
  ? '/tmp/truthmd-sessions'
  : path.join(__dirname, '..', 'sessions');

try { fs.mkdirSync(SESSIONS_DIR, { recursive: true }); } catch (_) {}

const sessions = new Map();

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
// FIX for "WhatsApp not getting notification":
//
// Root causes identified:
//  1. delay(1500) is a race — on Replit the noise-protocol handshake can take
//     longer.  We now wait for the 'qr' event inside connection.update, which
//     is Baileys' own signal that the WebSocket + noise handshake is COMPLETE.
//     requestPairingCode called at that moment guarantees WhatsApp receives and
//     processes the request → push notification is sent to the phone.
//
//  2. After requestPairingCode succeeds, Baileys saves creds.registered=true
//     to disk.  On retry the same directory was reused, creds.registered was
//     already true, so the !creds.registered guard skipped the code request
//     entirely — no code, no notification.  Fix: wipe the session directory
//     before every attempt so creds always start fresh.
//
//  3. The qr flag must be acted on inside the SAME connection.update handler
//     that is registered before any await, so no events can be missed.
// ─────────────────────────────────────────────────────────────────────────────
async function startPairing(phone, onEvent) {
  const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    DisconnectReason,
    fetchLatestBaileysVersion
  } = await import('@whiskeysockets/baileys');

  const sessionId  = crypto.randomBytes(8).toString('hex');
  const sessionDir = path.join(SESSIONS_DIR, sessionId);

  const session = { phone, status: 'pending', pairingCode: null, connectedAt: null, name: null };
  sessions.set(sessionId, session);

  // Promise resolved when code is ready, rejected on unrecoverable error
  let _codeResolve, _codeReject;
  const codePromise = new Promise((res, rej) => { _codeResolve = res; _codeReject = rej; });

  let _retries = 0;
  const MAX_RETRIES = 3;

  async function attempt() {
    // ── Always start with a clean directory ─────────────────────────────────
    // If creds from a previous attempt exist, creds.registered may be true and
    // requestPairingCode would be silently skipped.  Wipe it every time.
    removeDir(sessionDir);
    fs.mkdirSync(sessionDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const logger = pino({ level: 'fatal' }).child({ level: 'fatal' });

    let { version } = { version: [2, 3000, 1023531901] };
    try { ({ version } = await fetchLatestBaileysVersion()); } catch (_) {}

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger,
      // Browsers.ubuntu('Chrome') is the fingerprint the reference repo uses
      browser: (Browsers && Browsers.ubuntu) ? Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '20.0.04'],
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      markOnlineOnConnect: true,
    });

    session.sock = sock;

    // Track whether we've already requested the code in this attempt
    let _requested = false;

    // ── Register ALL listeners BEFORE any await ──────────────────────────────
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // ── qr fires when noise-protocol handshake is COMPLETE ─────────────────
      // This is the ONLY reliable moment to call requestPairingCode:
      //   • Socket is authenticated with WhatsApp servers
      //   • WhatsApp will both return the code AND push a notification to the phone
      if (qr && !_requested) {
        _requested = true;
        try {
          const num = phone.replace(/[^0-9]/g, '');
          const prefixes = ['TRUTHMD', 'TRUTHX', 'BOTLINK'];
          const prefix   = prefixes[Math.floor(Math.random() * prefixes.length)];
          log(sessionId, `Socket ready (qr) — requesting pairing code for ${num}`);

          const raw  = await sock.requestPairingCode(num, prefix);
          const code = raw?.match(/.{1,4}/g)?.join('-') || raw;

          session.pairingCode = code;
          session.status = 'awaiting_scan';
          log(sessionId, `Pairing code issued: ${code}`);
          _codeResolve(code);                     // unblocks startPairing()
        } catch (err) {
          log(sessionId, `requestPairingCode error: ${err.message}`);
          clearSessionData(sessionId);
          _codeReject(err);
        }
      }

      // ── Connection opened = user scanned / entered code successfully ────────
      if (connection === 'open') {
        session.status      = 'connected';
        session.connectedAt = Date.now();
        session.name        = sock.user?.name || phone;
        log(sessionId, `Connected as ${session.name}`);

        if (typeof onEvent === 'function') {
          onEvent('session', { name: session.name });
        }

        // Send WhatsApp confirmation to the paired number
        try {
          await delay(2000);
          await sock.sendMessage(sock.user.id, {
            text: `✅ *TRUTH-MD Bot Connected!*\n\nYour bot is now active.\nType *.menu* to see all commands.`,
          });
        } catch (_) {}

        // Auto-cleanup after 5 minutes
        setTimeout(() => {
          try { sock?.end?.(); } catch (_) {}
          removeDir(sessionDir);
          sessions.delete(sessionId);
        }, 300_000);
      }

      // ── Connection closed ──────────────────────────────────────────────────
      if (connection === 'close') {
        const statusCode  = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason?.loggedOut || statusCode === 401;
        log(sessionId, `Connection closed — code ${statusCode || 'unknown'}`);

        if (!isLoggedOut && _retries < MAX_RETRIES && session.status !== 'connected') {
          _retries++;
          log(sessionId, `Retrying (${_retries}/${MAX_RETRIES}) in 5 s — will use fresh credentials`);
          // Delay before retry so WhatsApp rate-limiting doesn't kick in
          await delay(5000);
          return attempt();                       // fresh dir + fresh socket
        }

        if (session.status !== 'connected') {
          session.status = 'disconnected';
          clearSessionData(sessionId);
          const msg = isLoggedOut
            ? 'Session logged out — please try again'
            : `Connection failed (code ${statusCode || 'unknown'}) — please try again`;
          if (typeof onEvent === 'function') onEvent('error', { message: msg });
          // Only reject if code wasn't already resolved
          if (!_requested) _codeReject(new Error(msg));
        }
      }
    });
  } // end attempt()

  // Kick off the first attempt
  try {
    await attempt();
  } catch (err) {
    clearSessionData(sessionId);
    throw err;
  }

  // Wait for the pairing code (or error)
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
