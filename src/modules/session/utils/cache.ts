const state: { transformedSessions: Array<[string, string]> | null } = {
  transformedSessions: null,
};

export const getTransformedSessions = (): Array<[string, string]> | null =>
  state.transformedSessions;

export const setTransformedSessions = (
  sessions: Array<[string, string]>,
): void => {
  state.transformedSessions = sessions;
};

export const clearTransformedSessions = (): void => {
  state.transformedSessions = null;
};
