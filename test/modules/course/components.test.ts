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
