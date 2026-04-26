/* eslint-disable @typescript-eslint/restrict-template-expressions -- winston formatter values are stringified for logging output */

import { createLogger, format, transports } from 'winston';

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
    new transports.File({
      filename: 'logs/bot.log',
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
      options: {
        flags: 'w',
      },
    }),
    new WebhookTransport(),
  ],
});
