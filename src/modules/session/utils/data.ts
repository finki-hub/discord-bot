/* eslint-disable camelcase -- Directus names this file field in snake_case */
import { z } from 'zod';

import {
  loadDirectusItems,
  schedulePeriodicReload,
} from '@/common/utils/data.js';
import { getDirectusUrl } from '@/configuration/environment.js';

import { clearTransformedSessions } from './cache.js';

const state: { sessions: Record<string, string> } = {
  sessions: {},
};

// Each session's name and the public link to its schedule file.
const SessionsSchema = z
  .array(
    z.object({
      file: z.object({ filename_download: z.string(), id: z.string() }),
      name: z.string(),
    }),
  )
  .transform((rows) =>
    Object.fromEntries(
      rows.map(({ file, name }) => [
        name,
        `${getDirectusUrl()}/assets/${file.id}/${encodeURIComponent(file.filename_download)}`,
      ]),
    ),
  );

export const reloadSessions = async () => {
  await loadDirectusItems({
    collection: 'exam_sessions',
    fields: ['name', 'file.id', 'file.filename_download'],
    label: 'sessions',
    onLoaded: (data: Record<string, string>) => {
      state.sessions = data;
      clearTransformedSessions();
    },
    schema: SessionsSchema,
  });
};

export const startPeriodicReload = () => {
  schedulePeriodicReload({
    label: 'sessions',
    reload: reloadSessions,
    requiresDataStorage: false,
  });
};

export const getSessions = (): Record<string, string> => state.sessions;
