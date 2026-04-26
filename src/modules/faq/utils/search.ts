import Fuse from 'fuse.js';

import { createTransliterationSearchMap } from '@/common/utils/transliteration.js';

import {
  getLink,
  getLinkNames,
  getNthLink,
  getNthQuestion,
  getQuestion,
  getQuestionNames,
} from './api.js';

export const getClosestQuestion = async (question: number | string) => {
  const isNumber = typeof question === 'number';

  if (isNumber) {
    return getNthQuestion(question);
  }

  const questions = await getQuestionNames();

  if (questions === null) {
    return null;
  }

  const transformedQuestionNames = createTransliterationSearchMap(questions);

  const fuse = new Fuse(Object.keys(transformedQuestionNames), {
    includeScore: true,
    threshold: 0.4,
  });

  const result = fuse.search(question);

  if (result.length === 0) {
    return null;
  }

  const closestLatinQuestion = result[0]?.item;

  if (closestLatinQuestion === undefined) {
    return null;
  }

  const closestQuestion = transformedQuestionNames[closestLatinQuestion];

  return getQuestion(closestQuestion);
};

export const getClosestLink = async (link: number | string) => {
  const isNumber = typeof link === 'number';

  if (isNumber) {
    return getNthLink(link);
  }

  const links = await getLinkNames();

  if (links === null) {
    return null;
  }

  const transformedLinkNames = createTransliterationSearchMap(links);

  const fuse = new Fuse(Object.keys(transformedLinkNames), {
    includeScore: true,
    threshold: 0.4,
  });

  const result = fuse.search(link);

  if (result.length === 0) {
    return null;
  }

  const closestLatinLink = result[0]?.item;

  if (closestLatinLink === undefined) {
    return null;
  }

  const closestLink = transformedLinkNames[closestLatinLink];

  return getLink(closestLink);
};
