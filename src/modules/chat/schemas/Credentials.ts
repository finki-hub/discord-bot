/* eslint-disable camelcase, unicorn/custom-error-definition -- API payload fields intentionally use snake_case */
import { z } from 'zod';

export const CredentialProviderSchema = z.enum([
  'anthropic',
  'google',
  'ollama',
  'openai',
]);

export type CredentialProvider = z.infer<typeof CredentialProviderSchema>;

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

export const CredentialPublicSchema = z.object({
  base_url: z.string().nullable().optional(),
  has_api_key: z.boolean(),
  provider: CredentialProviderSchema,
});

export type CredentialPublic = z.infer<typeof CredentialPublicSchema>;

export const CredentialUpsertSchema = z.object({
  api_key: z.string().min(1),
  base_url: z.url().optional(),
  provider: CredentialProviderSchema,
});

export type CredentialUpsert = z.infer<typeof CredentialUpsertSchema>;

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
