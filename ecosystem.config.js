const { containerRAM } = require('./lib/systemRAM');

const totalRamMB = containerRAM;
const heapMB = Math.min(8192, Math.max(100, Math.floor(totalRamMB * 0.7)));
const maxMemRestart = `${Math.floor(totalRamMB * 0.85)}M`;

module.exports = {
    apps: [
        {
            name: 'TRUTH-MD',
            script: 'index.js',
            node_args: `--max-old-space-size=${heapMB} --expose-gc --optimize-for-size`,
            instances: 1,          // MUST be 1 — multiple instances = session conflicts
            autorestart: true,
            watch: false,
            max_memory_restart: maxMemRestart,
            max_restarts: 15,      // halt after 15 quick crashes (prevents infinite loop)
            min_uptime: '60s',     // crash within 60s = bad restart, counts against max_restarts
            restart_delay: 8000,   // wait 8s before restarting (gives WA time to release session)
            exp_backoff_restart_delay: 100,
            kill_timeout: 15000,   // 15s for graceful shutdown before SIGKILL
            listen_timeout: 10000,
            env: {
                NODE_ENV: 'production',
                LOG_LEVEL: 'info',
                PORT: '5000',
            },
            env_development: {
                NODE_ENV: 'development',
                LOG_LEVEL: 'debug',
                PORT: '5000',
            },
            error_file: './logs/pm2-error.log',
            out_file: './logs/pm2-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true,
            // Prevent PM2 from running more than one instance of this app
            // under any cluster/fork mode — session sharing would break the bot.
            exec_mode: 'fork',
        },
    ],
};
