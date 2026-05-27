require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

// polling works in Vercel serverless; websocket works in persistent envs
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['polling', 'websocket'],
  allowEIO3: true
});

const PORT = process.env.PORT || 3000;

// Lazy-load SessionManager so a bad import never kills the web server
let sm = null;
function getSessionManager() {
  if (!sm) {
    try {
      sm = require('./lib/SessionManager');
      sm.setIO(io);
    } catch (err) {
      console.error('[SERVER] SessionManager load error:', err.message);
      sm = {
        createSession: async () => { throw new Error('Session backend unavailable: ' + err.message); },
        destroySession: async () => {},
        allSessions: () => [],
        setIO: () => {}
      };
    }
  }
  return sm;
}

try { getSessionManager(); } catch (_) {}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', sessions: getSessionManager().allSessions().length, env: process.env.VERCEL ? 'vercel' : 'standalone' });
});

// API: start pairing
app.post('/api/pair', async (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'Phone number required' });
  const cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.length < 7 || cleaned.length > 15)
    return res.status(400).json({ error: 'Invalid phone number' });

  const sessionId = crypto.randomBytes(8).toString('hex');
  res.json({ sessionId, message: 'Pairing started' });

  getSessionManager().createSession(cleaned, sessionId).catch(err => {
    console.error('[PAIR] Error:', err.message);
    io.emit('log', { sessionId, msg: `Error: ${err.message}` });
  });
});

// API: disconnect session
app.post('/api/disconnect', async (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: 'Session ID required' });
  await getSessionManager().destroySession(sessionId);
  res.json({ success: true });
});

// API: list sessions
app.get('/api/sessions', (req, res) => {
  res.json(getSessionManager().allSessions());
});

// Socket.io — send current state on connect
io.on('connection', (socket) => {
  socket.emit('sessions', getSessionManager().allSessions());
});

// Only bind port when running directly (not imported by Vercel)
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
