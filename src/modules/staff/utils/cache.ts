const state: { transformedProfessors: Array<[string, string]> | null } = {
  transformedProfessors: null,
};

export const getTransformedProfessors = (): Array<[string, string]> | null =>
  state.transformedProfessors;

export const setTransformedProfessors = (
  professors: Array<[string, string]>,
): void => {
  state.transformedProfessors = professors;
};

export const clearTransformedProfessors = (): void => {
  state.transformedProfessors = null;
};
