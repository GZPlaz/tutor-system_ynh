/**
 * Structured JSON logging (pino). In production the logs go to stdout and are
 * captured by systemd/journald:  journalctl -u mindaccel-api -f
 */
import { pino } from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  // Never let secrets reach the logs.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      '*.passwordHash',
      '*.token',
    ],
    censor: '[redacted]',
  },
  ...(env.isProd ? {} : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
});
