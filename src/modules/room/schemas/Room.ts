import { z } from 'zod';

import {
  optionalNumberText,
  optionalText,
  optionalUrl,
} from '@/common/schemas/directus.js';

export const RoomSchema = z.object({
  capacity: optionalNumberText,
  description: optionalText,
  floor: optionalNumberText,
  location: z.string(),
  mrbs: optionalUrl,
  name: z.string(),
  type: z.string(),
});

export type Room = z.infer<typeof RoomSchema>;
