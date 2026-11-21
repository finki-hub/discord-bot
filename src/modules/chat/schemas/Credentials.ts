/* eslint-disable camelcase, unicorn/custom-error-definition -- API payload fields intentionally use snake_case */
import { z } from 'zod';

export const ChatUserSchema = z.object({
  id: z.uuid(),
  provider: z.string(),
  provider_subject: z.string(),
});

export type ChatUser = z.infer<typeof ChatUserSchema>;

export const ChatUserUpsertSchema = z.object({
  avatar_url: z.string().optional(),
  name: z.string().optional(),
  provider: z.string().min(1),
  provider_subject: z.string().min(1),
});

export type ChatUserUpsert = z.infer<typeof ChatUserUpsertSchema>;

export const ChatHistoryDeletedSchema = z.object({
  deleted_conversations: z.number().int().nonnegative(),
  deleted_feedback: z.number().int().nonnegative(),
});

export type ChatHistoryDeleted = z.infer<typeof ChatHistoryDeletedSchema>;

export const SafeErrorDetailSchema = z.object({
  detail: z.string().optional(),
});

export type SafeErrorDetail = z.infer<typeof SafeErrorDetailSchema>;

export class ChatApiError extends Error {
  readonly detail: string;
  override readonly name = 'ChatApiError';
  readonly status: number;

  constructor(status: number, detail: string) {
    super(`Chat API error ${status}: ${detail}`);
    this.status = status;
    this.detail = detail;
  }
}
