// QuickConnect — 45-second stabilisation drain after each (re)connection.
// During the drain window the bot is fully operational but we flag it so
// the system status display can show "drain Xs" instead of "✓ ready".

const DRAIN_MS = 45 * 1000;

let _drainEnd    = 0;
let _draining    = false;
let _drainTimer  = null;

function startDrain() {
    if (_drainTimer) clearTimeout(_drainTimer);
    _drainEnd   = Date.now() + DRAIN_MS;
    _draining   = true;
    console.log('[QuickConnect] drain started — 45 s stabilisation');
    _drainTimer = setTimeout(() => {
        _draining   = false;
        _drainTimer = null;
        console.log('[QuickConnect] drain complete — connection stable');
    }, DRAIN_MS);
}

function isDraining() { return _draining; }

function getRemainingMs() {
    if (!_draining) return 0;
    return Math.max(0, _drainEnd - Date.now());
}

function getStatus() {
    if (_draining) return `drain ${Math.ceil(getRemainingMs() / 1000)}s`;
    return '✓ ready';
}

module.exports = { startDrain, isDraining, getRemainingMs, getStatus };
