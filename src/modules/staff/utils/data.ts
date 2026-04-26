import { Cron } from 'croner';

import { logger } from '@/common/logger/index.js';
import { fetchJsonFromUrl, parseContent } from '@/common/utils/data.js';
import { getDataStorageUrl } from '@/configuration/environment.js';

import { type Staff, StaffSchema } from '../schemas/Staff.js';
import { clearTransformedProfessors } from './cache.js';

let staff: Staff[] = [];
let reloadCron: Cron | null = null;

export const reloadStaff = async () => {
  const baseUrl = getDataStorageUrl();

  if (!baseUrl) {
    logger.warn('DATA_STORAGE_URL not configured, staff data loading disabled');
    return;
  }

  try {
    const staffUrl = `${baseUrl}/staff.json`;

    let staffRaw: string;

    try {
      staffRaw = await fetchJsonFromUrl(staffUrl);
    } catch (error) {
      logger.error(`Failed fetching staff from data storage\n${String(error)}`);
      throw error;
    }

    const staffData = parseContent(staffRaw);
    let staffParsed: Staff[];

    try {
      staffParsed = await StaffSchema.array().parseAsync(staffData);
    } catch (error) {
      logger.error(`Failed parsing staff data\n${String(error)}`);
      throw error;
    }

    staff = staffParsed;
    clearTransformedProfessors();
    logger.info('Staff data reloaded from data storage');
  } catch (error) {
    logger.error(`Failed reloading staff\n${String(error)}`);
    throw error;
  }
};

export const startPeriodicReload = () => {
  const baseUrl = getDataStorageUrl();

  if (!baseUrl) {
    logger.debug(
      'DATA_STORAGE_URL not configured, periodic staff reload disabled',
    );
    return;
  }

  if (reloadCron) {
    reloadCron.stop();
  }

  // Reload every hour
  reloadCron = new Cron('0 * * * *', async () => {
    logger.info('Starting scheduled staff reload from data storage...');
    try {
      await reloadStaff();
    } catch (error) {
      logger.error(`Scheduled staff reload failed\n${String(error)}`);
    }
  });

  logger.info('Periodic staff reload scheduled (every hour)');
};

export const getStaff = (): Staff[] => staff;
