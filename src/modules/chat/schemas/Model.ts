/* eslint-disable camelcase -- catalog fields mirror the backend wire contract */
import { z } from 'zod';

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

// The Discord bot uses only the free/sponsored pool; BYOK models belong to the
// web app. A catalog without availability metadata is treated as free.
export const isFreeModelSelectable = (
  model: Pick<ModelDescriptor, 'availability'>,
): boolean =>
  model.availability === undefined ||
  model.availability === 'both' ||
  model.availability === 'sponsored';
