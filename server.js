require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['polling', 'websocket'],
  allowEIO3: true
});

const PORT = process.env.PORT || 3000;

// Lazy-load SessionManager — a bad import never kills the web server
let sm = null;
function getSessionManager() {
  if (!sm) {
    try {
      sm = require('./lib/SessionManager');
      sm.setIO(io);
    } catch (err) {
      console.error('[SERVER] SessionManager load error:', err.message);
      sm = {
        startPairing: async () => { throw new Error('Session backend unavailable: ' + err.message); },
        destroySession: async () => {},
        allSessions: () => [],
        getSession: () => null,
        setIO: () => {}
      };
    }
  }
  return sm;
}

try { getSessionManager(); } catch (_) {}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    sessions: getSessionManager().allSessions().length,
    env: process.env.VERCEL ? 'vercel' : 'standalone'
  });
});

// ── Pair ─────────────────────────────────────────────────────────────────────
// Waits until the pairing code is ready, then returns {sessionId, code}.
// The browser shows the code directly — no socket.io needed for this step.
app.post('/api/pair', async (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  const cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.length < 7 || cleaned.length > 15)
    return res.status(400).json({ error: 'Invalid phone number' });

  try {
    const { sessionId, code } = await getSessionManager().startPairing(cleaned);
    res.json({ sessionId, code, message: 'Pairing started' });
  } catch (err) {
    console.error('[PAIR] Error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate pairing code' });
  }
});

// ── Status polling (browser polls this every 3s after getting the code) ──────
app.get('/api/pair-status/:sessionId', (req, res) => {
  const info = getSessionManager().getSession(req.params.sessionId);
  if (!info) return res.json({ status: 'disconnected' });
  res.json({
    status: info.status,
    name: info.name || null,
    connectedAt: info.connectedAt || null
  });
});

// ── Sessions list ─────────────────────────────────────────────────────────────
app.get('/api/sessions', (req, res) => {
  res.json(getSessionManager().allSessions());
});

// ── Disconnect ────────────────────────────────────────────────────────────────
app.post('/api/disconnect', async (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: 'Session ID required' });
  await getSessionManager().destroySession(sessionId);
  res.json({ success: true });
});

// ── Socket.io (bonus — works on persistent servers; no-op on serverless) ─────
io.on('connection', (socket) => {
  socket.emit('sessions', getSessionManager().allSessions());
});

// ── Server start (direct run only, not Vercel import) ────────────────────────
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n╔════════════════════════════╗`);
    console.log(`║  TRUTH-MD Pair Web v1.0.0  ║`);
    console.log(`║  Running on port ${PORT}        ║`);
    console.log(`╚════════════════════════════╝\n`);
  });
}

process.on('uncaughtException', err => console.error('[UNCAUGHT]', err.message));
process.on('unhandledRejection', err => console.error('[REJECTION]', err?.message || err));

module.exports = server;
