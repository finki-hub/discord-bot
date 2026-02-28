import { z } from 'zod';

export const StaffSchema = z
  .object({
    active: z.union([z.string(), z.number()]),
    cabinet: z.string().optional(),
    consultations: z.url().optional(),
    courses: z.url().optional(),
    email: z.email(),
    name: z.string(),
    position: z.string(),
    profile: z.url().optional(),
    title: z.string(),
  })
  .transform((data) => ({
    ...data,
    active: data.active === 'TRUE' || data.active === '1' || data.active === 1,
  }));

export type Staff = z.infer<typeof StaffSchema>;
