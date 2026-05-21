/**
 * dbHealth.js — PostgreSQL connection health monitor for TRUTH-MD.
 *
 * Runs a lightweight "SELECT 1" query every CHECK_INTERVAL_MS.
 * If consecutive failures hit FAILURE_LIMIT, logs a critical warning.
 * All queries have a hard QUERY_TIMEOUT_MS deadline — hung queries
 * cannot block the event loop.
 */

'use strict';

const QUERY_TIMEOUT_MS  = 5000;   // 5 s per health query
const CHECK_INTERVAL_MS = 60000;  // check every 60 s
const FAILURE_LIMIT     = 3;      // alert after 3 consecutive failures

let _pool      = null;
let _timer     = null;
let _failures  = 0;
let _lastOk    = 0;
let _log = (...a) => console.log('[DBHEALTH]', ...a);

async function _check() {
    if (!_pool) return;
    let client;
    try {
        // Race the query against a hard timeout so a stalled PG server cannot
        // leave a dangling promise alive forever.
        const acquire = _pool.connect();
        const timeout = new Promise((_, rej) =>
            setTimeout(() => rej(new Error('DB health timeout')), QUERY_TIMEOUT_MS)
        );
        client = await Promise.race([acquire, timeout]);
        await client.query('SELECT 1');
        _lastOk  = Date.now();
        _failures = 0;
    } catch (e) {
        _failures++;
        _log(`⚠️  Health check failed (${_failures}/${FAILURE_LIMIT}): ${e.message}`);
        if (_failures >= FAILURE_LIMIT) {
            _log(`❌ DB unreachable for ${_failures} consecutive checks — check DATABASE_URL`);
        }
    } finally {
        if (client) {
            try { client.release(true); } catch (_) {} // pass true to discard broken connections
        }
    }
}

/**
 * Start the health monitor.
 * @param {import('pg').Pool} pool — the pg Pool to monitor
 * @param {Function} logFn — optional log function (chalk-aware)
 */
function start(pool, logFn) {
    if (logFn) _log = logFn;
    _pool = pool;
    stop();
    _log(`Started — query timeout ${QUERY_TIMEOUT_MS}ms, check every ${CHECK_INTERVAL_MS / 1000}s`);
    _timer = setInterval(_check, CHECK_INTERVAL_MS);
    // Run an immediate check so we know the state at startup
    _check().catch(() => {});
}

function stop() {
    if (_timer) { clearInterval(_timer); _timer = null; }
}

function stats() {
    return { failures: _failures, lastOk: _lastOk, hasPool: !!_pool };
}

module.exports = { start, stop, stats };
