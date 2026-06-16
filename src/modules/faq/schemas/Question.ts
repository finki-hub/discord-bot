/* eslint-disable camelcase -- API payload fields intentionally use snake_case before schema transformation */

import { z } from 'zod';

import { parseInstant } from '@/common/utils/temporal.js';

export const QuestionSchema = z
  .object({
    content: z.string(),
    created_at: z.string(),
    distance: z.number().nullish(),
    id: z.string(),
    links: z.record(z.string(), z.string()).nullable(),
    name: z.string(),
    updated_at: z.string(),
    user_id: z.string().nullable(),
  })
  .transform((data) => ({
    content: data.content,
    createdAt: parseInstant(data.created_at),
    distance: data.distance ?? undefined,
    id: data.id,
    links: data.links,
    name: data.name,
    updatedAt: parseInstant(data.updated_at),
    userId: data.user_id,
  }));

export const QuestionsSchema = z.array(QuestionSchema);

export type Question = z.infer<typeof QuestionSchema>;
