/* eslint-disable camelcase -- API payload fields intentionally use snake_case before schema transformation */

import { z } from 'zod';

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
    createdAt: new Date(data.created_at),
    description: data.description,
    id: data.id,
    name: data.name,
    updatedAt: new Date(data.updated_at),
    url: data.url,
    userId: data.user_id,
  }));

export const LinksSchema = z.array(LinkSchema);

export type Link = z.infer<typeof LinkSchema>;
