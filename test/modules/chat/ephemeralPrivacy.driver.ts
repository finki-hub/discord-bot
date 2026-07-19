import assert from 'node:assert/strict';

import {
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { shouldDeferCommand } from '../../../src/core/commands/interactionHandlerUtils.js';
import { safeReplyToInteraction } from '../../../src/common/utils/messages.js';
import { execute as executeChat } from '../../../src/modules/chat/commands/chat/chat.js';
import { execute as executeCredentials } from '../../../src/modules/chat/commands/chat/credentials.js';
import { clearChatUserCache } from '../../../src/modules/chat/utils/identity.js';
import { invalidateModelCatalog } from '../../../src/modules/chat/utils/requests.js';
import { handlePromptWithStreaming } from '../../../src/modules/chat/utils/streaming.js';

const CREDENTIAL_USER_ID = '00000000-0000-4000-8000-000000000002';
const MODEL_USER_ID = '00000000-0000-4000-8000-000000000003';

type CallKind = 'defer' | 'edit' | 'followUp' | 'reply';
type Call = {
  readonly kind: CallKind;
  readonly payload: unknown;
};
type InteractionState = {
  deferred: boolean;
  replied: boolean;
  readonly calls: Call[];
  readonly requestOrder: string[];
};

const fakeInteraction = (
  commandName: string,
  subcommand: string,
  userId: string,
): { readonly interaction: ChatInputCommandInteraction; readonly state: InteractionState } => {
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
      displayName: 'Privacy Driver',
      id: userId,
      tag: 'Privacy Driver',
    },
    deferReply: async (payload: unknown) => {
      state.deferred = true;
      state.calls.push({ kind: 'defer', payload });
      state.requestOrder.push('defer');
    },
    editReply: async (payload: unknown) => {
      state.calls.push({ kind: 'edit', payload });
      return { id: 'edit-response' };
    },
    followUp: async (payload: unknown) => {
      state.calls.push({ kind: 'followUp', payload });
      return { id: `follow-up-${state.calls.length}` };
    },
    reply: async (payload: unknown) => {
      state.replied = true;
      state.calls.push({ kind: 'reply', payload });
      return { id: 'reply-response' };
    },
    fetchReply: async () => ({ id: 'reply-response' }),
  } as unknown as ChatInputCommandInteraction;

  return { interaction, state };
};

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });

const streamErrorResponse = (): Response =>
  new Response(
    'event: error\ndata: {"code":"free_tier_unavailable","message":"provider secret"}\n\n',
    { headers: { 'Content-Type': 'text/event-stream' }, status: 200 },
  );

const payloadFlags = (payload: unknown): unknown => {
  if (typeof payload !== 'object' || payload === null || !('flags' in payload)) {
    return undefined;
  }

  return payload.flags;
};

const callsOf = (state: InteractionState, kind: CallKind): readonly Call[] =>
  state.calls.filter((call) => call.kind === kind);

const assertEphemeral = (calls: readonly Call[]): void => {
  assert.ok(calls.length > 0);
  for (const call of calls) {
    assert.equal(payloadFlags(call.payload), MessageFlags.Ephemeral);
  }
};

const credentialPayload = () =>
  ['anthropic', 'google', 'ollama', 'openai'].map((provider) => ({
    base_url: `https://${provider}.${'x'.repeat(490)}.invalid`,
    has_api_key: true,
    provider,
  }));

const modelPayload = () => ({
  models: Array.from({ length: 25 }, (_, index) => ({
    availability: index === 0 ? 'sponsored' : 'byok',
    id: `model-${index}-${'x'.repeat(50)}`,
    name: `Model ${index} ${'x'.repeat(80)}`,
    provider: 'openai',
    ...(index === 0 && {
      sponsored_quota: {
        limit: 5,
        remaining: 4,
        resets_at: '2026-07-19T00:00:00Z',
      },
    }),
  })),
  source: 'driver',
  version: 1,
});

