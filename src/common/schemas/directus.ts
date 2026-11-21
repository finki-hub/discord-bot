import { z } from 'zod';

// Directus answers an empty value as null and a number as a number; the
// bot's records leave an empty value out and show numbers as text.
export const optionalText = z
  .string()
  .nullish()
  .transform((value) => {
    const text = value?.trim();

    return text === '' ? undefined : (text ?? undefined);
  });

export const optionalUrl = optionalText.pipe(z.url().optional());

export const optionalNumberText = z
  .number()
  .nullish()
  .transform((value) => value?.toString());
