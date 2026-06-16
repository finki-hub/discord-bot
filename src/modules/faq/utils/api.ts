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

const fetchWithTimeout = async (
  url: string,
  timeout: number = MAX_FETCH_TIMEOUT,
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (Error.isError(error) && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`, { cause: error });
    }
    throw error;
  }
};

const getValidCacheData = (
  cache: null | { data: null | string[]; timestamp: number },
  ttl: number,
): null | string[] => {
  if (cache === null) return null;
  const age = Date.now() - cache.timestamp;
  if (age >= ttl || cache.data === null) return null;
  return cache.data;
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

    if (!result.ok) {
      return null;
    }

    return QuestionsSchema.parse(await result.json());
  } catch (error) {
    logger.error(apiErrorFunctions.getQuestionsError(error));

    return null;
  }
};

export const getQuestionNames = async (useCache = true) => {
  if (useCache) {
    const cached = getValidCacheData(cacheState.questionNamesCache, CACHE_TTL);
    if (cached !== null) return cached;
  }

  const chatbotUrl = getChatbotUrl();

  if (chatbotUrl === null) {
    return getCachedData(cacheState.questionNamesCache);
  }

  try {
    const result = await fetchWithTimeout(
      `${chatbotUrl}/questions/names`,
      MAX_FETCH_TIMEOUT,
    );

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

  if (chatbotUrl === null) {
    return null;
  }

  if (name === undefined) {
    return null;
  }

  try {
    const result = await fetch(`${chatbotUrl}/questions/name/${name}`);

    if (!result.ok) {
      return null;
    }

    return QuestionSchema.parse(await result.json());
  } catch (error) {
    logger.error(apiErrorFunctions.getQuestionError(error));

    return null;
  }
};

export const getNthQuestion = async (index?: number) => {
  const chatbotUrl = getChatbotUrl();

  if (chatbotUrl === null) {
    return null;
  }

  if (index === undefined) {
    return null;
  }

  try {
    const result = await fetch(`${chatbotUrl}/questions/nth/${index}`);

    if (!result.ok) {
      return null;
    }

    return QuestionSchema.parse(await result.json());
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

    if (!result.ok) {
      return null;
    }

    return LinksSchema.parse(await result.json());
  } catch (error) {
    logger.error(apiErrorFunctions.getLinksError(error));

    return null;
  }
};

export const getLinkNames = async (useCache = true) => {
  if (useCache) {
    const cached = getValidCacheData(cacheState.linkNamesCache, CACHE_TTL);
    if (cached !== null) return cached;
  }

  const chatbotUrl = getChatbotUrl();

  if (chatbotUrl === null) {
    return getCachedData(cacheState.linkNamesCache);
  }

  try {
    const result = await fetchWithTimeout(
      `${chatbotUrl}/links/names`,
      MAX_FETCH_TIMEOUT,
    );

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

  if (chatbotUrl === null) {
    return null;
  }

  if (name === undefined) {
    return null;
  }

  try {
    const result = await fetch(`${chatbotUrl}/links/name/${name}`);

    if (!result.ok) {
      return null;
    }

    return LinkSchema.parse(await result.json());
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

    if (!result.ok) {
      return null;
    }

    return LinkSchema.parse(await result.json());
  } catch (error) {
    logger.error(apiErrorFunctions.getNthLinkError(error));

    return null;
  }
};
