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
