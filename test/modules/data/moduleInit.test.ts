import { beforeEach, describe, expect, test, vi } from 'vitest';

const calls = vi.hoisted(() => [] as string[]);

const failingLoad = (name: string) => () => {
  calls.push(name);
  return Promise.reject(new Error('Failed to fetch: 403'));
};

const schedule = (name: string) => () => {
  calls.push(`${name} scheduled`);
};

vi.mock('@/modules/course/utils/data.js', () => ({
  reloadCourses: failingLoad('courses'),
  startPeriodicReload: schedule('courses'),
}));
vi.mock('@/modules/misc/utils/data.js', () => ({
  reloadQuotes: failingLoad('quotes'),
  startPeriodicReload: schedule('quotes'),
}));
vi.mock('@/modules/room/utils/data.js', () => ({
  reloadRooms: failingLoad('rooms'),
  startPeriodicReload: schedule('rooms'),
}));
vi.mock('@/modules/session/utils/data.js', () => ({
  reloadSessions: failingLoad('sessions'),
  startPeriodicReload: schedule('sessions'),
}));
vi.mock('@/modules/staff/utils/data.js', () => ({
  reloadStaff: failingLoad('staff'),
  startPeriodicReload: schedule('staff'),
}));

const { init: initCourse } = await import('@/modules/course/index.js');
const { init: initMisc } = await import('@/modules/misc/index.js');
const { init: initRoom } = await import('@/modules/room/index.js');
const { init: initSession } = await import('@/modules/session/index.js');
const { init: initStaff } = await import('@/modules/staff/index.js');

describe('data module init', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  test.each([
    ['courses', initCourse],
    ['quotes', initMisc],
    ['rooms', initRoom],
    ['sessions', initSession],
    ['staff', initStaff],
  ])(
    'schedules the %s reload even when the first load fails',
    async (name, init) => {
      await expect(init()).rejects.toThrow('403');
      expect(calls).toEqual([`${name} scheduled`, name]);
    },
  );
});
