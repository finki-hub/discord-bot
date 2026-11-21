import { Cron } from 'croner';
import { z, type ZodType } from 'zod';

import { logger } from '@/common/logger/index.js';
import {
  getDataStorageUrl,
  getDirectusUrl,
} from '@/configuration/environment.js';

const DATA_FETCH_TIMEOUT_MS = 30_000;

export const fetchJsonFromUrl = async (url: string) => {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(DATA_FETCH_TIMEOUT_MS),
  });

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
): unknown => (content.length === 0 ? fallback : JSON.parse(content));

type LoadJsonFromUrlOptions<T> = {
  label: string;
  onLoaded: (data: T) => void;
  parseFallback?: unknown;
  schema: ZodType<T>;
  url: string;
};

const loadJsonFromUrl = async <T>({
  label,
  onLoaded,
  parseFallback,
  schema,
  url,
}: LoadJsonFromUrlOptions<T>): Promise<boolean> => {
  let raw: string;
  try {
    raw = await fetchJsonFromUrl(url);
  } catch (error) {
    logger.error(`Failed fetching ${label}\n${String(error)}`);
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
  logger.info(`${label} data reloaded`);
  return true;
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

  return loadJsonFromUrl({
    label,
    onLoaded,
    parseFallback,
    schema,
    url: `${baseUrl}/${resource}`,
  });
};

type LoadDirectusItemsOptions<T> = {
  collection: string;
  fields: readonly string[];
  label: string;
  onLoaded: (data: T) => void;
  schema: ZodType<T>;
};

// The rows of a public Directus collection, in id order.
export const loadDirectusItems = async <T>({
  collection,
  fields,
  label,
  onLoaded,
  schema,
}: LoadDirectusItemsOptions<T>): Promise<boolean> => {
  const query = `fields=${encodeURIComponent(fields.join(','))}&limit=-1&sort=id`;

  return loadJsonFromUrl({
    label,
    onLoaded,
    schema: z.object({ data: schema }).transform(({ data }) => data),
    url: `${getDirectusUrl()}/items/${collection}?${query}`,
  });
};

type SchedulePeriodicReloadOptions = {
  cronExpression?: string;
  label: string;
  reload: () => Promise<unknown>;
  // Directus has a default URL, so its data reloads without data storage.
  requiresDataStorage?: boolean;
};

export const schedulePeriodicReload = ({
  cronExpression = '0 * * * *',
  label,
  reload,
  requiresDataStorage = true,
}: SchedulePeriodicReloadOptions): Cron | null => {
  if (requiresDataStorage && !getDataStorageUrl()) {
    logger.debug(
      `DATA_STORAGE_URL not configured, periodic ${label} reload disabled`,
    );
    return null;
  }

  const cron = new Cron(cronExpression, async () => {
    logger.info(`Starting scheduled ${label} reload...`);
    try {
      await reload();
    } catch (error) {
      logger.error(`Scheduled ${label} reload failed\n${String(error)}`);
    }
  });

  logger.info(`Periodic ${label} reload scheduled (${cronExpression})`);
  return cron;
};
