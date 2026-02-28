export const ACCREDITATION_YEARS = ['2023', '2018'] as const;

export type AccreditationYear = (typeof ACCREDITATION_YEARS)[number];

export const ACCREDITATION_FIELDS = [
  'available',
  'code',
  'level',
  'name',
  'prerequisite',
  'semester',
] as const;

export type AccreditationField = (typeof ACCREDITATION_FIELDS)[number];

export const accreditationKey = (
  year: AccreditationYear,
  field: AccreditationField,
) => `${year}-${field}` as const;
