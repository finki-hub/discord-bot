/* eslint-disable camelcase -- catalog fields mirror the backend wire contract */
import { z } from 'zod';

import { labels } from '@/translations/labels.js';

export const ModelAvailabilitySchema = z.enum([
  'both',
  'byok',
  'sponsored',
  'unavailable',
]);

export type ModelAvailability = z.infer<typeof ModelAvailabilitySchema>;

export const SponsoredQuotaSchema = z
  .object({
    limit: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    resets_at: z.string().min(1),
  })
  .refine(({ limit, remaining }) => remaining <= limit);

export type SponsoredQuota = z.infer<typeof SponsoredQuotaSchema>;

export const ModelDescriptorSchema = z.object({
  availability: ModelAvailabilitySchema.optional(),
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  sponsored_quota: SponsoredQuotaSchema.nullable().optional(),
});

export type ModelDescriptor = z.infer<typeof ModelDescriptorSchema>;

export const ModelCatalogResponseSchema = z.object({
  models: z.array(ModelDescriptorSchema),
  source: z.string(),
  version: z.number(),
});

export type ModelCatalogResponse = z.infer<typeof ModelCatalogResponseSchema>;

export const MAX_DISCORD_CHOICE_NAME_LENGTH = 100;

export const isModelSelectable = (
  model: Pick<ModelDescriptor, 'availability'>,
): boolean => model.availability !== 'unavailable';

export const formatModelLabel = (model: ModelDescriptor): string => {
  const baseLabel = `${model.name} (${model.provider})`;
  const hasSponsoredAccess =
    model.availability === 'sponsored' || model.availability === 'both';
  if (!hasSponsoredAccess) {
    return baseLabel.slice(0, MAX_DISCORD_CHOICE_NAME_LENGTH);
  }

  const quota = model.sponsored_quota;
  const accessLabel =
    quota === null || quota === undefined
      ? labels.free
      : `${labels.free} (${labels.quotaRemaining}: ${quota.remaining}/${quota.limit})`;
  const suffix = ` — ${accessLabel}`;
  const baseLength = Math.max(
    0,
    MAX_DISCORD_CHOICE_NAME_LENGTH - suffix.length,
  );

  return `${baseLabel.slice(0, baseLength)}${suffix}`;
};

export const EMBEDDING_MODELS = [
  'BAAI/bge-m3',
  'gemini-embedding-001',
  'text-embedding-3-large',
] as const;

export const INFERENCE_MODELS = [
  'claude-haiku-4-5',
  'claude-opus-4-8',
  'claude-sonnet-5',
  'gemini-3.1-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-3.5-flash',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
  'gpt-5.4',
  'gpt-5.5',
  'gpt-5.6-luna',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'qwen3:14b-q4_K_M',
  'qwen3:30b-a3b-instruct-2507-q4_K_M',
  'qwen3:30b-a3b-thinking-2507-q4_K_M',
] as const;
