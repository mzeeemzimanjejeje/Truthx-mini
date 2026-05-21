/**
 * threadPool.js — Worker-thread pool for CPU-bound tasks.
 *
 * WhatsApp bots are mostly I/O-bound (network waits), but some operations
 * genuinely block Node's event loop:
 *   • Large Buffer ↔ base64 conversions for media
 *   • Heavy JSON stringify/parse (store snapshots)
 *   • Synchronous image-buffer manipulation
 *
 * This pool keeps N threads warm and routes tasks to idle threads, so those
 * operations don't stall the Baileys event loop.
 *
 * Usage (anywhere in the bot):
 *   const { runInThread } = require('./lib/threadPool');
 *   const result = await runInThread('base64encode', buffer);
 *   const buf    = await runInThread('base64decode', base64String);
 *   const parsed = await runInThread('jsonparse', jsonString);
 */

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os   = require('os');
const path = require('path');

if (!isMainThread) {
    // ── Worker side ──────────────────────────────────────────────────────────
    parentPort.on('message', ({ id, task, payload }) => {
        try {
            let result;
            switch (task) {
                case 'base64encode':
                    result = Buffer.isBuffer(payload)
                        ? payload.toString('base64')
                        : Buffer.from(payload).toString('base64');
                    break;
                case 'base64decode':
                    result = Buffer.from(payload, 'base64');
                    break;
                case 'jsonparse':
                    result = JSON.parse(payload);
                    break;
                case 'jsonstringify':
                    result = JSON.stringify(payload);
                    break;
                case 'bufferconcat':
                    result = Buffer.concat(payload.map(b => Buffer.isBuffer(b) ? b : Buffer.from(b)));
                    break;
                default:
                    throw new Error(`Unknown task: ${task}`);
            }
            parentPort.postMessage({ id, ok: true, result });
        } catch (e) {
            parentPort.postMessage({ id, ok: false, error: e.message });
        }
    });
    return; // worker side ends here
}

// ── Main thread side ─────────────────────────────────────────────────────────

const _cpuCount  = os.cpus().length;
// Dedicate up to 25% of cores to the thread pool (min 1, max 8).
// More threads means more parallel CPU work without starving the event loop.
const POOL_SIZE  = Math.min(Math.max(Math.floor(_cpuCount / 4), 1), 8);

let _taskId   = 0;
const _pending  = new Map();   // id → { resolve, reject }
const _workers  = [];
const _idle     = [];          // indices of idle workers

function _makeWorker() {
    const w = new Worker(__filename);
    const idx = _workers.length;
    _workers.push(w);
    _idle.push(idx);

    w.on('message', ({ id, ok, result, error }) => {
        const cb = _pending.get(id);
        if (!cb) return;
        _pending.delete(id);
        _idle.push(idx);
        _flush();
        ok ? cb.resolve(result) : cb.reject(new Error(error));
    });

    w.on('error', (err) => {
        console.error(`[threadPool] Worker ${idx} error:`, err.message);
        // Restart the worker so the pool stays at full capacity
        _workers[idx] = null;
        setTimeout(() => {
            _workers[idx] = _makeWorkerAt(idx);
        }, 1000);
    });

    return w;
}

const _queue = [];   // buffered tasks when all workers are busy

function _flush() {
    while (_idle.length > 0 && _queue.length > 0) {
        const { id, task, payload, transferList } = _queue.shift();
        const workerIdx = _idle.shift();
        const w = _workers[workerIdx];
        if (!w) { _idle.push(workerIdx); continue; }
        try {
            w.postMessage({ id, task, payload }, transferList || []);
        } catch (e) {
            const cb = _pending.get(id);
            if (cb) { _pending.delete(id); cb.reject(e); }
            _idle.push(workerIdx);
        }
    }
}

function _makeWorkerAt(idx) {
    const w = new Worker(__filename);
    _workers[idx] = w;
    _idle.push(idx);

    w.on('message', ({ id, ok, result, error }) => {
        const cb = _pending.get(id);
        if (!cb) return;
        _pending.delete(id);
        _idle.push(idx);
        _flush();
        ok ? cb.resolve(result) : cb.reject(new Error(error));
    });

    w.on('error', (err) => {
        console.error(`[threadPool] Worker ${idx} restarted after error:`, err.message);
        _workers[idx] = null;
        setTimeout(() => { _makeWorkerAt(idx); }, 1000);
    });

    return w;
}

// Initialise pool
for (let i = 0; i < POOL_SIZE; i++) _makeWorker();

/**
 * Run a CPU-bound task on a thread pool worker.
 * @param {'base64encode'|'base64decode'|'jsonparse'|'jsonstringify'|'bufferconcat'} task
 * @param {*} payload  - data to process
 * @returns {Promise<*>} result
 */
function runInThread(task, payload) {
    const id = ++_taskId;
    return new Promise((resolve, reject) => {
        _pending.set(id, { resolve, reject });

        // Use transferList for Buffers/ArrayBuffers to avoid copy overhead
        const transferList = [];
        let sendPayload = payload;

        if (Buffer.isBuffer(payload)) {
            const ab = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
            sendPayload = ab;
            transferList.push(ab);
        }

        _queue.push({ id, task, payload: sendPayload, transferList });
        _flush();
    });
}

/**
 * Base64-encode a Buffer efficiently (off the main thread).
 */
async function bufferToBase64(buf) {
    if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
    if (buf.length < 64 * 1024) return buf.toString('base64'); // small: inline
    return runInThread('base64encode', buf);
}

/**
 * Base64-decode a string to a Buffer efficiently.
 */
async function base64ToBuffer(str) {
    if (typeof str !== 'string') return Buffer.from(str);
    if (str.length < 64 * 1024) return Buffer.from(str, 'base64'); // small: inline
    const ab = await runInThread('base64decode', str);
    return Buffer.from(ab);
}

module.exports = { runInThread, bufferToBase64, base64ToBuffer, POOL_SIZE };
