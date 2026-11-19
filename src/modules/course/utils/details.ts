/* eslint-disable camelcase -- Directus field names use snake_case */

import { z } from 'zod';

import { logger } from '@/common/logger/index.js';
import { getDirectusUrl } from '@/configuration/environment.js';

// What the course card shows beside courses.json, read from FINKI Hub's
// Directus: the course's Discord channels and the courses whose
// prerequisites name it. Each read is bounded; a failure leaves both out.

const DETAILS_TIMEOUT_MS = 5_000;
const ENTRIES_TTL_MS = 60 * 60 * 1_000;

const CourseRows = z.object({
  data: z.array(
    z.object({
      curricula: z
        .array(
          z.object({
            entry: z.object({ name: z.string().nullish() }).nullish(),
          }),
        )
        .nullish(),
      discord_channels: z
        .array(
          z.object({
            discord_channel: z.object({ channel: z.string() }).nullish(),
          }),
        )
        .nullish(),
    }),
  ),
});

const EntrySchema = z.object({
  course_links: z
    .array(z.object({ course: z.object({ name: z.string() }).nullish() }))
    .nullish(),
  generation: z
    .object({ code: z.string(), published: z.boolean().nullish() })
    .nullish(),
  name: z.string().nullish(),
  prerequisites: z.string().nullish(),
});

const EntryRows = z.object({ data: z.array(EntrySchema) });

export type CourseDetails = {
  channels: string[];
  unlocks: string[];
};

export type CurriculumEntry = z.infer<typeof EntrySchema>;

const WORD_REGEX = /[\p{Letter}\p{Number}]+/gu;

// A name as its lowercase words: "Компјутерски  мрежи" and "компјутерски
// мрежи" are the same name.
export const nameKey = (text: string) =>
  (text.toLocaleLowerCase('mk').match(WORD_REGEX) ?? []).join(' ');

// The known names, as word lists grouped by their first word, longest first.
const indexNames = (names: Iterable<string>) => {
  const keys = new Set(Array.from(names, (name) => nameKey(name)));
  const byFirstWord = new Map<string, string[][]>();

  for (const key of keys) {
    const nameWords = key.split(' ').filter((word) => word.length > 0);
    const [first] = nameWords;

    if (first !== undefined) {
      byFirstWord.set(first, [...(byFirstWord.get(first) ?? []), nameWords]);
    }
  }

  for (const candidates of byFirstWord.values()) {
    candidates.sort((left, right) => right.length - left.length);
  }

  return byFirstWord;
};

const startsWithWords = (
  textWords: readonly string[],
  start: number,
  candidate: readonly string[],
) => candidate.every((word, offset) => textWords[start + offset] === word);

// The known course names a prerequisite text names. The text joins names
// with "и" and "или", which are also inside names ("Компјутерски мрежи и
// безбедност"), so each name is the longest known one at its word.
export const namedCourses = (text: string, names: Iterable<string>) => {
  const byFirstWord = indexNames(names);
  const textWords = nameKey(text).split(' ');
  const found = new Set<string>();
  let position = 0;

  while (position < textWords.length) {
    const start = position;
    const candidates = byFirstWord.get(textWords[start] ?? '') ?? [];
    const match = candidates.find((candidate) =>
      startsWithWords(textWords, start, candidate),
    );

    if (match === undefined) {
      position = start + 1;
    } else {
      found.add(match.join(' '));
      position = start + match.length;
    }
  }

  return found;
};

const linkedName = (entry: CurriculumEntry) =>
  entry.course_links?.find((link) => link.course)?.course?.name ??
  entry.name ??
  null;

const namesTarget = (
  entry: CurriculumEntry,
  known: readonly string[],
  targets: ReadonlySet<string>,
) => !namedCourses(entry.prerequisites ?? '', known).isDisjointFrom(targets);

// The courses of the published accreditations whose prerequisites name one
// of these names, newest accreditation first, each once.
export const coursesUnlockedBy = (
  courseNames: readonly string[],
  entries: readonly CurriculumEntry[],
) => {
  const targets = new Set(courseNames.map((name) => nameKey(name)));
  const known = entries.flatMap((entry) => [
    entry.name ?? '',
    ...(entry.course_links ?? []).map((link) => link.course?.name ?? ''),
  ]);
  const unlocked = entries
    .filter(
      (entry) =>
        entry.generation?.published === true &&
        (entry.prerequisites ?? '').length > 0 &&
        !targets.has(nameKey(entry.name ?? '')) &&
        namesTarget(entry, known, targets),
    )
    .toSorted(
      (left, right) =>
        Number(right.generation?.code ?? 0) -
        Number(left.generation?.code ?? 0),
    );

  const names: string[] = [];

  for (const entry of unlocked) {
    const name = linkedName(entry);

    if (name !== null && !names.includes(name) && !targets.has(nameKey(name))) {
      names.push(name);
    }
  }

  return names;
};

// A Directus query string, every value encoded.
const queryString = (params: Readonly<Record<string, string>>) =>
  Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

const fetchItems = async (path: string) => {
  const response = await fetch(`${getDirectusUrl()}/items/${path}`, {
    signal: AbortSignal.timeout(DETAILS_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Directus answered ${response.status} for ${path}`);
  }

  return response.json();
};

const loadEntries = async () => {
  const query = queryString({
    fields:
      'name,prerequisites,generation.code,generation.published,course_links.course.name',
    limit: '-1',
  });
  const { data } = EntryRows.parse(
    await fetchItems(`curriculum_entries?${query}`),
  );

  return data;
};

// One shared load an hour.
const entriesState: {
  loadedAt: number;
  loading: null | Promise<CurriculumEntry[]>;
} = { loadedAt: 0, loading: null };

const getEntries = () => {
  if (
    entriesState.loading !== null &&
    Date.now() - entriesState.loadedAt < ENTRIES_TTL_MS
  ) {
    return entriesState.loading;
  }

  const loading = loadEntries();

  entriesState.loading = loading;
  entriesState.loadedAt = Date.now();

  return loading;
};

// A failed read drops the shared load, so the next card loads again.
const forgetFailedEntries = (failed: Promise<CurriculumEntry[]>) => {
  if (entriesState.loading === failed) {
    entriesState.loading = null;
  }
};

const readCourse = async (courseName: string) => {
  const query = queryString({
    fields: 'discord_channels.discord_channel.channel,curricula.entry.name',
    'filter[name][_eq]': courseName,
    limit: '1',
  });
  const { data } = CourseRows.parse(await fetchItems(`courses?${query}`));

  return data[0];
};

export const getCourseDetails = async (
  courseName: string,
): Promise<CourseDetails | null> => {
  const entriesLoading = getEntries();

  try {
    const [course, entries] = await Promise.all([
      readCourse(courseName),
      entriesLoading,
    ]);

    if (course === undefined) {
      return null;
    }

    const channels = (course.discord_channels ?? [])
      .map((link) => link.discord_channel?.channel)
      .filter((channel) => channel !== undefined);
    const accreditationNames = (course.curricula ?? [])
      .map((link) => link.entry?.name)
      .filter((name) => typeof name === 'string');

    return {
      channels,
      unlocks: coursesUnlockedBy([courseName, ...accreditationNames], entries),
    };
  } catch (error) {
    forgetFailedEntries(entriesLoading);
    logger.warn(`Failed reading the course details of ${courseName}`, error);
    return null;
  }
};
