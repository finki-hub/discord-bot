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

const formatPlain = (entries: StaffEntry[]): string =>
  entries.map(({ name }) => name).join('\n');

export const linkStaff = (names: string[]): string => {
  if (names.length === 0) {
    return labels.none;
  }

  const active = resolveStaff(names).filter((entry) => entry.active);

  if (active.length === 0) {
    return labels.none;
  }

  const linked = formatEntries(active);

  return linked.length < 1_000 ? linked : formatPlain(active);
};

export const getRetiredStaff = (...nameGroups: string[][]): string => {
  const retired = nameGroups
    .flatMap((names) => resolveStaff(names))
    .filter((entry) => !entry.active);

  if (retired.length === 0) {
    return '';
  }

  const linked = formatEntries(retired);

  return linked.length < 1_000
    ? strikethrough(linked)
    : strikethrough(formatPlain(retired));
};

const ParticipantSchema = z
  .tuple([z.string().regex(/^\d{4}\/\d{4}$/u), z.coerce.number().nonnegative()])
  .transform(([year, count]) => ({ count, year }));

type Participant = z.infer<typeof ParticipantSchema>;

export const extractParticipants = (course: Course): Participant[] =>
  Object.entries(course)
    .map((entry) => ParticipantSchema.safeParse(entry))
    .filter((result) => result.success)
    .map((result) => result.data)
    .sort((a, b) => b.year.localeCompare(a.year));
