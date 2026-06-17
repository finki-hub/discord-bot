import {
  loadJsonResource,
  schedulePeriodicReload,
} from '@/common/utils/data.js';

import { ACCREDITATION_YEARS } from '../constants.js';
import { type Course, CourseSchema } from '../schemas/Course.js';
import { clearTransformedCourses } from './cache.js';

const state: { courses: Course[] } = {
  courses: [],
};

export const reloadCourses = async () => {
  await loadJsonResource({
    label: 'courses',
    onLoaded: (data: Course[]) => {
      state.courses = data;
      clearTransformedCourses();
    },
    resource: 'courses.json',
    schema: CourseSchema.array(),
  });
};

export const startPeriodicReload = () => {
  schedulePeriodicReload({ label: 'courses', reload: reloadCourses });
};

export const getCourses = (): string[] =>
  state.courses.map((course) => course.name);

export const getCourseNameVariants = (): Array<[string, string]> =>
  state.courses.flatMap((course) => {
    const variants: Array<[string, string]> = [[course.name, course.name]];

    for (const year of ACCREDITATION_YEARS) {
      const accreditationName = course[`${year}-name`];

      if (
        accreditationName !== undefined &&
        accreditationName !== course.name
      ) {
        variants.push([accreditationName, course.name]);
      }
    }

    return variants;
  });

export const getCourse = (name: string): Course | undefined =>
  state.courses.find(
    (course) => course.name.toLowerCase() === name.toLowerCase(),
  );
