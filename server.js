require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ── Lazy-load SessionManager ───────────────────────────────────────────────
let _sm = null;
function getSessionManager() {
  if (!_sm) {
    try {
      _sm = require('./lib/SessionManager');
    } catch (err) {
      console.error('[SERVER] SessionManager load error:', err.message);
      _sm = {
        startPairing: async () => { throw new Error('Session backend unavailable: ' + err.message); },
        destroySession: async () => {},
        allSessions: () => [],
        getSession: () => null
      };
    }
  }
  return _sm;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── /pair  (serve the pairing website) ────────────────────────────────────
app.get('/pair', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Health ─────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    sessions: getSessionManager().allSessions().length,
    env: process.env.VERCEL ? 'vercel' : 'standalone',
    uptime: process.uptime()
  });
});

app.get('/uptime', (req, res) => {
  res.json({
    uptime: formatUptime(process.uptime() * 1000),
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString()
  });
});

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
        m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${d}d ${h}h ${m}m ${sec}s`;
}

// ── /code  (SSE — matches the working reference site pattern) ─────────────
// GET /code?number=PHONE
// Emits: event:code → {code, sessionId}
//        event:session → {sessionId} (when WhatsApp connects)
//        event:error → {message}
app.get('/code', async (req, res) => {
  const number = (req.query.number || '').replace(/\D/g, '');
  if (!number || number.length < 7 || number.length > 15) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  // SSE setup
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(': connected\n\n');

  let closed = false;
  function send(event, data) {
    if (closed) return;
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (_) {}
  }

  req.on('close', () => { closed = true; });

  // Heartbeat so Vercel / proxies don't kill the connection before the code arrives
  const hb = setInterval(() => { if (!closed) try { res.write(': heartbeat\n\n'); } catch(_) {} }, 10000);

  try {
    const sm = getSessionManager();
    // startPairing resolves with {sessionId, code} when pairing code is ready,
    // and fires the onConnect callback when WhatsApp goes online.
    const { sessionId, code } = await sm.startPairing(number, (event, data) => {
      send(event, data);
      if (event === 'session' || event === 'error') {
        clearInterval(hb);
        try { res.end(); } catch (_) {}
        closed = true;
      }
    });
    send('code', { code, sessionId });
  } catch (err) {
    console.error('[CODE] Error:', err.message);
    send('error', { message: err.message || 'Failed to generate pairing code' });
    clearInterval(hb);
    try { res.end(); } catch (_) {}
  }
});

// ── Sessions list ──────────────────────────────────────────────────────────
app.get('/api/sessions', (req, res) => {
  res.json(getSessionManager().allSessions());
});

// ── Session status (polling fallback) ─────────────────────────────────────
app.get('/api/pair-status/:sessionId', (req, res) => {
  const info = getSessionManager().getSession(req.params.sessionId);
  if (!info) return res.json({ status: 'disconnected' });
  res.json({ status: info.status, name: info.name || null, connectedAt: info.connectedAt || null });
});

// ── Disconnect ─────────────────────────────────────────────────────────────
app.post('/api/disconnect', async (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: 'Session ID required' });
  await getSessionManager().destroySession(sessionId);
  res.json({ success: true });
});

// ── Server start (direct run only) ────────────────────────────────────────
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

// Vercel expects the Express app, not the raw http.Server
module.exports = app;
