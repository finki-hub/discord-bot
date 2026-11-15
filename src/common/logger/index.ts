import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

import { formatLogLine } from './format.js';
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
        format.printf(formatLogLine),
      ),
      handleExceptions: false,
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
        format.printf(formatLogLine),
      ),
      handleExceptions: false,
      level: 'debug',
      maxFiles: '30d',
      maxSize: '20m',
    }),
    new WebhookTransport(),
  ],
});
