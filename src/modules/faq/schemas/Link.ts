/* eslint-disable camelcase -- API payload fields intentionally use snake_case before schema transformation */

import { z } from 'zod';

import { parseInstant } from '@/common/utils/temporal.js';

export const LinkSchema = z
  .object({
    created_at: z.string(),
    description: z.string().nullable(),
    id: z.string(),
    name: z.string(),
    updated_at: z.string(),
    url: z.string(),
    user_id: z.string().nullable(),
  })
  .transform((data) => ({
    createdAt: parseInstant(data.created_at),
    description: data.description,
    id: data.id,
    name: data.name,
    updatedAt: parseInstant(data.updated_at),
    url: data.url,
    userId: data.user_id,
  }));

export const LinksSchema = z.array(LinkSchema);

export type Link = z.infer<typeof LinkSchema>;
