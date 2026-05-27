const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pino = require('pino');

// On Vercel the function root is read-only; only /tmp is writable.
const SESSIONS_DIR = (process.env.VERCEL || process.env.LAMBDA_TASK_ROOT || process.env.AWS_LAMBDA_FUNCTION_NAME)
  ? '/tmp/truthmd-sessions'
  : path.join(__dirname, '..', 'sessions');

try { fs.mkdirSync(SESSIONS_DIR, { recursive: true }); } catch (_) {}

const sessions = new Map();

function log(sessionId, msg) {
  console.log(`[${sessionId}] ${msg}`);
}

function sessionInfo(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return null;
  return { id: sessionId, phone: s.phone, status: s.status, pairingCode: s.pairingCode, connectedAt: s.connectedAt, name: s.name || null };
}

function allSessions() { return [...sessions.keys()].map(sessionInfo).filter(Boolean); }
function getSession(sessionId) { return sessions.get(sessionId) || null; }

function clearSessionData(sessionId) {
  try { fs.rmSync(path.join(SESSIONS_DIR, sessionId), { recursive: true, force: true }); } catch (_) {}
  sessions.delete(sessionId);
}

// ─── Main entry point ──────────────────────────────────────────────────────────
// startPairing(phone, onEvent?)
//   - Resolves with { sessionId, code } as soon as pairing code is ready
//   - Calls onEvent('session', { sessionId }) when WhatsApp connects
//   - Calls onEvent('error', { message }) on failure after code was sent
//
// Uses dynamic import() because @whiskeysockets/baileys v7+ is ESM-only.
async function startPairing(phone, onEvent) {
  const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    DisconnectReason,
    fetchLatestBaileysVersion
  } = await import('@whiskeysockets/baileys');

  const { handleMessage } = require('./CommandHandler');

  const sessionId = crypto.randomBytes(8).toString('hex');
  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  try { fs.mkdirSync(sessionDir, { recursive: true }); } catch (_) {}

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();
  const logger = pino({ level: 'silent' });

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    printQRInTerminal: false,
    logger,
    // Chrome browser fingerprint — required for WhatsApp pairing code flow
    browser: ['TRUTH-MD', 'Chrome', '120.0.6099.71'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: true
  });

  const session = {
    sock, phone,
    status: 'pending',
    pairingCode: null,
    connectedAt: null,
    name: null
  };
  sessions.set(sessionId, session);

  // Wait for the socket to register before requesting pairing code
  await new Promise(r => setTimeout(r, 2000));

  // Request pairing code — resolves this Promise, letting server.js send
  // the 'code' SSE event immediately. WhatsApp events continue in background.
  let code;
  try {
    const raw = await sock.requestPairingCode(phone);
    code = raw?.match(/.{1,4}/g)?.join('-') || raw;
    session.pairingCode = code;
    session.status = 'awaiting_scan';
    log(sessionId, `Pairing code: ${code}`);
  } catch (err) {
    log(sessionId, `Pairing code error: ${err.message}`);
    session.status = 'error';
    clearSessionData(sessionId);
    throw err;
  }

  // ── Background listeners (run after startPairing resolves) ────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      session.status = 'connected';
      session.connectedAt = Date.now();
      session.name = sock.user?.name || phone;
      log(sessionId, `Connected as ${session.name}`);

      // Fire the SSE 'session' event so the browser knows it's done
      if (typeof onEvent === 'function') {
        onEvent('session', { sessionId });
      }

      // Welcome message
      try {
        await sock.sendMessage(phone + '@s.whatsapp.net', {
          text: `✅ *TRUTH-MD Connected!*\n\nYour bot is now active.\nType *.menu* to see all commands.`
        });
      } catch (_) {}
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = (statusCode === DisconnectReason.loggedOut || statusCode === 401)
        ? 'logged out' : `closed (code ${statusCode || 'unknown'})`;
      log(sessionId, `Session ${reason} — clearing`);
      session.status = 'disconnected';

      if (typeof onEvent === 'function' && session.status !== 'connected') {
        // Error before connection was established
        onEvent('error', { message: `Connection ${reason}` });
      }

      try { sock?.end?.(); } catch (_) {}
      try { sock?.ws?.close?.(); } catch (_) {}
      clearSessionData(sessionId);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      try { await handleMessage(sock, msg); } catch (_) {}
    }
  });

  sock.ev.on('creds.update', saveCreds);

  return { sessionId, code };
}

async function destroySession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.status = 'disconnected';
  try { s.sock?.end?.(); } catch (_) {}
  try { s.sock?.ws?.close?.(); } catch (_) {}
  log(sessionId, 'Session destroyed by user');
  clearSessionData(sessionId);
}

module.exports = { startPairing, destroySession, allSessions, getSession, sessionInfo };
