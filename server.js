require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const { createSession, destroySession, allSessions, setIO, restoreSessions } = require('./lib/SessionManager');

const app = express();
const server = http.createServer(app);

// Use polling transport for Vercel serverless compatibility
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['polling', 'websocket'],
  allowEIO3: true
});

const PORT = process.env.PORT || 3000;

setIO(io);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: start pairing
app.post('/api/pair', async (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'Phone number required' });
  const cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.length < 7 || cleaned.length > 15)
    return res.status(400).json({ error: 'Invalid phone number' });

  const sessionId = crypto.randomBytes(8).toString('hex');
  res.json({ sessionId, message: 'Pairing started' });

  // Start session async
  createSession(cleaned, sessionId).catch(err => {
    console.error('[PAIR] Error:', err.message);
    io.emit('log', { sessionId, msg: `Error: ${err.message}` });
  });
});

// API: disconnect session
app.post('/api/disconnect', async (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: 'Session ID required' });
  await destroySession(sessionId);
  res.json({ success: true });
});

// API: list sessions
app.get('/api/sessions', (req, res) => {
  res.json(allSessions());
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', sessions: allSessions().length });
});

// Socket.io — send current state on connect
io.on('connection', (socket) => {
  socket.emit('sessions', allSessions());
});

// Only bind the port when running directly (not via Vercel serverless)
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n╔════════════════════════════╗`);
    console.log(`║  TRUTH-MD Pair Web v1.0.0  ║`);
    console.log(`║  Running on port ${PORT}        ║`);
    console.log(`╚════════════════════════════╝\n`);

    // Restore any saved sessions from previous run
    restoreSessions().catch(err => console.error('[RESTORE]', err.message));
  });
} else {
  // Vercel serverless: restore sessions on cold start (best effort)
  restoreSessions().catch(() => {});
}

// Anti-crash
process.on('uncaughtException', err => console.error('[UNCAUGHT]', err.message));
process.on('unhandledRejection', err => console.error('[REJECTION]', err?.message || err));

// Export for Vercel serverless
module.exports = server;
