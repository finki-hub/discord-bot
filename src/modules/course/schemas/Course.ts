import { z } from 'zod';

import {
  ACCREDITATION_FIELDS,
  ACCREDITATION_YEARS,
  type AccreditationField,
  accreditationKey,
  type AccreditationYear,
} from '../constants.js';

const buildAccreditationShape = () => {
  const shape: Record<string, z.ZodType> = {};

  for (const year of ACCREDITATION_YEARS) {
    for (const field of ACCREDITATION_FIELDS) {
      const key = accreditationKey(year, field);
      shape[key] = field === 'available' ? z.string() : z.string().optional();
    }
  }

  return shape;
};

export const CourseSchema = z
  .object({
    ...buildAccreditationShape(),
    assistants: z.string().optional(),
    name: z.string(),
    professors: z.string(),
  })
  .catchall(z.string())
  .transform((data) => {
    const transformed: Record<string, unknown> = { ...data };

    for (const year of ACCREDITATION_YEARS) {
      const key = accreditationKey(year, 'available');
      transformed[key] = data[key] === 'TRUE';
    }

    transformed['assistants'] = (data.assistants ?? '')
      .split(/\r?\n|\\n/u)
      .map((s) => s.trim())
      .filter((name) => name.length > 0);

    transformed['professors'] = data.professors
      .split(/\r?\n|\\n/u)
      .map((s) => s.trim())
      .filter((name) => name.length > 0);

    return transformed as Course;
  });

export type Course = AccreditationAvailability &
  AccreditationOptionalFields & {
    [key: string]: unknown;
    assistants: string[];
    name: string;
    professors: string[];
  };

type AccreditationAvailability = {
  [Y in AccreditationYear as `${Y}-available`]: boolean;
};

type AccreditationOptionalFields = {
  [Y in AccreditationYear as `${Y}-${Exclude<AccreditationField, 'available'>}`]?: string;
};
