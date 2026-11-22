/* eslint-disable camelcase -- API payload fields intentionally use snake_case before schema transformation */

import { z } from 'zod';

export const ConversationTurnSchema = z.object({
  content: z.string().max(2_000),
  role: z.enum(['assistant', 'user']),
});

export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;

const DiscordContextSchema = z.object({
  channelId: z.string().optional(),
  guildId: z.string().optional(),
  messageId: z.string().optional(),
});

export type DiscordContext = z.infer<typeof DiscordContextSchema>;

export const SendPromptOptionsSchema = z
  .object({
    discordContext: DiscordContextSchema.optional(),
    embeddingsModel: z.string().optional(),
    history: z.array(ConversationTurnSchema).max(9).optional(),
    inferenceModel: z.string().optional(),
    prompt: z.string().min(1, 'Query must not be empty').max(2_000),
    reasoning: z.boolean().optional(),
    userId: z.uuid(),
  })
  .transform((data) => ({
    ...(data.discordContext !== undefined && {
      discord_context: {
        channel_id: data.discordContext.channelId,
        guild_id: data.discordContext.guildId,
        message_id: data.discordContext.messageId,
      },
    }),
    embeddings_model: data.embeddingsModel,
    inference_model: data.inferenceModel,
    interface: 'discord' as const,
    messages: [
      ...(data.history ?? []).slice(-9),
      { content: data.prompt, role: 'user' as const },
    ].slice(-10),
    reasoning: data.reasoning,
    user_id: data.userId,
  }));

export type SendPromptOptions = z.infer<typeof SendPromptOptionsSchema>;

export const FEEDBACK_REASONS = [
  'wrong',
  'outdated',
  'incomplete',
  'off_topic',
  'other',
] as const;

export const FeedbackOptionsSchema = z
  .object({
    channelId: z.string().optional(),
    client: z.enum(['discord', 'web']),
    clientRef: z.string().optional(),
    comment: z.string().trim().max(1_000).optional(),
    feedbackType: z.enum(['like', 'dislike']),
    guildId: z.string().optional(),
    reason: z.enum(FEEDBACK_REASONS).optional(),
    responseId: z.string(),
    userId: z.string(),
  })
  .transform((data) => ({
    channel_id: data.channelId,
    client: data.client,
    client_ref: data.clientRef,
    comment: data.comment === '' ? undefined : data.comment,
    feedback_type: data.feedbackType,
    guild_id: data.guildId,
    reason: data.reason,
    response_id: data.responseId,
    user_id: data.userId,
  }));

export type FeedbackOptions = z.infer<typeof FeedbackOptionsSchema>;
