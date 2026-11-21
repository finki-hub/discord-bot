import {
  loadDirectusItems,
  schedulePeriodicReload,
} from '@/common/utils/data.js';
import { type Room, RoomSchema } from '@/modules/room/schemas/Room.js';

import { clearTransformedRooms } from './cache.js';

const ROOM_FIELDS = [
  'capacity',
  'description',
  'floor',
  'location',
  'mrbs',
  'name',
  'type',
];

const state: { rooms: Room[] } = {
  rooms: [],
};

export const reloadRooms = async () => {
  await loadDirectusItems({
    collection: 'rooms',
    fields: ROOM_FIELDS,
    label: 'rooms',
    onLoaded: (data: Room[]) => {
      state.rooms = data;
      clearTransformedRooms();
    },
    schema: RoomSchema.array(),
  });
};

export const startPeriodicReload = () => {
  schedulePeriodicReload({
    label: 'rooms',
    reload: reloadRooms,
  });
};

export const getRooms = (): Room[] => state.rooms;
