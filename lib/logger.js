const chalk = require('chalk');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

const _configuredLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
const _threshold = LEVELS[_configuredLevel] ?? LEVELS.info;

const _ts = () => new Date().toISOString().slice(11, 23);

const COLORS = {
    debug: chalk.gray,
    info:  chalk.cyan,
    warn:  chalk.yellow,
    error: chalk.red,
};

function _log(level, tag, msg, ...args) {
    if (LEVELS[level] < _threshold) return;
    const color = COLORS[level] || chalk.white;
    const prefix = `${chalk.gray(_ts())} ${color(`[${level.toUpperCase()}]`)}`;
    const tagStr = tag ? ` ${chalk.white(`[${tag}]`)}` : '';
    if (args.length > 0) {
        console.log(`${prefix}${tagStr} ${msg}`, ...args);
    } else {
        console.log(`${prefix}${tagStr} ${msg}`);
    }
}

const logger = {
    debug: (tag, msg, ...a) => _log('debug', tag, msg, ...a),
    info:  (tag, msg, ...a) => _log('info',  tag, msg, ...a),
    warn:  (tag, msg, ...a) => _log('warn',  tag, msg, ...a),
    error: (tag, msg, ...a) => _log('error', tag, msg, ...a),

    child(defaultTag) {
        return {
            debug: (msg, ...a) => _log('debug', defaultTag, msg, ...a),
            info:  (msg, ...a) => _log('info',  defaultTag, msg, ...a),
            warn:  (msg, ...a) => _log('warn',  defaultTag, msg, ...a),
            error: (msg, ...a) => _log('error', defaultTag, msg, ...a),
        };
    },

    get level() { return _configuredLevel; },
    isDebug() { return _threshold <= LEVELS.debug; },
};

module.exports = logger;
