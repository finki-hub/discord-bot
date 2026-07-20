import { z } from 'zod';

import { ChannelSchema } from '@/common/schemas/Channel.js';
import { RoleSchema } from '@/common/schemas/Role.js';
import { TicketSchema } from '@/modules/ticket/schemas/Ticket.js';

const ModelsSchema = z.object({
  embeddings: z.string().optional(),
  inference: z.string().optional(),
});

export const RequiredBotConfigSchema = z.object({
  channels: z.record(ChannelSchema, z.string().optional()).optional(),
  crossposting: z
    .object({
      channels: z.array(z.string()).optional(),
      enabled: z.boolean().optional(),
    })
    .optional(),
  errorWebhook: z.url().optional(),
  feedback: z
    .object({
      enabled: z.boolean().optional(),
    })
    .optional(),
  models: ModelsSchema.optional(),
  roles: z.record(RoleSchema, z.string()).optional(),
  ticketing: z
    .object({
      enabled: z.boolean().optional(),
      tickets: z.array(TicketSchema).optional(),
    })
    .optional(),
});

export const BotConfigSchema = RequiredBotConfigSchema.optional();
export type BotConfig = z.infer<typeof BotConfigSchema>;

export const MultiGuildConfigSchema = z.record(z.string(), BotConfigSchema);
export type MultiGuildConfig = z.infer<typeof MultiGuildConfigSchema>;

export const BotConfigKeysSchema = RequiredBotConfigSchema.keyof();
export type BotConfigKeys = keyof NonNullable<BotConfig>;

export const FullyRequiredBotConfigSchema = RequiredBotConfigSchema.required();
export type FullyRequiredBotConfig = z.infer<
  typeof FullyRequiredBotConfigSchema
>;
