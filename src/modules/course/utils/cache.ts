const state: { transformedCourses: Array<[string, string]> | null } = {
  transformedCourses: null,
};

export const getTransformedCourses = () => state.transformedCourses;

export const setTransformedCourses = (
  courses: Array<[string, string]>,
): void => {
  state.transformedCourses = courses;
};

export const clearTransformedCourses = () => {
  state.transformedCourses = null;
};
