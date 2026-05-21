'use strict';
// ── Baileys require() hook ────────────────────────────────────────────────────
// When running inside an async ESM runtime (e.g. xsqlite3 obfuscation launcher),
// require('@whiskeysockets/baileys') throws ERR_REQUIRE_ASYNC_MODULE because the
// surrounding module graph has top-level await.
//
// This hook intercepts every require() call for baileys across the ENTIRE
// codebase and, on failure, returns a lazy placeholder whose properties and
// functions forward to globalThis.__baileysCached at call-time (populated by
// the async import() fallback in connectToWA inside index.js).
//
// Must be required as the very FIRST line of index.js.
// ─────────────────────────────────────────────────────────────────────────────

const Module = require('module');
const origLoad = Module._load;

// Known baileys exports that are used as plain functions
const FN_EXPORTS = [
    'initAuthCreds', 'downloadContentFromMessage', 'downloadMediaMessage',
    'getBinaryNodeChild', 'getContentType', 'jidNormalizedUser',
    'makeCacheableSignalKeyStore', 'delay', 'fetchLatestBaileysVersion',
    'generateWAMessageContent', 'generateWAMessageFromContent',
    'makeWASocket',
];
// Known baileys exports that are used as objects (including nested access)
const OBJ_EXPORTS = ['proto', 'BufferJSON', 'DisconnectReason'];

function makeFnProxy(name) {
    // Returns a callable wrapper that forwards to the real export at call-time
    return function (...args) {
        const m = globalThis.__baileysCached;
        if (!m || typeof m[name] !== 'function') {
            throw new Error(`[TRUTH-MD] baileys.${name} not yet available — async load in progress`);
        }
        return m[name](...args);
    };
}

function makeObjProxy(name) {
    return new Proxy({}, {
        get(_, k) { return globalThis.__baileysCached?.[name]?.[k]; },
        set(_, k, v) {
            if (globalThis.__baileysCached?.[name]) globalThis.__baileysCached[name][k] = v;
            return true;
        },
        has(_, k) { return k in (globalThis.__baileysCached?.[name] ?? {}); },
    });
}

// Build the lazy placeholder once
const lazyPlaceholder = { __isLazyPlaceholder: true };
for (const n of FN_EXPORTS) lazyPlaceholder[n] = makeFnProxy(n);
for (const n of OBJ_EXPORTS) lazyPlaceholder[n] = makeObjProxy(n);
lazyPlaceholder.default = makeFnProxy('makeWASocket'); // ESM default export

Module._load = function (request, parent, isMain) {
    const isBaileys = request === '@whiskeysockets/baileys';
    if (isBaileys) {
        // Return cached immediately if we already have it
        if (globalThis.__baileysCached) return globalThis.__baileysCached;
        try {
            const result = origLoad.apply(this, arguments);
            globalThis.__baileysCached = result;
            return result;
        } catch (e) {
            if (e.code === 'ERR_REQUIRE_ASYNC_MODULE' || e.code === 'ERR_REQUIRE_ESM') {
                // Running inside async ESM context — return lazy placeholder.
                // All actual call-sites will work once __baileysCached is set
                // by the async import() in connectToWA().
                return lazyPlaceholder;
            }
            throw e;
        }
    }
    return origLoad.apply(this, arguments);
};
