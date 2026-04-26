import { z } from 'zod';

import {
  loadJsonResource,
  schedulePeriodicReload,
} from '@/common/utils/data.js';

import { clearTransformedSessions } from './cache.js';

let sessions: Record<string, string> = {};

const SessionsSchema = z.record(z.string(), z.string());

export const reloadSessions = async () => {
  await loadJsonResource({
    label: 'sessions',
    onLoaded: (data: Record<string, string>) => {
      sessions = data;
      clearTransformedSessions();
    },
    parseFallback: {},
    resource: 'sessions.json',
    schema: SessionsSchema,
  });
};

export const startPeriodicReload = () => {
  schedulePeriodicReload({ label: 'sessions', reload: reloadSessions });
};

export const getSessions = (): Record<string, string> => sessions;
