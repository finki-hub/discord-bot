/* eslint-disable n/prefer-global/process -- env is read from node:process in one place for configuration */

import { env } from 'node:process';
import { z } from 'zod';

import { configErrors } from '../translations/errors.js';

export const getToken = () => {
  try {
    return z.string().parse(env['TOKEN']);
  } catch (error) {
    throw new Error(configErrors.noToken, { cause: error });
  }
};

export const getApplicationId = () => {
  try {
    return z.string().parse(env['APPLICATION_ID']);
  } catch (error) {
    throw new Error(configErrors.noApplicationId, { cause: error });
  }
};

export const getChatbotUrl = () => {
  try {
    return z
      .string()
      .transform((url) => (url.endsWith('/') ? url.slice(0, -1) : url))
      .parse(env['CHATBOT_URL']);
  } catch {
    return null;
  }
};

export const getApiKey = () => {
  try {
    return z.string().parse(env['API_KEY']);
  } catch {
    return null;
  }
};

export const getDataStorageUrl = () => {
  try {
    return z
      .string()
      .transform((url) => (url.endsWith('/') ? url.slice(0, -1) : url))
      .parse(env['DATA_STORAGE_URL']);
  } catch {
    return null;
  }
};

// FINKI Hub's Directus, read for the details courses.json does not carry.
export const getDirectusUrl = () => {
  try {
    return z
      .string()
      .min(1)
      .transform((url) => (url.endsWith('/') ? url.slice(0, -1) : url))
      .parse(env['DIRECTUS_URL']);
  } catch {
    return 'https://data.finki-hub.com';
  }
};

// FINKI's public APIs (pubapi), an MCP server over SSE, read for staff
// consultations. Without a key the staff card shows only the link.
export const getPubapiUrl = () => {
  try {
    return z.string().min(1).parse(env['PUBAPI_URL']);
  } catch {
    return 'https://pubapi.finki.ukim.mk/sse';
  }
};

export const getPubapiApiKey = () => {
  try {
    return z.string().min(1).parse(env['PUBAPI_API_KEY']);
  } catch {
    return null;
  }
};

export const getPostHogKey = () => {
  try {
    return z.string().min(1).parse(env['POSTHOG_KEY']);
  } catch {
    return null;
  }
};

export const getPostHogHost = () => {
  try {
    return z.string().min(1).parse(env['POSTHOG_HOST']);
  } catch {
    return 'https://eu.i.posthog.com';
  }
};

export const getPostHogSalt = () => {
  try {
    return z.string().parse(env['POSTHOG_SALT']);
  } catch {
    return '';
  }
};
