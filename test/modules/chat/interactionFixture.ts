import type { ChatInputCommandInteraction } from 'discord.js';

export type InteractionCall = {
  readonly kind: InteractionCallKind;
  readonly payload: unknown;
};
export type InteractionCallKind = 'defer' | 'edit' | 'followUp' | 'reply';
export type InteractionState = {
  deferred: boolean;
  replied: boolean;
  readonly calls: InteractionCall[];
  readonly requestOrder: string[];
};

export const fakeInteraction = (
  commandName: string,
  subcommand: string,
  userId: string,
): {
  readonly interaction: ChatInputCommandInteraction;
  readonly state: InteractionState;
} => {
  const state: InteractionState = {
    calls: [],
    deferred: false,
    replied: false,
    requestOrder: [],
  };
  const interaction = {
    commandName,
    guild: null,
    guildId: null,
    get deferred() {
      return state.deferred;
    },
    get replied() {
      return state.replied;
    },
    options: {
      getSubcommand: () => subcommand,
    },
    user: {
      avatarURL: () => null,
      displayName: 'Privacy Test',
      id: userId,
      tag: 'Privacy Test',
    },
    deferReply: (payload: unknown) => {
      state.deferred = true;
      state.calls.push({ kind: 'defer', payload });
      state.requestOrder.push('defer');
      return Promise.resolve();
    },
    editReply: (payload: unknown) => {
      state.calls.push({ kind: 'edit', payload });
      return Promise.resolve({ id: 'edit-response' });
    },
    followUp: (payload: unknown) => {
      state.calls.push({ kind: 'followUp', payload });
      return Promise.resolve({ id: `follow-up-${state.calls.length}` });
    },
    reply: (payload: unknown) => {
      state.replied = true;
      state.calls.push({ kind: 'reply', payload });
      return Promise.resolve({ id: 'reply-response' });
    },
    fetchReply: () => Promise.resolve({ id: 'reply-response' }),
  } as unknown as ChatInputCommandInteraction;

  return { interaction, state };
};

export const callsOf = (
  state: InteractionState,
  kind: InteractionCallKind,
): readonly InteractionCall[] =>
  state.calls.filter((call) => call.kind === kind);

export const jsonResponse = (body: unknown): Response => Response.json(body);

export const payloadFlags = (payload: unknown): unknown => {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('flags' in payload)
  ) {
    return undefined;
  }
  return payload.flags;
};

export const requestUrl = (input: Parameters<typeof fetch>[0]): URL => {
  if (typeof input === 'string') {
    return new URL(input);
  }
  if (input instanceof URL) {
    return input;
  }
  return new URL(input.url);
};