const run = async (): Promise<void> => {
  const originalFetch = globalThis.fetch;
  const originalChatbotUrl = process.env['CHATBOT_URL'];
  const originalApiKey = process.env['API_KEY'];

  process.env['CHATBOT_URL'] = 'https://chatbot.invalid';
  process.env['API_KEY'] = 'driver-api-key';

  try {
    assert.equal(shouldDeferCommand('chat models'), false);
    assert.equal(shouldDeferCommand('chat closest'), true);

    const directPrivate = fakeInteraction('chat', 'models', MODEL_USER_ID);
    await safeReplyToInteraction(
      directPrivate.interaction,
      'private '.repeat(1_000),
      { ephemeral: true },
    );
    assertEphemeral(directPrivate.state.calls);

    const publicSplit = fakeInteraction('chat', 'closest', MODEL_USER_ID);
    await safeReplyToInteraction(publicSplit.interaction, 'public '.repeat(1_000));
    assert.equal(callsOf(publicSplit.state, 'reply').length, 1);
    assert.ok(callsOf(publicSplit.state, 'followUp').length > 0);
    for (const call of publicSplit.state.calls) {
      assert.equal(payloadFlags(call.payload), undefined);
    }

    clearChatUserCache(CREDENTIAL_USER_ID);
    const credentialDriver = fakeInteraction(
      'credentials',
      'list',
      CREDENTIAL_USER_ID,
    );
    globalThis.fetch = async (input) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (url.pathname === '/chat/state/users') {
        credentialDriver.state.requestOrder.push('identity');
        return jsonResponse({
          id: CREDENTIAL_USER_ID,
          provider: 'discord',
          provider_subject: 'privacy-driver',
        });
      }
      if (url.pathname.endsWith('/credentials')) {
        return jsonResponse(credentialPayload());
      }
      throw new Error(`Unexpected credential request URL: ${url}`);
    };
    await executeCredentials(credentialDriver.interaction);
    assert.equal(
      payloadFlags(credentialDriver.state.calls[0]?.payload),
      MessageFlags.Ephemeral,
    );
    assert.equal(callsOf(credentialDriver.state, 'edit').length, 1);
    assert.ok(callsOf(credentialDriver.state, 'followUp').length > 0);
    assertEphemeral(callsOf(credentialDriver.state, 'followUp'));

    clearChatUserCache(MODEL_USER_ID);
    invalidateModelCatalog(MODEL_USER_ID);
    const modelDriver = fakeInteraction('chat', 'models', MODEL_USER_ID);
    globalThis.fetch = async (input) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (url.pathname === '/chat/state/users') {
        modelDriver.state.requestOrder.push('identity');
        return jsonResponse({
          id: MODEL_USER_ID,
          provider: 'discord',
          provider_subject: 'privacy-driver',
        });
      }
      if (url.pathname === '/chat/models') {
        modelDriver.state.requestOrder.push('catalog');
        return jsonResponse(modelPayload());
      }
      if (url.pathname === '/chat/') {
        return streamErrorResponse();
      }
      throw new Error(`Unexpected model request URL: ${url}`);
    };
    await executeChat(modelDriver.interaction);
    assert.deepEqual(modelDriver.state.requestOrder, [
      'defer',
      'identity',
      'catalog',
    ]);
    assert.equal(
      payloadFlags(modelDriver.state.calls[0]?.payload),
      MessageFlags.Ephemeral,
    );
    assert.equal(callsOf(modelDriver.state, 'edit').length, 1);
    assert.ok(callsOf(modelDriver.state, 'followUp').length > 0);
    assertEphemeral(callsOf(modelDriver.state, 'followUp'));

    const streamDriver = fakeInteraction('ask', 'query', MODEL_USER_ID);
    await streamDriver.interaction.deferReply();
    await handlePromptWithStreaming(
      streamDriver.interaction,
      {
        interface: 'discord',
        messages: [{ content: 'question', role: 'user' }],
        user_id: MODEL_USER_ID,
      },
      'ephemeral stream guidance',
    );
    assert.equal(callsOf(streamDriver.state, 'reply').length, 0);
    assert.equal(callsOf(streamDriver.state, 'edit').length, 1);
    assertEphemeral(callsOf(streamDriver.state, 'followUp'));

    console.log('ephemeralPrivacy driver passed');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalChatbotUrl === undefined) {
      delete process.env['CHATBOT_URL'];
    } else {
      process.env['CHATBOT_URL'] = originalChatbotUrl;
    }
    if (originalApiKey === undefined) {
      delete process.env['API_KEY'];
    } else {
      process.env['API_KEY'] = originalApiKey;
    }
  }
};

await run();
