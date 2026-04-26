import { Cron } from 'croner';
import { type ZodType } from 'zod';

import { logger } from '@/common/logger/index.js';
import { getDataStorageUrl } from '@/configuration/environment.js';

export const fetchJsonFromUrl = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
    );
  }

  return response.text();
};

export const parseContent = (
  content: string,
  fallback: unknown = [],
): unknown => {
  if (content.length === 0) {
    return fallback;
  }

  return JSON.parse(content);
};

type LoadJsonResourceOptions<T> = {
  label: string;
  onLoaded: (data: T) => void;
  parseFallback?: unknown;
  resource: string;
  schema: ZodType<T>;
};

export const loadJsonResource = async <T>({
  label,
  onLoaded,
  parseFallback,
  resource,
  schema,
}: LoadJsonResourceOptions<T>): Promise<boolean> => {
  const baseUrl = getDataStorageUrl();

  if (!baseUrl) {
    logger.warn(
      `DATA_STORAGE_URL not configured, ${label} data loading disabled`,
    );
    return false;
  }

  const url = `${baseUrl}/${resource}`;

  let raw: string;
  try {
    raw = await fetchJsonFromUrl(url);
  } catch (error) {
    logger.error(
      `Failed fetching ${label} from data storage\n${String(error)}`,
    );
    throw error;
  }

  const data = parseContent(raw, parseFallback);

  let parsed: T;
  try {
    parsed = await schema.parseAsync(data);
  } catch (error) {
    logger.error(`Failed parsing ${label} data\n${String(error)}`);
    throw error;
  }

  onLoaded(parsed);
  logger.info(`${label} data reloaded from data storage`);
  return true;
};

type SchedulePeriodicReloadOptions = {
  cronExpression?: string;
  label: string;
  reload: () => Promise<unknown>;
};

export const schedulePeriodicReload = ({
  cronExpression = '0 * * * *',
  label,
  reload,
}: SchedulePeriodicReloadOptions): Cron | null => {
  const baseUrl = getDataStorageUrl();

  if (!baseUrl) {
    logger.debug(
      `DATA_STORAGE_URL not configured, periodic ${label} reload disabled`,
    );
    return null;
  }

  const cron = new Cron(cronExpression, async () => {
    logger.info(`Starting scheduled ${label} reload from data storage...`);
    try {
      await reload();
    } catch (error) {
      logger.error(`Scheduled ${label} reload failed\n${String(error)}`);
    }
  });

  logger.info(`Periodic ${label} reload scheduled (${cronExpression})`);
  return cron;
};
