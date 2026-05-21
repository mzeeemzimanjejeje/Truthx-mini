const os = require('os');
const { containerRAM } = require('./systemRAM');

const _totalMB  = containerRAM;
const _cpuCount = os.cpus().length;

function _scaleConfig() {
    // Each queue slot now AWAITS handleMessages, so concurrency = the exact number
    // of commands that can execute in parallel. Keep it low to prevent WhatsApp
    // rate-limiting and event-loop starvation. batchSize=1 ensures each slot
    // processes one command at a time for fair, ordered dispatch.
    let concurrency, maxQueue;
    if      (_totalMB <= 300)  { concurrency = 3;   maxQueue = 80;   }
    else if (_totalMB < 512)   { concurrency = 4;   maxQueue = 150;  }
    else if (_totalMB < 2048)  { concurrency = 5;   maxQueue = 300;  }
    else if (_totalMB < 8192)  { concurrency = 6;   maxQueue = 500;  }
    else if (_totalMB < 65536) { concurrency = 8;   maxQueue = 800;  }
    else                       { concurrency = 10;  maxQueue = 1000; }

    // Never exceed 2× CPU count to avoid thrashing on small containers.
    const finalConcurrency = Math.min(concurrency, Math.max(2, _cpuCount * 2));

    return { concurrency: finalConcurrency, batchSize: 1, batchDelayMs: 0, maxQueueSize: maxQueue };
}

class MessageQueue {
    constructor(handler, opts = {}) {
        const cfg = _scaleConfig();
        this._handler       = handler;
        this._concurrency   = opts.concurrency   || cfg.concurrency;
        this._batchSize     = opts.batchSize      || cfg.batchSize;
        this._batchDelayMs  = opts.batchDelayMs  !== undefined ? opts.batchDelayMs  : cfg.batchDelayMs;
        this._maxQueueSize  = opts.maxQueueSize   || cfg.maxQueueSize;

        this._queue    = [];
        this._active   = 0;
        this._draining = false;

        this.stats = { enqueued: 0, processed: 0, dropped: 0, errors: 0 };
    }

    enqueue(item) {
        if (this._queue.length >= this._maxQueueSize) {
            this.stats.dropped++;
            return false;
        }
        this._queue.push(item);
        this.stats.enqueued++;
        this._drain();
        return true;
    }

    _drain() {
        // When the queue was empty and a single message just arrived, start
        // processing in the same tick (no setImmediate) for minimum latency.
        // Only defer with setImmediate when we are already mid-drain so we
        // yield to I/O and avoid starving the event loop under load.
        if (this._active === 0) {
            this._start();
        } else {
            setImmediate(() => this._start());
        }
    }

    _start() {
        while (this._queue.length > 0 && this._active < this._concurrency) {
            const batch = this._queue.splice(0, this._batchSize);
            this._active++;
            this._processBatch(batch).finally(() => {
                this._active--;
                if (this._queue.length > 0) {
                    if (this._batchDelayMs > 0) {
                        setTimeout(() => this._start(), this._batchDelayMs);
                    } else {
                        setImmediate(() => this._start());
                    }
                }
            });
        }
    }

    async _processBatch(batch) {
        await Promise.all(batch.map(async (item) => {
            try {
                // 30s hard timeout per command — prevents a hanging API call from
                // permanently blocking a queue slot and silencing the bot for that user.
                await Promise.race([
                    this._handler(item),
                    new Promise((_, rej) => setTimeout(
                        () => rej(new Error('[MessageQueue] Command timed out after 30s — external service may be slow')),
                        30000
                    ))
                ]);
                this.stats.processed++;
            } catch (err) {
                this.stats.errors++;
                try { console.error(`[MessageQueue] Handler error: ${err.message}`); } catch (_) {}
            }
        }));
    }

    get pending() { return this._queue.length; }
    get active()  { return this._active; }

    clear() {
        const dropped = this._queue.length;
        this._queue = [];
        this.stats.dropped += dropped;
        return dropped;
    }

    async drain(timeoutMs = 10000) {
        if (this._queue.length === 0 && this._active === 0) return;
        return new Promise((resolve) => {
            const deadline = Date.now() + timeoutMs;
            const check = () => {
                if ((this._queue.length === 0 && this._active === 0) || Date.now() > deadline) {
                    resolve(this._queue.length);
                    return;
                }
                setTimeout(check, 50);
            };
            check();
        });
    }
}

module.exports = { MessageQueue, _scaleConfig };
