import { isButtonUrl } from '@/common/utils/limits.js';

export const getNormalizedUrl = (url: string) =>
  url.startsWith('http') ? url : `https://${url}`;

// A question's links that a link button can carry, by name and full URL.
export const getButtonLinks = (links: null | Record<string, string>) =>
  Object.entries(links ?? {})
    .filter(([name, url]) => name.trim() !== '' && url !== '')
    .map(([name, url]) => [name, getNormalizedUrl(url)] as const)
    .filter(([, url]) => isButtonUrl(url));
