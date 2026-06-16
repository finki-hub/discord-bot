import { hyperlink, strikethrough } from 'discord.js';
import { z } from 'zod';

import { type Staff } from '@/modules/staff/schemas/Staff.js';
import { getStaff } from '@/modules/staff/utils/data.js';
import { labels } from '@/translations/labels.js';

import { type Course } from '../schemas/Course.js';

const findStaffMember = (name: string): Staff | undefined =>
  getStaff().find((staff) => name.includes(staff.name));

const formatStaffMember = (name: string, profileUrl?: string): string =>
  profileUrl ? hyperlink(name, profileUrl) : name;

type StaffEntry = {
  active: boolean;
  name: string;
  profile: string | undefined;
};

const resolveStaff = (names: string[]): StaffEntry[] =>
  names.map((name) => {
    const staff = findStaffMember(name);
    return {
      active: staff?.active ?? true,
      name,
      profile: staff?.profile,
    };
  });

const formatEntries = (entries: StaffEntry[]): string =>
  entries
    .map(({ name, profile }) => formatStaffMember(name, profile))
    .join('\n');

const MAX_CONTENT_LENGTH = 3_500;

const chunkStaffEntries = (
  entries: StaffEntry[],
  formatter: (entries: StaffEntry[]) => string,
): string[] => {
  const chunks: string[] = [];
  let currentChunk: StaffEntry[] = [];

  for (const entry of entries) {
    currentChunk.push(entry);

    if (formatter(currentChunk).length > MAX_CONTENT_LENGTH) {
      currentChunk.pop();

      if (currentChunk.length > 0) {
        chunks.push(formatter(currentChunk));
      }

      currentChunk = [entry];
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(formatter(currentChunk));
  }

  return chunks;
};

export const linkStaff = (names: string[]): string[] => {
  if (names.length === 0) {
    return [labels.none];
  }

  const active = resolveStaff(names).filter((entry) => entry.active);

  if (active.length === 0) {
    return [labels.none];
  }

  return chunkStaffEntries(active, formatEntries);
};

export const getRetiredStaff = (...nameGroups: string[][]): string[] => {
  const retired = nameGroups
    .flatMap((names) => resolveStaff(names))
    .filter((entry) => !entry.active);

  if (retired.length === 0) {
    return [];
  }

  return chunkStaffEntries(retired, (entries) =>
    strikethrough(formatEntries(entries)),
  );
};

const ParticipantSchema = z
  .tuple([z.string().regex(/^\d{4}\/\d{4}$/u), z.coerce.number().nonnegative()])
  .transform(([year, count]) => ({ count, year }));

type Participant = z.infer<typeof ParticipantSchema>;

const yearCollator = new Intl.Collator();

export const extractParticipants = (course: Course): Participant[] =>
  Object.entries(course)
    .map((entry) => ParticipantSchema.safeParse(entry))
    .filter((result) => result.success)
    .map((result) => result.data)
    .sort((a, b) => yearCollator.compare(b.year, a.year));
