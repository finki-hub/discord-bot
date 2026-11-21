import type { Guild } from 'discord.js';

import { beforeEach, expect, test, vi } from 'vitest';

import { client as bot } from '@/core/client.js';
import { execute as onGuildAvailable } from '@/core/events/GuildAvailable.js';
import { execute as onShardReady } from '@/core/events/ShardReady.js';

const mocks = vi.hoisted(() => ({
  reset: vi.fn<(guilds: Iterable<Guild>) => void>(),
}));

vi.mock('@/common/services/roles.js', () => ({
  resetGuildMembersCache: mocks.reset,
}));

vi.mock('@/common/logger/index.js', () => ({
  logger: { info: vi.fn<() => void>() },
}));

vi.mock('@/core/client.js', async () => {
  const { Collection } = await import('discord.js');

  return {
    client: {
      guilds: {
        cache: new Collection<string, Guild>(),
      },
    },
  };
});

beforeEach(() => {
  mocks.reset.mockClear();
  bot.guilds.cache.clear();
});

test('resets only guilds belonging to the shard that became ready', () => {
  const shardZeroGuild = { id: 'zero', shardId: 0 } as Guild;
  const shardOneGuild = { id: 'one', shardId: 1 } as Guild;
  bot.guilds.cache.set(shardZeroGuild.id, shardZeroGuild);
  bot.guilds.cache.set(shardOneGuild.id, shardOneGuild);

  onShardReady(0, undefined);

  expect(mocks.reset).toHaveBeenCalledExactlyOnceWith([shardZeroGuild]);
});

test('resets the guild that became available', () => {
  const guild = { id: 'available', shardId: 0 } as Guild;

  onGuildAvailable(guild);

  expect(mocks.reset).toHaveBeenCalledExactlyOnceWith([guild]);
});
