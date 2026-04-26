import { Cron } from 'croner';

import { logger } from '@/common/logger/index.js';
import { fetchJsonFromUrl, parseContent } from '@/common/utils/data.js';
import { getDataStorageUrl } from '@/configuration/environment.js';
import { type Room, RoomSchema } from '@/modules/room/schemas/Room.js';

import { clearTransformedRooms } from './cache.js';

let rooms: Room[] = [];
let reloadCron: Cron | null = null;

export const reloadRooms = async () => {
  const baseUrl = getDataStorageUrl();

  if (!baseUrl) {
    logger.warn('DATA_STORAGE_URL not configured, room data loading disabled');
    return;
  }

  try {
    const roomsUrl = `${baseUrl}/rooms.json`;

    let roomsRaw: string;

    try {
      roomsRaw = await fetchJsonFromUrl(roomsUrl);
    } catch (error) {
      logger.error(`Failed fetching rooms from data storage\n${String(error)}`);
      throw error;
    }

    const roomsData = parseContent(roomsRaw);
    let roomsParsed: Room[];

    try {
      roomsParsed = await RoomSchema.array().parseAsync(roomsData);
    } catch (error) {
      logger.error(`Failed parsing rooms data\n${String(error)}`);
      throw error;
    }

    rooms = roomsParsed;
    clearTransformedRooms();
    logger.info('Rooms data reloaded from data storage');
  } catch (error) {
    logger.error(`Failed reloading rooms\n${String(error)}`);
    throw error;
  }
};

export const startPeriodicReload = () => {
  const baseUrl = getDataStorageUrl();

  if (!baseUrl) {
    logger.debug(
      'DATA_STORAGE_URL not configured, periodic room reload disabled',
    );
    return;
  }

  if (reloadCron) {
    reloadCron.stop();
  }

  // Reload every hour
  reloadCron = new Cron('0 * * * *', async () => {
    logger.info('Starting scheduled rooms reload from data storage...');
    try {
      await reloadRooms();
    } catch (error) {
      logger.error(`Scheduled rooms reload failed\n${String(error)}`);
    }
  });

  logger.info('Periodic rooms reload scheduled (every hour)');
};

export const getRooms = (): Room[] => rooms;
