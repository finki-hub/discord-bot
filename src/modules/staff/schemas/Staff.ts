import { z } from 'zod';

import { optionalText, optionalUrl } from '@/common/schemas/directus.js';

export const StaffSchema = z.object({
  active: z.boolean(),
  cabinet: optionalText,
  consultations: optionalUrl,
  courses: optionalUrl,
  email: z.email(),
  name: z.string(),
  position: z.string(),
  profile: optionalUrl,
  title: z.string(),
});

export type Staff = z.infer<typeof StaffSchema>;
