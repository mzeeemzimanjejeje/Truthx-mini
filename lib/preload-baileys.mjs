// Preloads @whiskeysockets/baileys as ESM into globalThis BEFORE index.js loads.
// Added to start.sh via: node --import ./lib/preload-baileys.mjs index.js
// This ensures require('@whiskeysockets/baileys') always has a cached module
// to fall back to, even inside async ESM contexts (e.g. xsqlite3 obfuscation runtime).
import * as baileys from '@whiskeysockets/baileys';
globalThis.__baileysCached = baileys;
