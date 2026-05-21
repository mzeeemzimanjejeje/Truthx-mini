const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../data/groupTracker.json');

function _load() {
    try {
        if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch (_) {}
    return { groups: {} };
}

function _save(data) {
    try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
    } catch (_) {}
}

function trackGroup(jid, name) {
    if (!jid || !jid.endsWith('@g.us')) return;
    const data = _load();
    data.groups[jid] = { name: name || data.groups[jid]?.name || '', joined: data.groups[jid]?.joined || Date.now(), lastSeen: Date.now() };
    _save(data);
}

function untrackGroup(jid) {
    if (!jid) return;
    const data = _load();
    delete data.groups[jid];
    _save(data);
}

function getGroupCount() {
    return Object.keys(_load().groups).length;
}

function getGroups() {
    return _load().groups;
}

function syncFromList(groupList) {
    if (!Array.isArray(groupList)) return;
    const data = _load();
    for (const g of groupList) {
        if (!g.id || !g.id.endsWith('@g.us')) continue;
        data.groups[g.id] = {
            name:     g.subject || data.groups[g.id]?.name || '',
            joined:   data.groups[g.id]?.joined || Date.now(),
            lastSeen: Date.now()
        };
    }
    _save(data);
}

module.exports = { trackGroup, untrackGroup, getGroupCount, getGroups, syncFromList };
