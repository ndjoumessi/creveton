'use strict';

const env = require('./env');

/**
 * Logger minimaliste structuré (JSON en prod, lisible en dev).
 * Volontairement sans dépendance externe — remplaçable par pino/winston plus tard.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const activeLevel = env.isProd ? LEVELS.info : LEVELS.debug;

function emit(level, message, meta) {
  if (LEVELS[level] > activeLevel) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(meta && typeof meta === 'object' ? meta : meta !== undefined ? { meta } : {}),
  };
  const line = env.isProd ? JSON.stringify(entry) : `[${entry.ts}] ${level.toUpperCase()} ${message}`;
  const stream = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (env.isProd) {
    stream(line);
  } else {
    stream(line, meta && Object.keys(meta).length ? meta : '');
  }
}

module.exports = {
  error: (msg, meta) => emit('error', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  debug: (msg, meta) => emit('debug', msg, meta),
};
