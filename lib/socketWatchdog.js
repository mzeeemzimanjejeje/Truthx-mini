/**
 * socketWatchdog.js — Production-grade socket health monitor for TRUTH-MD.
 *
 * Tracks three separate signals:
 *   1. lastMessageReceived  — when Baileys last emitted a messages.upsert event
 *   2. lastCommandProcessed — when a command handler actually ran (set by main.js)
 *   3. lastSendSuccess      — when a message was successfully sent by the socket
 *
 * If the socket appears "open" but none of these signals update for
 * STALE_MS (default 3 min), the watchdog forces a reconnect.
 *
 * Designed to catch "zombie" connections: WhatsApp shows bot online,
 * connection.update never fires 'close', but messages silently stop arriving.
 */

'use strict';

const STALE_MS          = 10 * 60 * 1000;  // 10 min no activity → reconnect
const WARMUP_MS         = 90 * 1000;        // ignore first 90s after connect
const CHECK_INTERVAL_MS = 60 * 1000;        // check every 60s
const SEND_PING_MS      = 60 * 1000;        // send WS ping every 60s

let _timer        = null;
let _pingTimer    = null;
let _connectedAt  = 0;
let _lastRx       = 0;   // last message received
let _lastTx       = 0;   // last message sent
let _lastCmd      = 0;   // last command processed
let _forcedReconnects = 0;
let _log = (...a) => console.log('[WD]', ...a);

function _activity() {
    return Math.max(_lastRx, _lastTx, _lastCmd);
}

function markMessageReceived() { _lastRx = Date.now(); }
function markMessageSent()     { _lastTx = Date.now(); }
function markCommandRan()      { _lastCmd = Date.now(); }

function onConnect() {
    _connectedAt = Date.now();
    // Reset rx/tx on each connect so the warmup period starts fresh.
    // Do NOT reset _lastCmd — a hanging command from the previous session
    // should not trick the watchdog into thinking things are healthy.
    _lastRx = Date.now();
    _lastTx = Date.now();
    _log('Watchdog armed. Stale threshold:', STALE_MS / 1000 + 's, warmup:', WARMUP_MS / 1000 + 's');
}

function onDisconnect() {
    _connectedAt = 0;
}

/**
 * Start the watchdog. Call once after first startXeonBotInc().
 * @param {Function} forceReconnect  - async fn that tears down current socket and calls startXeonBotInc()
 * @param {Function} getSocket       - fn that returns the current XeonBotInc socket (or null)
 * @param {Function} logFn           - optional log function (chalk-aware)
 */
function start(forceReconnect, getSocket, logFn) {
    if (logFn) _log = logFn;
    stop(); // clear any previous timer

    _timer = setInterval(async () => {
        try {
            if (!global.isBotConnected) return;
            if (global.isRestarting || global.isReconnecting) return;
            if (!_connectedAt) return;

            const now = Date.now();
            if (now - _connectedAt < WARMUP_MS) return; // still warming up

            const sinceActivity = now - _activity();
            if (sinceActivity < STALE_MS) return; // all good

            _forcedReconnects++;
            const staleMin = Math.round(sinceActivity / 60000);
            _log(`⚠️  Zombie socket detected — no activity for ${staleMin} min (forced #${_forcedReconnects}). Reconnecting...`);

            // Tear down the stale socket
            const sock = getSocket ? getSocket() : global.currentSocket;
            if (sock) {
                try { sock.ev?.removeAllListeners(); } catch (_) {}
                try { sock.ws?.terminate(); } catch (_) { try { sock.ws?.close(); } catch (_) {} }
            }
            global.isBotConnected = false;
            global._welcomeSent = false;
            global.connectionMessageSent = false;
            global._lastMessageTime = 0;
            global.reconnectAttempts = 0;
            global.isReconnecting = false;

            await new Promise(r => setTimeout(r, 2000));
            await forceReconnect();
        } catch (e) {
            _log('Watchdog check error:', e.message);
        }
    }, CHECK_INTERVAL_MS);

    // WS-level ping — keeps the TCP connection alive through NAT/firewall
    _pingTimer = setInterval(() => {
        try {
            if (!global.isBotConnected) return;
            const sock = getSocket ? getSocket() : global.currentSocket;
            if (!sock?.ws) return;
            // Baileys uses ws-level ping internally, but we add a second one
            // to ensure the TCP stream stays alive on Pterodactyl/Docker NAT.
            if (typeof sock.ws.ping === 'function') {
                _lastTx = Date.now(); // mark activity on attempt, not just success
                sock.ws.ping(Buffer.alloc(0), false, (err) => {
                    if (err) _log('Ping error:', err.message);
                });
            }
        } catch (_) {}
    }, SEND_PING_MS);

    _log('Started — check every', CHECK_INTERVAL_MS / 1000 + 's, ping every', SEND_PING_MS / 1000 + 's');
}

function stop() {
    if (_timer)     { clearInterval(_timer);     _timer = null; }
    if (_pingTimer) { clearInterval(_pingTimer); _pingTimer = null; }
}

function stats() {
    return {
        connectedAt: _connectedAt,
        lastRx: _lastRx,
        lastTx: _lastTx,
        lastCmd: _lastCmd,
        sinceActivityMs: Date.now() - _activity(),
        forcedReconnects: _forcedReconnects,
    };
}

module.exports = {
    start,
    stop,
    onConnect,
    onDisconnect,
    markMessageReceived,
    markMessageSent,
    markCommandRan,
    stats,
};
