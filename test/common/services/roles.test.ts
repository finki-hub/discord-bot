import { Collection, type Guild, type Role } from 'discord.js';
import { describe, expect, test, vi } from 'vitest';

import { getMembersByRoleIds } from '@/common/services/roles.js';

type FakeMember = { id: string; roles: string[] };

const createFakeGuild = ({
  initialMembers = [],
  initialRoles = [],
  remoteMembers = [],
  remoteRoles = [],
}: {
  initialMembers?: FakeMember[];
  initialRoles?: string[];
  remoteMembers?: FakeMember[];
  remoteRoles?: string[];
}) => {
  const membersCache = new Collection<string, FakeMember>(
    initialMembers.map((member) => [member.id, member]),
  );
  const rolesCache = new Collection<string, Role>();

  const makeRole = (roleId: string): Role =>
    ({
      id: roleId,
      get members() {
        return membersCache.filter((member) => member.roles.includes(roleId));
      },
    }) as unknown as Role;

  for (const roleId of initialRoles) {
    rolesCache.set(roleId, makeRole(roleId));
  }

  const fetchMembers = vi.fn<() => Promise<typeof membersCache>>(async () => {
    for (const member of remoteMembers) {
      membersCache.set(member.id, member);
    }

    return membersCache;
  });

  const fetchRoles = vi.fn<() => Promise<typeof rolesCache>>(async () => {
    for (const roleId of remoteRoles) {
      rolesCache.set(roleId, makeRole(roleId));
    }

    return rolesCache;
  });

  const guild = {
    members: {
      cache: membersCache,
      fetch: fetchMembers,
    },
    roles: {
      cache: rolesCache,
      fetch: fetchRoles,
    },
  } as unknown as Guild;

  return { fetchMembers, fetchRoles, guild };
};

describe('getMembersByRoleIds', () => {
  test('fetches uncached roles and members before resolving role membership', async () => {
    const { fetchMembers, fetchRoles, guild } = createFakeGuild({
      initialMembers: [],
      initialRoles: [],
      remoteMembers: [
        { id: 'u1', roles: ['fss'] },
        { id: 'u2', roles: ['fss', 'ombudsman'] },
        { id: 'u3', roles: ['mod'] },
      ],
      remoteRoles: ['fss', 'ombudsman', 'mod'],
    });

    const memberIds = await getMembersByRoleIds(guild, ['fss', 'ombudsman']);

    expect(fetchRoles).toHaveBeenCalledOnce();
    expect(fetchMembers).toHaveBeenCalledOnce();
    expect(memberIds).toEqual(['u1', 'u2']);
  });

  test('fetches guild members only once per guild across subsequent calls', async () => {
    const { fetchMembers, guild } = createFakeGuild({
      remoteMembers: [{ id: 'u1', roles: ['fss'] }],
      remoteRoles: ['fss'],
    });

    await expect(getMembersByRoleIds(guild, ['fss'])).resolves.toEqual(['u1']);
    await expect(getMembersByRoleIds(guild, ['fss'])).resolves.toEqual(['u1']);

    expect(fetchMembers).toHaveBeenCalledOnce();
  });

  test('deduplicates concurrent guild member fetches for the same guild', async () => {
    const { fetchMembers, guild } = createFakeGuild({
      remoteRoles: ['fss'],
    });

    let resolveFetch!: () => void;
    fetchMembers.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = () => {
          guild.members.cache.set('u1', {
            id: 'u1',
            roles: ['fss'],
          } as never);
          resolve(guild.members.cache as never);
        };
      }),
    );

    const first = getMembersByRoleIds(guild, ['fss']);
    const second = getMembersByRoleIds(guild, ['fss']);

    resolveFetch();

    await expect(Promise.all([first, second])).resolves.toEqual([
      ['u1'],
      ['u1'],
    ]);
    expect(fetchMembers).toHaveBeenCalledOnce();
  });

  test('retries fetching guild members if an earlier fetch failed', async () => {
    const { fetchMembers, guild } = createFakeGuild({
      remoteMembers: [{ id: 'u1', roles: ['fss'] }],
      remoteRoles: ['fss'],
    });

    fetchMembers.mockRejectedValueOnce(new Error('gateway timeout'));

    await expect(getMembersByRoleIds(guild, ['fss'])).rejects.toThrow(
      'gateway timeout',
    );
    await expect(getMembersByRoleIds(guild, ['fss'])).resolves.toEqual(['u1']);
    expect(fetchMembers).toHaveBeenCalledTimes(2);
  });

  test('returns empty immediately when no role IDs are requested', async () => {
    const { fetchMembers, fetchRoles, guild } = createFakeGuild({});

    await expect(getMembersByRoleIds(guild, [])).resolves.toEqual([]);
    expect(fetchRoles).not.toHaveBeenCalled();
    expect(fetchMembers).not.toHaveBeenCalled();
  });
});
