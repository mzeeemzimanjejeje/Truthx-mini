const fs = require('fs');
const path = require('path');

function saveJson(filePath, data, pretty) {
    const content = pretty === false
        ? JSON.stringify(data)
        : JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, content, 'utf8');
    try { require('./persistentStore').mirrorFile(filePath); } catch (_) {}
    try { require('./pgDataStore').mirrorFile(filePath); } catch (_) {}
}

module.exports = { saveJson };
