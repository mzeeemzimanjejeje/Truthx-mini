const fs = require('fs');
const path = require('path');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

const STORE_FILE = path.join(__dirname, '..', 'baileys_store.json');
const settings = require('../settings');
const MAX_MESSAGES   = settings.maxStoreMessages  || 2;
const MAX_CHATS      = settings.maxStoreChats     || 30;
const MAX_CONTACTS   = settings.maxStoreContacts  || 50;

function getDiskFreeMB() {
    try {
        const { execSync } = require('child_process');
        const out = execSync(`df -m "${path.join(__dirname, '..')}" 2>/dev/null | tail -1 | awk '{print $4}'`, { encoding: 'utf8', stdio: 'pipe' });
        return parseInt(out.trim(), 10) || 999;
    } catch (_) { return 999; }
}

function buildLidMapFromContacts(contacts) {
    try {
        const { updateLidMap } = require('./index');
        const entries = [];
        for (const [id, c] of Object.entries(contacts)) {
            if (c.id && c.lid) {
                entries.push({ id: c.id, lid: c.lid });
            }
        }
        if (entries.length > 0) updateLidMap(entries);
    } catch (_) {}
}

const store = {
    chats: {},
    contacts: {},
    messages: {},

    bind(ev) {
        ev.on('chats.upsert', (newChats) => {
            for (const chat of newChats) {
                store.chats[chat.id] = { ...(store.chats[chat.id] || {}), ...chat };
            }
        });

        ev.on('chats.update', (updates) => {
            for (const update of updates) {
                if (store.chats[update.id]) {
                    Object.assign(store.chats[update.id], update);
                }
            }
        });

        ev.on('contacts.upsert', (contacts) => {
            const newEntries = [];
            for (const contact of contacts) {
                store.contacts[contact.id] = { ...(store.contacts[contact.id] || {}), ...contact };
                if (contact.id && contact.lid) {
                    newEntries.push({ id: contact.id, lid: contact.lid });
                }
            }
            if (newEntries.length > 0) {
                try { const { updateLidMap } = require('./index'); updateLidMap(newEntries); } catch (_) {}
            }
        });

        ev.on('contacts.update', (updates) => {
            for (const update of updates) {
                if (store.contacts[update.id]) {
                    Object.assign(store.contacts[update.id], update);
                    if (update.lid) {
                        try { const { updateLidMap } = require('./index'); updateLidMap([{ id: update.id, lid: update.lid }]); } catch (_) {}
                    }
                }
            }
        });

        ev.on('messages.upsert', ({ messages: newMessages, type }) => {
            for (const msg of newMessages) {
                const jid = jidNormalizedUser(msg.key.remoteJid);
                if (!store.messages[jid]) store.messages[jid] = [];

                const liteMsg = { ...msg };
                if (liteMsg.message) {
                    const m = { ...liteMsg.message };
                    for (const k of Object.keys(m)) {
                        if (m[k] && typeof m[k] === 'object') {
                            const v = { ...m[k] };
                            delete v.jpegThumbnail;
                            delete v.thumbnailDirectPath;
                            delete v.mediaKey;
                            delete v.directPath;
                            delete v.thumbnailSha256;
                            delete v.thumbnailEncSha256;
                            m[k] = v;
                        }
                    }
                    liteMsg.message = m;
                }

                const existing = store.messages[jid].findIndex(m => m.key.id === msg.key.id);
                if (existing >= 0) {
                    store.messages[jid][existing] = liteMsg;
                } else {
                    store.messages[jid].push(liteMsg);
                    if (store.messages[jid].length > MAX_MESSAGES) {
                        store.messages[jid] = store.messages[jid].slice(-MAX_MESSAGES);
                    }
                }
            }
        });

        ev.on('messages.update', (updates) => {
            for (const { key, update } of updates) {
                const jid = jidNormalizedUser(key.remoteJid);
                if (store.messages[jid]) {
                    const msg = store.messages[jid].find(m => m.key.id === key.id);
                    if (msg) Object.assign(msg, update);
                }
            }
        });
    },

    loadMessage(jid, id) {
        const normalJid = jidNormalizedUser(jid);
        const msgs = store.messages[normalJid] || [];
        return msgs.find(m => m.key.id === id) || null;
    },

    readFromFile() {
        try {
            if (fs.existsSync(STORE_FILE)) {
                const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
                if (data.chats) store.chats = data.chats;
                if (data.contacts) store.contacts = data.contacts;
                if (data.messages) store.messages = data.messages;
                if (data.contacts) buildLidMapFromContacts(data.contacts);
            }
        } catch (e) {
            console.error('Store readFromFile error:', e.message);
        }
    },

    writeToFile() {
        try {
            // Skip write when disk is critically low
            const freeMB = getDiskFreeMB();
            if (freeMB < 5) {
                console.warn(`[Store] Skipping writeToFile — only ${freeMB}MB free`);
                return;
            }

            // Enforce message limits before writing
            store.cleanupMessages();

            // Prune chats to MAX_CHATS (keep newest by timestamp)
            let chats = store.chats;
            const chatIds = Object.keys(chats);
            if (chatIds.length > MAX_CHATS) {
                chatIds.sort((a, b) => (chats[b]?.conversationTimestamp || 0) - (chats[a]?.conversationTimestamp || 0));
                const pruned = {};
                for (const id of chatIds.slice(0, MAX_CHATS)) pruned[id] = chats[id];
                chats = pruned;
            }

            // Prune contacts to MAX_CONTACTS
            let contacts = store.contacts;
            const contactIds = Object.keys(contacts);
            if (contactIds.length > MAX_CONTACTS) {
                const pruned = {};
                for (const id of contactIds.slice(0, MAX_CONTACTS)) pruned[id] = contacts[id];
                contacts = pruned;
            }

            const data = { chats, contacts, messages: store.messages };
            const json = JSON.stringify(data);

            // Safety: if the JSON is still > 4MB, write nothing (very busy bot, skip)
            if (json.length > 4 * 1024 * 1024) {
                console.warn('[Store] store JSON > 4MB, writing minimal version');
                fs.writeFileSync(STORE_FILE, JSON.stringify({ chats: {}, contacts: {}, messages: {} }));
                return;
            }

            // Atomic write: temp file then rename
            const tmp = STORE_FILE + '.tmp';
            fs.writeFileSync(tmp, json);
            fs.renameSync(tmp, STORE_FILE);
        } catch (e) {
            console.error('Store writeToFile error:', e.message);
        }
    },

    cleanupMessages() {
        try {
            const chatIds = Object.keys(store.messages);
            let totalMsgs = 0;
            for (const jid of chatIds) {
                if (store.messages[jid].length > MAX_MESSAGES) {
                    store.messages[jid] = store.messages[jid].slice(-MAX_MESSAGES);
                }
                totalMsgs += store.messages[jid].length;
                if (store.messages[jid].length === 0) {
                    delete store.messages[jid];
                }
            }
            if (chatIds.length > 500) {
                const sorted = chatIds.sort((a, b) => {
                    const lastA = store.messages[a]?.[store.messages[a].length - 1]?.messageTimestamp || 0;
                    const lastB = store.messages[b]?.[store.messages[b].length - 1]?.messageTimestamp || 0;
                    return lastA - lastB;
                });
                const toRemove = sorted.slice(0, chatIds.length - 500);
                for (const jid of toRemove) {
                    delete store.messages[jid];
                }
            }
        } catch (e) {
            console.error('Store cleanup error:', e.message);
        }
    }
};

module.exports = store;
