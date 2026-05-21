/**
 * Per-user command rate limiter.
 * Prevents spam overload by throttling commands from the same sender.
 */

// Use container RAM (not host RAM) so panels/VMs with small allocations
// aren't mistakenly treated as high-memory hosts and given a too-lenient cooldown.
const { containerRAM } = require('./systemRAM');

// Cooldown between commands per user.
const COOLDOWN_MS = containerRAM < 512 ? 500 : 300;
const MAX_QUEUE   = containerRAM < 512 ? 3   : 5;

const cooldownMap = new Map();   // jid → { lastCmd: timestamp, count: number }

// Clean up stale entries every 5 minutes
setInterval(() => {
    const cutoff = Date.now() - COOLDOWN_MS * 10;
    for (const [jid, info] of cooldownMap) {
        if (info.lastCmd < cutoff) cooldownMap.delete(jid);
    }
}, 5 * 60 * 1000);

/**
 * Returns true if the sender is allowed to run a command right now.
 * Returns false if they are rate-limited (command should be silently ignored).
 */
function checkRateLimit(jid) {
    const now = Date.now();
    const info = cooldownMap.get(jid);

    if (!info) {
        cooldownMap.set(jid, { lastCmd: now, count: 1 });
        return true;
    }

    const elapsed = now - info.lastCmd;

    if (elapsed >= COOLDOWN_MS) {
        // Cooldown expired — reset
        info.lastCmd = now;
        info.count = 1;
        return true;
    }

    // Within cooldown window
    info.count++;
    if (info.count > MAX_QUEUE) {
        return false;  // rate-limited
    }

    // Allow a small burst within the window
    return true;
}

/**
 * Returns how many milliseconds remain on the cooldown for a jid.
 * Returns 0 if not rate-limited.
 */
function getRemainingCooldown(jid) {
    const info = cooldownMap.get(jid);
    if (!info) return 0;
    const remaining = COOLDOWN_MS - (Date.now() - info.lastCmd);
    return Math.max(0, remaining);
}

module.exports = { checkRateLimit, getRemainingCooldown, COOLDOWN_MS };
