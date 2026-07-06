console.log("[SERVER] server.js starting...");
require('dotenv').config();
const express = require('express');
const http    = require('http');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3000;

let _sm = null;
function getSessionManager() {
  if (!_sm) {
    try {
      _sm = require('./lib/SessionManager');
    } catch (err) {
      console.error('[SERVER] SessionManager load error:', err.message);
      _sm = {
        startPairing:   async () => { throw new Error('Session backend unavailable: ' + err.message); },
        destroySession: async () => {},
        allSessions:    () => [],
        getSession:     () => null,
      };
    }
  }
  return _sm;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/pair', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/api/health', (req, res) => {
  res.json({
    status:   'ok',
    sessions: getSessionManager().allSessions().length,
    env:      process.env.VERCEL ? 'vercel' : 'standalone',
    uptime:   process.uptime(),
  });
});

app.get('/uptime', (req, res) => {
  res.json({
    uptime:    formatUptime(process.uptime() * 1000),
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
  });
});

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
        m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${d}d ${h}h ${m}m ${sec}s`;
}

// ── SSE pairing endpoint ───────────────────────────────────────────────────
// GET /code?number=PHONENUMBER
// Emits:  event:code    → { code }          when pairing code is ready
//         event:session → { name }          when WhatsApp links (connection open)
//         event:error   → { message }       on failure
app.get('/code', async (req, res) => {
  const number = (req.query.number || '').replace(/\D/g, '');
  if (!number || number.length < 7 || number.length > 15) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  res.writeHead(200, {
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');

  let closed = false;
  const send = (event, data) => {
    if (closed) return;
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (_) {}
  };

  req.on('close', () => { closed = true; });

  // Heartbeat — keeps Vercel / reverse-proxies alive during the code-entry window
  const hb = setInterval(() => {
    if (!closed) try { res.write(': heartbeat\n\n'); } catch (_) {}
  }, 10_000);

  const cleanup = () => {
    clearInterval(hb);
    if (!closed) { closed = true; try { res.end(); } catch (_) {} }
  };

  try {
    const sm = getSessionManager();
    
    // Enforce session limit
    const MAX_SESSIONS = 100;
    if (sm.allSessions().length >= MAX_SESSIONS) {
      send('error', { message: 'Server is full. Please try another server.' });
      return cleanup();
    }

    // startPairing fires onEvent callbacks for session/error events,
    // and resolves with { sessionId, code } once the pairing code is ready.
    const { code } = await sm.startPairing(number, (event, data) => {
      send(event, data);
      // Close immediately on error (no session to keep alive).
      // On success ('session') we intentionally keep the SSE open so the
      // underlying WhatsApp socket stays alive and the bot can respond to
      // commands.  The client can close the stream when it navigates away.
      if (event === 'error') {
        cleanup();
      }
    });

    send('code', { code });
  } catch (err) {
    console.error('[CODE] Error:', err.message);
    send('error', { message: err.message || 'Failed to generate pairing code' });
    cleanup();
  }
});

app.get('/api/sessions', (req, res) => {
  res.json(getSessionManager().allSessions());
});

app.get('/api/pair-status/:sessionId', (req, res) => {
  const info = getSessionManager().getSession(req.params.sessionId);
  if (!info) return res.json({ status: 'disconnected' });
  res.json({ status: info.status, name: info.name || null, connectedAt: info.connectedAt || null });
});


app.post('/api/delete-session', async (req, res) => {
  const { number } = req.body || {};
  if (!number) return res.status(400).json({ error: 'Phone number required' });
  
  const cleanNumber = number.replace(/\D/g, '');
  const sm = getSessionManager();
  
  // Try to find the session ID for this number
  // In this bot, sessionId is often the same as the phone number
  await sm.destroySession(cleanNumber);
  
  res.json({ success: true, message: `Session for ${cleanNumber} deleted.` });
});

app.post('/api/disconnect', async (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: 'Session ID required' });
  await getSessionManager().destroySession(sessionId);
  res.json({ success: true });
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n╔════════════════════════════╗`);
    console.log(`║  TRUTH-MD Pair Web v1.0.0  ║`);
    console.log(`║  Running on port ${PORT}       ║`);
    console.log(`╚════════════════════════════╝\n`);
  });
}

process.on('uncaughtException',  err => console.error('[UNCAUGHT]', err.message));
process.on('unhandledRejection', err => console.error('[REJECTION]', err?.message || err));

module.exports = app;
getSessionManager();
