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
let io = null;

function setIO(socketIO) { io = socketIO; }
function emit(event, data) { if (io) io.emit(event, data); }

function log(sessionId, msg) {
  const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
  console.log(`[${sessionId}] ${msg}`);
  emit('log', { sessionId, msg: entry });
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

// ─── Main entry point ─────────────────────────────────────────────────────────
// Uses dynamic import() because @whiskeysockets/baileys v7+ is ESM-only.
// Returns { sessionId, code } — the HTTP handler waits for this and sends the
// code directly in the response. No socket.io needed for the pairing step.
async function startPairing(phone) {
  // Dynamic import works for both CJS and ESM packages
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
    // Identify as Chrome browser for WhatsApp pairing
    browser: ['TRUTH-MD', 'Chrome', '120.0.6099.71'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: true
  });

  const session = { sock, phone, status: 'pending', pairingCode: null, connectedAt: null, name: null, destroyed: false };
  sessions.set(sessionId, session);
  emit('session_update', sessionInfo(sessionId));

  // Wait 2s then request the pairing code
  await new Promise(r => setTimeout(r, 2000));

  let code;
  try {
    const raw = await sock.requestPairingCode(phone);
    code = raw?.match(/.{1,4}/g)?.join('-') || raw;
    session.pairingCode = code;
    session.status = 'awaiting_scan';
    log(sessionId, `Pairing code ready: ${code}`);
    emit('pairing_code', { sessionId, code });
    emit('session_update', sessionInfo(sessionId));
  } catch (err) {
    log(sessionId, `Pairing code error: ${err.message}`);
    session.status = 'error';
    emit('session_update', sessionInfo(sessionId));
    clearSessionData(sessionId);
    throw err;
  }

  // Background event listeners (run after HTTP response is sent)
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      session.status = 'connected';
      session.connectedAt = Date.now();
      session.name = sock.user?.name || phone;
      log(sessionId, `Connected as ${session.name}`);
      emit('session_update', sessionInfo(sessionId));
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
      emit('session_update', { id: sessionId, status: 'disconnected', phone: session.phone });
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
  s.destroyed = true;
  s.status = 'disconnected';
  try { s.sock?.end?.(); } catch (_) {}
  try { s.sock?.ws?.close?.(); } catch (_) {}
  emit('session_update', { id: sessionId, status: 'disconnected' });
  log(sessionId, 'Session destroyed by user');
  clearSessionData(sessionId);
}

module.exports = { startPairing, destroySession, allSessions, getSession, sessionInfo, setIO };
