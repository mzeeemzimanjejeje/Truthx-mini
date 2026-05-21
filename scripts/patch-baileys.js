const fs = require('fs');
const path = require('path');

const SOCKET_FILE = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Socket', 'socket.js');
const CHATS_FILE = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Socket', 'chats.js');
const MESSAGES_RECV_FILE = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Socket', 'messages-recv.js');

function patchSocket() {
    if (!fs.existsSync(SOCKET_FILE)) { console.log('[patch-baileys] socket.js not found, skipping'); return; }
    let code = fs.readFileSync(SOCKET_FILE, 'utf-8');

    if (code.includes('// [PATCHED] event buffer disabled')) {
        console.log('[patch-baileys] socket.js already patched');
        return;
    }

    let patched = false;

    // Pattern A: uncompiled TS (official Baileys ESM build)
    const bufferBlock = /if \(creds\.me\?\.id\) \{\s*\/\/ start buffering important events\s*\/\/ if we're logged in\s*ev\.buffer\(\);\s*didStartBuffer = true;\s*\}/;
    if (bufferBlock.test(code)) {
        code = code.replace(bufferBlock, '// [PATCHED] event buffer disabled\n            didStartBuffer = false;');
        patched = true;
    }

    // Pattern B: compiled CJS (trashcore / older forks) — (_a = creds.me) === null || ... ? void 0 : _a.id
    const bufferBlockCompiled = /if \(\(_a = creds\.me\) === null \|\| _a === void 0 \? void 0 : _a\.id\) \{\s*\/\/ start buffering important events\s*\/\/ if we're logged in\s*ev\.buffer\(\);\s*didStartBuffer = true;\s*\}/;
    if (bufferBlockCompiled.test(code)) {
        code = code.replace(bufferBlockCompiled, '// [PATCHED] event buffer disabled\n            didStartBuffer = false;');
        patched = true;
    }

    const offlineFlush = /if \(didStartBuffer\) \{\s*ev\.flush\(\);\s*logger\.trace\('flushed events for initial buffer'\);\s*\}/;
    if (offlineFlush.test(code)) {
        code = code.replace(offlineFlush, '// [PATCHED] no buffer to flush');
        patched = true;
    }

    code = code.replace(
        /if \(!offlineHandled && didStartBuffer\) \{/,
        'if (!offlineHandled) {'
    );

    code = code.replace(
        "logger.warn('CB:ib,,offline never fired, force-flushing buffer and signaling readiness');",
        "logger.warn('CB:ib,,offline never fired, signaling readiness');"
    );

    const forceFlushLine = /offlineHandled = true;\s*ev\.flush\(\);\s*ev\.emit\('connection\.update'/;
    if (forceFlushLine.test(code)) {
        code = code.replace(forceFlushLine, "offlineHandled = true;\n            ev.emit('connection.update'");
        patched = true;
    }

    if (patched) {
        fs.writeFileSync(SOCKET_FILE, code, 'utf-8');
        console.log('[patch-baileys] socket.js patched - event buffering disabled');
    } else {
        console.log('[patch-baileys] socket.js - no matching patterns found');
    }
}

function patchChats() {
    if (!fs.existsSync(CHATS_FILE)) { console.log('[patch-baileys] chats.js not found, skipping'); return; }
    let code = fs.readFileSync(CHATS_FILE, 'utf-8');

    if (code.includes('// [PATCHED-CHATS]')) {
        console.log('[patch-baileys] chats.js already patched');
        return;
    }

    // Exact 3-line anchor — present in both official baileys v7 and the custom fork.
    // We replace just these 3 lines and add return; so the remaining sync-wait block
    // below is bypassed without touching it (avoids orphaned-brace syntax errors).
    const ANCHOR = "        syncState = SyncState.AwaitingInitialSync;\n        logger.info('Connection is now AwaitingInitialSync, buffering events');\n        ev.buffer();";
    if (code.includes(ANCHOR)) {
        code = code.replace(ANCHOR,
            "        // [PATCHED-CHATS] skip buffering — go directly to Online so commands respond immediately\n" +
            "        syncState = SyncState.Online;\n" +
            "        logger.info('Skipping AwaitingInitialSync \\u2014 transitioning directly to Online (no buffering).');\n" +
            "        setTimeout(() => { try { ev.flush(); } catch(_) {} }, 0);\n" +
            "        return; // [PATCHED-CHATS] remaining sync-wait logic below is intentionally bypassed"
        );
        fs.writeFileSync(CHATS_FILE, code, 'utf-8');
        console.log('[patch-baileys] chats.js patched - AwaitingInitialSync bypassed');
    } else {
        console.log('[patch-baileys] chats.js - no matching patterns found (may already be patched differently)');
    }
}

function patchMessagesRecv() {
    if (!fs.existsSync(MESSAGES_RECV_FILE)) { console.log('[patch-baileys] messages-recv.js not found, skipping'); return; }
    let recvContent = fs.readFileSync(MESSAGES_RECV_FILE, 'utf-8');

    if (!recvContent.includes('// silenced mex newsletter')) {
        recvContent = recvContent.replace(
            "logger.warn({ node }, 'Invalid mex newsletter notification');",
            '// silenced mex newsletter\n            return;'
        );
        recvContent = recvContent.replace(
            "logger.warn({ data }, 'Invalid mex newsletter notification content');",
            '// silenced mex newsletter content\n            return;'
        );
        fs.writeFileSync(MESSAGES_RECV_FILE, recvContent, 'utf-8');
        console.log('[patch-baileys] Silenced mex newsletter notification warnings');
    } else {
        console.log('[patch-baileys] Newsletter warnings already silenced');
    }
}

function patchSessionCipher() {
    // Check both possible locations — top-level libsignal (most common) and baileys-bundled
    const CANDIDATES = [
        path.join(__dirname, '..', 'node_modules', 'libsignal', 'src', 'session_cipher.js'),
        path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'node_modules', 'libsignal', 'src', 'session_cipher.js'),
    ];
    const SESSION_CIPHER_FILE = CANDIDATES.find(f => fs.existsSync(f));
    if (!SESSION_CIPHER_FILE) { console.log('[patch-baileys] session_cipher.js not found in any known location, skipping'); return; }
    let cipherContent = fs.readFileSync(SESSION_CIPHER_FILE, 'utf-8');

    if (!cipherContent.includes('// [BAD-MAC-FIX]')) {
        // 1. Silence noisy console logs
        cipherContent = cipherContent.replace(
            'console.error("Failed to decrypt message with any known session...");',
            '// silenced decrypt errors'
        );
        cipherContent = cipherContent.replace(
            'console.error("Session error:" + e, e.stack);',
            '// silenced session error log'
        );
        // 2. Purge corrupted session on Bad MAC so next message re-establishes a fresh one.
        //    Without this the bot stays permanently broken for that sender until a manual restart.
        cipherContent = cipherContent.replace(
            `        const result = await this.decryptWithSessions(data, record.getSessions());`,
            `        // [BAD-MAC-FIX] purge corrupted session on total decrypt failure
        let result;
        try {
            result = await this.decryptWithSessions(data, record.getSessions());
        } catch(e) {
            try { record.sessions = {}; await this.storeRecord(record); } catch(_) {}
            throw e;
        }`
        );
        fs.writeFileSync(SESSION_CIPHER_FILE, cipherContent, 'utf-8');
        console.log('[patch-baileys] Applied Bad MAC self-healing fix to session_cipher.js');
    } else {
        console.log('[patch-baileys] session_cipher.js Bad MAC fix already applied');
    }
}

// [MOD-A] Default participant.device to 0 in relayMessage so peer-relay sends
// to a plain user JID don't crash.  Required for dev-reaction delivery in
// announce-only groups where the bot is not admin.
function patchMessagesSendDevice() {
    const FILE = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Socket', 'messages-send.js');
    if (!fs.existsSync(FILE)) { console.log('[patch-baileys] messages-send.js not found, skipping'); return; }
    let code = fs.readFileSync(FILE, 'utf-8');
    if (code.includes('// [MOD] default device to 0')) {
        console.log('[patch-baileys] messages-send.js device fix already applied');
        return;
    }
    // Tolerant anchor: match the devices.push block that uses bare `device`
    // (i.e. unmodified upstream) regardless of spacing/comments.
    const re = /(devices\.push\s*\(\s*\{\s*user\s*,\s*)device(\s*,\s*jid\s*:\s*participant\.jid\s*\}\s*\)\s*;)/;
    if (re.test(code)) {
        code = code.replace(re, '$1device: device ?? 0 /* [MOD] default device to 0 */$2');
        fs.writeFileSync(FILE, code, 'utf-8');
        console.log('[patch-baileys] messages-send.js patched - participant device defaulted to 0');
    } else {
        // MD-Baileys already handles this internally — skip gracefully.
        console.log('[patch-baileys] messages-send.js device-fix anchor not found — already patched or not required by this Baileys version, skipping');
    }
}

// [MOD-B] Re-label the linked-device tuple so the bot's session shows a
// distinct name in WhatsApp's Linked Devices view (and doesn't masquerade
// as generic "Chrome (macOS)" like every stock Baileys install).
function patchDefaultsBrowser() {
    const FILE = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Defaults', 'index.js');
    if (!fs.existsSync(FILE)) { console.log('[patch-baileys] Defaults/index.js not found, skipping'); return; }
    let code = fs.readFileSync(FILE, 'utf-8');
    if (code.includes("['TRUTH-MD', 'Safari', '3.0']")) {
        console.log('[patch-baileys] Defaults/index.js browser tuple already patched');
        return;
    }
    // Tolerant anchor: match the `browser:` line in DEFAULT_CONNECTION_CONFIG
    // regardless of which Browsers.* helper or quoting style stock/MD Baileys uses.
    // Covers: Browsers.ubuntu('Chrome'), Browsers.macOS('Safari'),
    //         Utils_1.Browsers("Chrome"), ['name','browser','version'], etc.
    const re = /browser\s*:\s*(?:(?:\w+\.)*Browsers\s*(?:\.[a-zA-Z]+)?\s*\([^)]*\)|\[[^\]]*\])\s*,/;
    if (re.test(code)) {
        code = code.replace(re, "browser: ['TRUTH-MD', 'Safari', '3.0'],");
        fs.writeFileSync(FILE, code, 'utf-8');
        console.log('[patch-baileys] Defaults/index.js patched - linked-device tuple set to TRUTH-MD');
    } else {
        console.log('[patch-baileys] Defaults/index.js browser anchor not found — already patched or not required by this Baileys version, skipping');
    }
}

// [MOD-C] When a group message participant is a @lid JID and participantAlt is
// not already set, pull the real phone JID from node.attrs.participant_pn.
// This mirrors what @trashcore/baileys does (it fully replaces participant with
// participant_pn) and ensures devreact can always resolve the sender's real
// number in closed/announcement LID groups without needing a pre-built lid map.
function patchLidParticipantAlt() {
    if (!fs.existsSync(MESSAGES_RECV_FILE)) { console.log('[patch-baileys] messages-recv.js not found, skipping lid-alt patch'); return; }
    let code = fs.readFileSync(MESSAGES_RECV_FILE, 'utf-8');
    if (code.includes('// [PATCHED] lid participantAlt from participant_pn')) {
        console.log('[patch-baileys] lid participantAlt patch already applied');
        return;
    }
    const anchor = 'const alt = msg.key.participantAlt || msg.key.remoteJidAlt;';
    if (!code.includes(anchor)) {
        console.log('[patch-baileys] lid-alt anchor not found, skipping');
        return;
    }
    const injection = `// [PATCHED] lid participantAlt from participant_pn
        if (msg.key.participant?.endsWith('@lid') && !msg.key.participantAlt && node.attrs.participant_pn) {
            msg.key.participantAlt = node.attrs.participant_pn;
        }
        `;
    code = code.replace(anchor, injection + anchor);
    fs.writeFileSync(MESSAGES_RECV_FILE, code, 'utf-8');
    console.log('[patch-baileys] messages-recv.js patched - participantAlt filled from participant_pn for LID groups');
}

console.log('[patch-baileys] Applying Baileys patches...');
patchSocket();
patchChats();
patchMessagesRecv();
patchSessionCipher();
patchMessagesSendDevice();
patchDefaultsBrowser();
patchLidParticipantAlt();
console.log('[patch-baileys] Done.');
