import { z } from 'zod';

import { logger } from '@/common/logger/index.js';
import { getChatbotUrl } from '@/configuration/environment.js';
import { apiErrorFunctions } from '@/translations/api.js';

import { LinkSchema, LinksSchema } from '../schemas/Link.js';
import { QuestionSchema, QuestionsSchema } from '../schemas/Question.js';

const CACHE_TTL = 60 * 1_000;
const MAX_FETCH_TIMEOUT = 2_000;

const cacheState: {
  linkNamesCache: null | {
    data: null | string[];
    timestamp: number;
  };
  questionNamesCache: null | {
    data: null | string[];
    timestamp: number;
  };
} = {
  linkNamesCache: null,
  questionNamesCache: null,
};

const setQuestionNamesCache = (data: string[]) => {
  cacheState.questionNamesCache = {
    data,
    timestamp: Date.now(),
  };
};

const setLinkNamesCache = (data: string[]) => {
  cacheState.linkNamesCache = {
    data,
    timestamp: Date.now(),
  };
};

const fetchWithTimeout = async (url: string): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, MAX_FETCH_TIMEOUT);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (Error.isError(error) && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${MAX_FETCH_TIMEOUT}ms`, {
        cause: error,
      });
    }
    throw error;
  }
};

const getValidCacheData = (
  cache: null | { data: null | string[]; timestamp: number },
): null | string[] => {
  if (cache === null) return null;
  const age = Date.now() - cache.timestamp;
  return age >= CACHE_TTL || cache.data === null ? null : cache.data;
};

const getCachedData = (
  cache: null | { data: null | string[]; timestamp: number },
): null | string[] => cache?.data ?? null;

export const getQuestions = async () => {
  const chatbotUrl = getChatbotUrl();

  if (chatbotUrl === null) {
    return null;
  }

  try {
    const result = await fetch(`${chatbotUrl}/questions/list`);

    return result.ok ? QuestionsSchema.parse(await result.json()) : null;
  } catch (error) {
    logger.error(apiErrorFunctions.getQuestionsError(error));

    return null;
  }
};

export const getQuestionNames = async (useCache = true) => {
  if (useCache) {
    const cached = getValidCacheData(cacheState.questionNamesCache);
    if (cached !== null) return cached;
  }

  const chatbotUrl = getChatbotUrl();

  if (chatbotUrl === null) {
    return getCachedData(cacheState.questionNamesCache);
  }

  try {
    const result = await fetchWithTimeout(`${chatbotUrl}/questions/names`);

    if (!result.ok) {
      return getCachedData(cacheState.questionNamesCache);
    }

    const data = z.array(z.string()).parse(await result.json());

    setQuestionNamesCache(data);

    return data;
  } catch (error) {
    logger.error(apiErrorFunctions.getQuestionNamesError(error));
    return getCachedData(cacheState.questionNamesCache);
  }
};

export const getQuestion = async (name?: string) => {
  const chatbotUrl = getChatbotUrl();

  if (chatbotUrl === null || name === undefined) {
    return null;
  }

  try {
    const result = await fetch(`${chatbotUrl}/questions/name/${name}`);

    return result.ok ? QuestionSchema.parse(await result.json()) : null;
  } catch (error) {
    logger.error(apiErrorFunctions.getQuestionError(error));

    return null;
  }
};

export const getNthQuestion = async (index?: number) => {
  const chatbotUrl = getChatbotUrl();

  if (chatbotUrl === null || index === undefined) {
    return null;
  }

  try {
    const result = await fetch(`${chatbotUrl}/questions/nth/${index}`);

    return result.ok ? QuestionSchema.parse(await result.json()) : null;
  } catch (error) {
    logger.error(apiErrorFunctions.getNthQuestionError(error));

    return null;
  }
};

export const getLinks = async () => {
  const chatbotUrl = getChatbotUrl();

  if (chatbotUrl === null) {
    return null;
  }

  try {
    const result = await fetch(`${chatbotUrl}/links/list`);

    return result.ok ? LinksSchema.parse(await result.json()) : null;
  } catch (error) {
    logger.error(apiErrorFunctions.getLinksError(error));

    return null;
  }
};

export const getLinkNames = async (useCache = true) => {
  if (useCache) {
    const cached = getValidCacheData(cacheState.linkNamesCache);
    if (cached !== null) return cached;
  }

  const chatbotUrl = getChatbotUrl();

  if (chatbotUrl === null) {
    return getCachedData(cacheState.linkNamesCache);
  }

  try {
    const result = await fetchWithTimeout(`${chatbotUrl}/links/names`);

    if (!result.ok) {
      return getCachedData(cacheState.linkNamesCache);
    }

    const data = z.array(z.string()).parse(await result.json());

    setLinkNamesCache(data);

    return data;
  } catch (error) {
    logger.error(apiErrorFunctions.getLinkNamesError(error));
    return getCachedData(cacheState.linkNamesCache);
  }
};

export const getLink = async (name?: string) => {
  const chatbotUrl = getChatbotUrl();

  if (chatbotUrl === null || name === undefined) {
    return null;
  }

  try {
    const result = await fetch(`${chatbotUrl}/links/name/${name}`);

    return result.ok ? LinkSchema.parse(await result.json()) : null;
  } catch (error) {
    logger.error(apiErrorFunctions.getLinkError(error));

    return null;
  }
};

export const getNthLink = async (index?: number) => {
  if (index === undefined) {
    return null;
  }

  const chatbotUrl = getChatbotUrl();

  try {
    const result = await fetch(`${chatbotUrl}/links/nth/${index}`);

    return result.ok ? LinkSchema.parse(await result.json()) : null;
  } catch (error) {
    logger.error(apiErrorFunctions.getNthLinkError(error));

    return null;
  }
};
