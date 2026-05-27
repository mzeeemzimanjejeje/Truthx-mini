const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { handleMessage } = require('./CommandHandler');

// On Vercel (and other serverless platforms), the function root is read-only.
// Only /tmp is writable. Detect serverless and redirect sessions there.
const SESSIONS_DIR = (process.env.VERCEL || process.env.LAMBDA_TASK_ROOT || process.env.AWS_LAMBDA_FUNCTION_NAME)
  ? '/tmp/truthmd-sessions'
  : path.join(__dirname, '..', 'sessions');

// Safe mkdir — never crash the module on load
try { fs.mkdirSync(SESSIONS_DIR, { recursive: true }); } catch (_) {}

const sessions = new Map();
let io = null;

function setIO(socketIO) { io = socketIO; }

function emit(event, data) {
  if (io) io.emit(event, data);
}

function log(sessionId, msg) {
  const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
  console.log(`[${sessionId}] ${msg}`);
  emit('log', { sessionId, msg: entry });
}

function sessionInfo(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return null;
  return {
    id: sessionId,
    phone: s.phone,
    status: s.status,
    pairingCode: s.pairingCode,
    connectedAt: s.connectedAt,
    name: s.name || null
  };
}

function allSessions() {
  return [...sessions.keys()].map(sessionInfo).filter(Boolean);
}

async function createSession(phone, sessionId) {
  if (sessions.has(sessionId)) {
    await destroySession(sessionId);
  }

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
    browser: ['TRUTH-MD', 'Chrome', '120.0.6099.71'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: true
  });

  const session = {
    sock,
    phone,
    status: 'pending',
    pairingCode: null,
    connectedAt: null,
    name: null,
    reconnectCount: 0,
    destroyed: false
  };
  sessions.set(sessionId, session);
  emit('session_update', sessionInfo(sessionId));

  // Request pairing code
  await new Promise(r => setTimeout(r, 2000));
  try {
    const code = await sock.requestPairingCode(phone);
    const formatted = code?.match(/.{1,4}/g)?.join('-') || code;
    session.pairingCode = formatted;
    session.status = 'awaiting_scan';
    log(sessionId, `Pairing code generated: ${formatted}`);
    emit('pairing_code', { sessionId, code: formatted });
    emit('session_update', sessionInfo(sessionId));
  } catch (err) {
    log(sessionId, `Pairing code error: ${err.message}`);
    session.status = 'error';
    emit('session_update', sessionInfo(sessionId));
    return;
  }

  // Connection events
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      session.status = 'connected';
      session.connectedAt = Date.now();
      session.reconnectCount = 0;
      session.name = sock.user?.name || phone;
      log(sessionId, `Connected as ${session.name}`);
      emit('session_update', sessionInfo(sessionId));

      // Send welcome message to owner/self
      try {
        const jid = phone + '@s.whatsapp.net';
        await sock.sendMessage(jid, {
          text: `✅ *TRUTH-MD Connected!*\n\nYour bot is now active.\nType *.menu* to see all commands.`
        });
      } catch (_) {}
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const isLogout = code === DisconnectReason.loggedOut || code === 401;

      if (isLogout || session.destroyed) {
        log(sessionId, 'Session ended (logged out)');
        session.status = 'disconnected';
        emit('session_update', sessionInfo(sessionId));
        sessions.delete(sessionId);
        try { fs.rmSync(path.join(SESSIONS_DIR, sessionId), { recursive: true }); } catch (_) {}
        return;
      }

      // Auto-reconnect with backoff (max 5 times)
      if (session.reconnectCount < 5 && !session.destroyed) {
        session.reconnectCount++;
        session.status = 'reconnecting';
        emit('session_update', sessionInfo(sessionId));
        const delay = Math.min(5000 * session.reconnectCount, 30000);
        log(sessionId, `Reconnecting in ${delay / 1000}s (attempt ${session.reconnectCount}/5)`);
        setTimeout(() => {
          if (!session.destroyed) createSession(phone, sessionId);
        }, delay);
      } else {
        session.status = 'disconnected';
        emit('session_update', sessionInfo(sessionId));
        log(sessionId, 'Max reconnects reached. Session ended.');
      }
    }
  });

  // Handle messages → commands
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      await handleMessage(sock, msg);
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

async function destroySession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.destroyed = true;
  s.status = 'disconnected';
  try { s.sock?.end?.(); } catch (_) {}
  try { s.sock?.ws?.close?.(); } catch (_) {}
  sessions.delete(sessionId);
  try { fs.rmSync(path.join(SESSIONS_DIR, sessionId), { recursive: true }); } catch (_) {}
  emit('session_update', { id: sessionId, status: 'disconnected' });
  log(sessionId, 'Session destroyed');
}

// Restore sessions saved on disk on startup
async function restoreSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return;
  const dirs = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const id of dirs) {
    const credsPath = path.join(SESSIONS_DIR, id, 'creds.json');
    if (!fs.existsSync(credsPath)) continue;
    try {
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      const phone = creds?.me?.id?.split(':')[0] || creds?.me?.lid?.split(':')[0] || id;
      console.log(`[RESTORE] Restoring session ${id} for +${phone}`);
      await createSession(phone, id);
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`[RESTORE] Failed ${id}:`, err.message);
    }
  }
}

module.exports = { createSession, destroySession, allSessions, sessionInfo, setIO, restoreSessions };
