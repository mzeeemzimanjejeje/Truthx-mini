const os = require('os');
const fs = require('fs');

function detectContainerRAM() {
    if (process.env.WATCHDOG_RAM_MB) {
        return parseInt(process.env.WATCHDOG_RAM_MB, 10);
    }

    try {
        const v2 = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
        if (v2 !== 'max') {
            const mb = Math.floor(parseInt(v2, 10) / 1024 / 1024);
            if (mb > 0 && mb < 65536) return mb;
        }
    } catch (_) {}

    try {
        const v1 = fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim();
        const mb = Math.floor(parseInt(v1, 10) / 1024 / 1024);
        if (mb > 0 && mb < 65536) return mb;
    } catch (_) {}

    return Math.floor(os.totalmem() / 1024 / 1024);
}

const containerRAM = detectContainerRAM();

module.exports = { detectContainerRAM, containerRAM };
