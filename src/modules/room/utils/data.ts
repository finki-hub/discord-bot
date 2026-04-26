import {
  loadJsonResource,
  schedulePeriodicReload,
} from '@/common/utils/data.js';
import { type Room, RoomSchema } from '@/modules/room/schemas/Room.js';

import { clearTransformedRooms } from './cache.js';

let rooms: Room[] = [];

export const reloadRooms = async () => {
  await loadJsonResource({
    label: 'rooms',
    onLoaded: (data: Room[]) => {
      rooms = data;
      clearTransformedRooms();
    },
    resource: 'rooms.json',
    schema: RoomSchema.array(),
  });
};

export const startPeriodicReload = () => {
  schedulePeriodicReload({ label: 'rooms', reload: reloadRooms });
};

export const getRooms = (): Room[] => rooms;
