/* eslint-disable camelcase -- Directus field names use snake_case */

import { describe, expect, test } from 'vitest';

import { getCourseComponent } from '@/modules/course/components/components.js';
import { CourseSchema } from '@/modules/course/schemas/Course.js';
import {
  coursesUnlockedBy,
  type CurriculumEntry,
  namedCourses,
} from '@/modules/course/utils/details.js';
import { labels } from '@/translations/labels.js';

const NAMES = [
  'Компјутерски мрежи',
  'Компјутерски мрежи и безбедност',
  'Оперативни системи',
  'Бази на податоци',
  'Напредни бази на податоци',
];

const entry = (
  name: string,
  prerequisites: null | string,
  code = '2023',
  published = true,
): CurriculumEntry => ({
  course_links: [{ course: { name } }],
  generation: { code, published },
  name,
  prerequisites,
});

describe('prerequisite names', () => {
  test('match a name with "и" inside as a whole', () => {
    expect(
      namedCourses(
        'Оперативни системи и (Компјутерски мрежи или Компјутерски мрежи и безбедност)',
        NAMES,
      ),
    ).toEqual(
      new Set([
        'компјутерски мрежи',
        'компјутерски мрежи и безбедност',
        'оперативни системи',
      ]),
    );
  });

  test('never count a longer name as its prefix', () => {
    expect(namedCourses('Компјутерски мрежи и безбедност', NAMES)).toEqual(
      new Set(['компјутерски мрежи и безбедност']),
    );
    expect(namedCourses('Напредни бази на податоци', NAMES)).toEqual(
      new Set(['напредни бази на податоци']),
    );
  });
});

describe('the courses a course unlocks', () => {
  const entries = [
    entry('Компјутерски мрежи', null),
    entry('Компјутерски мрежи и безбедност', null),
    entry(
      'Дистрибуирани системи',
      'Оперативни системи и (Компјутерски мрежи или Компјутерски мрежи и безбедност)',
    ),
    entry('Етичко хакирање', 'Компјутерски мрежи и безбедност'),
    entry('Дизајн на компјутерски мрежи', 'Компјутерски мрежи', '2018'),
    entry('Дистрибуирани системи', 'Компјутерски мрежи', '2018'),
    entry('Скриен предмет', 'Компјутерски мрежи', '2026', false),
  ];

  test('are named once, newest accreditation first, published only', () => {
    expect(coursesUnlockedBy(['Компјутерски мрежи'], entries)).toEqual([
      'Дистрибуирани системи',
      'Дизајн на компјутерски мрежи',
    ]);
  });

  test('match the course by any of its accreditation names', () => {
    expect(
      coursesUnlockedBy(
        ['Нешто ново', 'Компјутерски мрежи и безбедност'],
        entries,
      ),
    ).toEqual(['Дистрибуирани системи', 'Етичко хакирање']);
  });
});

describe('the course card extras', () => {
  const course = CourseSchema.parse({
    '2018-available': 'FALSE',
    '2023-available': 'FALSE',
    name: 'Компјутерски мрежи',
    professors: 'Соња Филипоска',
  });
  const textOf = (extras: Parameters<typeof getCourseComponent>[1]) =>
    JSON.stringify(getCourseComponent(course, extras).toJSON());

  test('show the channel and the courses it is a prerequisite for', () => {
    const text = textOf({
      channels: ['<#123>'],
      unlocks: ['Дистрибуирани системи', 'Етичко хакирање'],
    });

    expect(text).toContain(`**${labels.channel}:** <#123>`);
    expect(text).toContain(labels.prerequisiteFor);
    expect(text).toContain('Дистрибуирани системи, Етичко хакирање');
  });

  test('cut a long list with the count of the rest', () => {
    const unlocks = Array.from({ length: 18 }, (_, index) => `П${index}`);

    expect(textOf({ unlocks })).toContain('П14 (+3)');
  });

  test('leave both out without them', () => {
    const text = textOf({});

    expect(text).not.toContain(labels.channel);
    expect(text).not.toContain(labels.prerequisiteFor);
  });
});
