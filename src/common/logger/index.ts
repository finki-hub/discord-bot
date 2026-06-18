/* eslint-disable @typescript-eslint/restrict-template-expressions -- winston formatter values are stringified for logging output */

import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

import { WebhookTransport } from './webhookTransport.js';

export const logger = createLogger({
  transports: [
    new transports.Console({
      format: format.combine(
        format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss',
        }),
        format.errors({
          stack: true,
        }),
        format.colorize({
          colors: {
            debug: 'gray',
            error: 'red',
            http: 'blue',
            info: 'green',
            silly: 'magenta',
            verbose: 'cyan',
            warn: 'yellow',
          },
        }),
        format.printf(
          ({ level, message, timestamp }) =>
            `${timestamp} - ${level}: ${message}`,
        ),
      ),
      handleExceptions: true,
      level: 'info',
    }),
    new DailyRotateFile({
      datePattern: 'YYYY-MM-DD',
      filename: 'logs/bot-%DATE%.log',
      format: format.combine(
        format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss',
        }),
        format.errors({
          stack: true,
        }),
        format.printf(
          ({ level, message, timestamp }) =>
            `${timestamp} - ${level}: ${message}`,
        ),
      ),
      handleExceptions: true,
      level: 'debug',
      maxFiles: '30d',
      maxSize: '20m',
    }),
    new WebhookTransport(),
  ],
});
