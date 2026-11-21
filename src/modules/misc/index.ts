import { reloadQuotes, startPeriodicReload } from './utils/data.js';

// The periodic reload is scheduled before the first load, so a failed
// first load (such as Directus restarting) recovers at the next
// reload instead of leaving the module without data until a restart.
export const init = async () => {
  startPeriodicReload();
  await reloadQuotes();
};
