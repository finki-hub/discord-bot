const state: { transformedRooms: Array<[string, string]> | null } = {
  transformedRooms: null,
};

export const getTransformedRooms = (): Array<[string, string]> | null =>
  state.transformedRooms;

export const setTransformedRooms = (rooms: Array<[string, string]>): void => {
  state.transformedRooms = rooms;
};

export const clearTransformedRooms = (): void => {
  state.transformedRooms = null;
};
