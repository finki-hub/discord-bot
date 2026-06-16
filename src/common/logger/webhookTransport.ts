import type { LogEntry } from 'winston';

import { WebhookClient } from 'discord.js';
import TransportStream from 'winston-transport';

import { getConfig } from '@/configuration/bot/file.js';

export class WebhookTransport extends TransportStream {
  private readonly webhookClients = new Map<string, WebhookClient>();

  constructor() {
    super({
      level: 'warn',
    });
  }

  override log(info: LogEntry, callback: () => void): void {
    setImmediate(() => {
      this.emit('logged', info);
    });

    if (info.level === 'error' || info.level === 'warn') {
      const message = this.formatMessage(info);
      const guildId =
        'guildId' in info && typeof info['guildId'] === 'string'
          ? info['guildId']
          : null;
      void this.logToWebhook(message, guildId, callback);
      return;
    }

    callback();
  }

  // eslint-disable-next-line class-methods-use-this -- formatting a log entry does not require instance state
  private formatMessage(info: LogEntry): string {
    const timestamp =
      typeof info['timestamp'] === 'string'
        ? info['timestamp']
        : Temporal.Now.instant().toString().replace('T', ' ').slice(0, 19);
    const level = info.level;
    const message = info.message;
    const stack =
      'stack' in info && typeof info['stack'] === 'string'
        ? info['stack']
        : undefined;

    return `${timestamp} - ${level}: ${stack ?? message}`;
  }

  private async getWebhookClient(
    guildId: null | string,
  ): Promise<null | WebhookClient> {
    if (guildId === null) {
      return null;
    }

    const config = await getConfig();
    const webhookUrl = config?.[guildId]?.errorWebhook;

    if (webhookUrl === undefined) {
      return null;
    }

    if (this.webhookClients.has(webhookUrl)) {
      return this.webhookClients.get(webhookUrl) ?? null;
    }

    try {
      const webhookClient = new WebhookClient({ url: webhookUrl });
      this.webhookClients.set(webhookUrl, webhookClient);
      return webhookClient;
    } catch (error) {
      // eslint-disable-next-line no-console -- logger transport initialization must avoid recursive logging through the same transport
      console.error(
        `Failed initializing error webhook for guild ${guildId}:`,
        error,
      );
      return null;
    }
  }

  private async logToWebhook(
    message: string,
    guildId: null | string,
    callback: () => void,
  ): Promise<void> {
    try {
      await this.sendToWebhook(message, guildId);
    } finally {
      // eslint-disable-next-line n/callback-return -- winston transport callback is intentionally invoked from async cleanup
      callback();
    }
  }

  private async sendToWebhook(
    message: string,
    guildId: null | string,
  ): Promise<void> {
    const webhookClient = await this.getWebhookClient(guildId);

    if (webhookClient === null) {
      return;
    }

    try {
      await webhookClient.send({
        content: message,
      });
    } catch (error) {
      // eslint-disable-next-line no-console -- logger transport send failures must avoid recursive logging through the same transport
      console.error('Failed sending to error webhook:', error);
      for (const [url, cachedClient] of this.webhookClients) {
        if (cachedClient === webhookClient) {
          this.webhookClients.delete(url);
          break;
        }
      }
    }
  }
}
