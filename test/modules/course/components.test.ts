import { describe, expect, test } from 'vitest';

import { getCourseComponent } from '@/modules/course/components/components.js';
import { CourseSchema } from '@/modules/course/schemas/Course.js';
import { labels } from '@/translations/labels.js';

const courseOf = (extra: Record<string, string>) =>
  CourseSchema.parse({
    '2018-available': 'FALSE',
    '2023-available': 'FALSE',
    name: 'Data Science',
    professors: 'Димитар Трајанов',
    ...extra,
  });

const textOf = (course: ReturnType<typeof courseOf>) =>
  JSON.stringify(getCourseComponent(course).toJSON());

describe('the course card', () => {
  test("shows a master's course as one, without the accreditation sections", () => {
    const text = textOf(courseOf({ cycle: 'second' }));

    expect(text).toContain(labels.mastersCourse);
    expect(text).not.toContain(labels.notAvailable);
    expect(text).not.toContain(`${labels.accreditation} 2023`);
  });

  test('shows an undergraduate course by its accreditations', () => {
    for (const extra of [{}, { cycle: 'first' }]) {
      const text = textOf(courseOf(extra));

      expect(text).toContain(`${labels.accreditation} 2023`);
      expect(text).not.toContain(labels.mastersCourse);
    }
  });

  test('shows a course without professors as having none', () => {
    const course = CourseSchema.parse({
      '2018-available': 'FALSE',
      '2023-available': 'FALSE',
      cycle: 'second',
      name: 'Далечинско сондирање',
    });

    expect(course.professors).toEqual([]);
    // The card text is JSON, so the expected text is escaped the same way.
    expect(textOf(course)).toContain(
      JSON.stringify(`**${labels.professors}**\n${labels.none}`).slice(1, -1),
    );
  });
});

describe('the size of the course card', () => {
  test('stays within the 40 components Discord allows', () => {
    const accredited = Object.fromEntries(
      ['2018', '2023'].flatMap((year) => [
        [`${year}-available`, 'TRUE'],
        [`${year}-name`, 'Бази на податоци'],
        [`${year}-code`, `F${year}L3W055`],
        [`${year}-level`, '3'],
        [`${year}-semester`, '5'],
        [`${year}-prerequisite`, 'Алгоритми и податочни структури'],
      ]),
    );
    const participants = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [
        `${2_014 + index}/${2_015 + index}`,
        '100',
      ]),
    );
    const card = getCourseComponent(
      CourseSchema.parse({
        name: 'Бази на податоци',
        professors: 'Димитар Трајанов',
        ...accredited,
        ...participants,
      }),
      { channels: ['<#1>'], unlocks: ['Напредни бази на податоци'] },
    ).toJSON();
    const count = (component: unknown): number => {
      const { components = [] } = component as { components?: unknown[] };

      return 1 + components.reduce<number>((sum, c) => sum + count(c), 0);
    };

    // One more for the line naming the user the card is for.
    expect(count(card) + 1).toBeLessThanOrEqual(40);
  });
});
