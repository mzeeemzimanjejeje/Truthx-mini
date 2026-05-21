const fs = require('fs');
const path = require('path');

// ─── Disk space helper ────────────────────────────────────────────────────────
// Returns free bytes on the filesystem containing cwd, or Infinity if unknown
function getFreeBytesSync() {
    try {
        const { execSync } = require('child_process');
        // df -k prints 1024-byte blocks; 4th column is Available
        const out = execSync(`df -k "${process.cwd()}"`, { encoding: 'utf8', stdio: 'pipe' });
        const line = out.split('\n')[1];
        const free = parseInt((line || '').trim().split(/\s+/)[3], 10);
        return isNaN(free) ? Infinity : free * 1024;
    } catch (_) {
        return Infinity;
    }
}

// True when less than 8 MB free (critically low for a 25 MiB allocation)
function diskIsCritical() {
    return getFreeBytesSync() < 8 * 1024 * 1024;
}

// ─── SQLite WAL checkpoint ────────────────────────────────────────────────────
// Checkpointing collapses the WAL file back into the main DB, freeing disk.
function checkpointSQLite() {
    try {
        const Database = require('better-sqlite3');
        const dataDir = path.join(__dirname, '..', 'data');
        const dbs = fs.existsSync(dataDir)
            ? fs.readdirSync(dataDir).filter(f => f.endsWith('.db'))
            : [];
        for (const dbFile of dbs) {
            try {
                const db = new Database(path.join(dataDir, dbFile), { readonly: false });
                db.pragma('wal_checkpoint(TRUNCATE)');
                db.pragma('vacuum');
                db.close();
            } catch (_) {}
        }
    } catch (_) {}
}

// ─── Directory cleaner ────────────────────────────────────────────────────────
function clearDirectory(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) {
            return { success: false, message: `Directory does not exist: ${path.basename(dirPath)}`, count: 0 };
        }
        const files = fs.readdirSync(dirPath);
        let deletedCount = 0;
        for (const file of files) {
            try {
                const filePath = path.join(dirPath, file);
                const stat = fs.lstatSync(filePath);
                if (stat.isDirectory()) {
                    fs.rmSync(filePath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(filePath);
                }
                deletedCount++;
            } catch (err) {
                console.error(`Error deleting file ${file}:`, err.message);
            }
        }
        return { success: true, message: `Cleared ${deletedCount} files in ${path.basename(dirPath)}`, count: deletedCount };
    } catch (error) {
        console.error('Error in clearDirectory:', error);
        return { success: false, message: `Failed to clear ${path.basename(dirPath)}`, count: 0, error: error.message };
    }
}

// ─── Trim message_backup.json if too large ───────────────────────────────────
function trimMessageBackup() {
    try {
        const backupFile = path.join(__dirname, '..', 'message_backup.json');
        if (!fs.existsSync(backupFile)) return;
        const stat = fs.statSync(backupFile);
        // If over 2 MB, wipe it — it's just a soft anti-delete cache
        if (stat.size > 2 * 1024 * 1024) {
            fs.writeFileSync(backupFile, '{}');
            console.log('[AutoClear] Trimmed oversized message_backup.json');
        }
    } catch (_) {}
}

// ─── Main cleanup routine ─────────────────────────────────────────────────────
async function clearTmpDirectory() {
    const tmpDir  = path.join(process.cwd(), 'tmp');
    const tempDir = path.join(process.cwd(), 'temp');
    const results = [clearDirectory(tmpDir), clearDirectory(tempDir)];

    // Checkpoint SQLite WAL files every cleanup cycle
    checkpointSQLite();

    // Trim message backup if it has grown large
    trimMessageBackup();

    const totalDeleted = results.reduce((sum, r) => sum + (r.count || 0), 0);
    const message = results.filter(r => r.success).map(r => r.message).join(' | ') || 'No tmp files found';
    return { success: true, message, count: totalDeleted };
}

// ─── Manual command ───────────────────────────────────────────────────────────
async function clearTmpCommand(sock, chatId, msg, senderIsSudo) {
    try {
        const isOwner = msg.key.fromMe || senderIsSudo;
        if (!isOwner) {
            await sock.sendMessage(chatId, { text: '❌ This command is only available for the owner!' });
            return;
        }

        const freeBeforeMB = (getFreeBytesSync() / 1024 / 1024).toFixed(1);
        const result = await clearTmpDirectory();
        const freeAfterMB  = (getFreeBytesSync() / 1024 / 1024).toFixed(1);

        await sock.sendMessage(chatId, {
            text: `✅ ${result.message}\n\n💾 *Disk free:* ${freeBeforeMB} MB → ${freeAfterMB} MB`
        }, { quoted: msg });

    } catch (error) {
        console.error('Error in cleartmp command:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to clear temporary files!' });
    }
}

// ─── Auto-clear scheduler ─────────────────────────────────────────────────────
// Run every 30 minutes so media files never pile up for more than 30 min.
// On disk pressure (< 8 MB free) run immediately and every 5 minutes.
function startAutoClear() {
    // Run immediately on startup
    clearTmpDirectory().catch(() => {});

    // Standard 30-minute cycle
    setInterval(() => {
        clearTmpDirectory().catch(() => {});
    }, 30 * 60 * 1000);

    // Emergency 5-minute cycle when disk is critically low
    setInterval(() => {
        if (diskIsCritical()) {
            console.log('[AutoClear] ⚠️ Disk critically low — running emergency cleanup');
            clearTmpDirectory().catch(() => {});
        }
    }, 5 * 60 * 1000);
}

startAutoClear();

module.exports = clearTmpCommand;
module.exports.clearTmpDirectory = clearTmpDirectory;
module.exports.diskIsCritical = diskIsCritical;
module.exports.getFreeBytesSync = getFreeBytesSync;
