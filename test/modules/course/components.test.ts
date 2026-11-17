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
});
