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
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: maxMemRestart,
            max_restarts: 50,
            min_uptime: '30s',
            restart_delay: 5000,
            exp_backoff_restart_delay: 1000,
            kill_timeout: 10000,
            env: {
                NODE_ENV: 'production',
                LOG_LEVEL: 'info',
            },
            env_development: {
                NODE_ENV: 'development',
                LOG_LEVEL: 'debug',
            },
            error_file: './logs/pm2-error.log',
            out_file: './logs/pm2-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            merge_logs: true,
        },
    ],
};
