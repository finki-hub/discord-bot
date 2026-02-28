import Fuse from 'fuse.js';

import { createTransliterationSearchMapFromEntries } from '@/common/utils/transliteration.js';
import { getCourseNameVariants } from '@/modules/course/utils/data.js';

export const getClosestCourse = (course: string) => {
  const courseVariants = getCourseNameVariants();

  const transformedCourseNames =
    createTransliterationSearchMapFromEntries(courseVariants);

  const fuse = new Fuse(Object.keys(transformedCourseNames), {
    includeScore: true,
    threshold: 0.4,
  });

  const result = fuse.search(course);

  if (result.length === 0) {
    return null;
  }

  const closestLatinCourse = result[0]?.item;

  if (closestLatinCourse === undefined) {
    return null;
  }

  const closestCourse = transformedCourseNames[closestLatinCourse];

  return closestCourse ?? null;
};
