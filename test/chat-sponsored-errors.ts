import assert from 'node:assert/strict';

import type {
  ChatInputCommandInteraction,
  Message,
} from 'discord.js';

import type { StreamEvent } from '@/common/types/StreamEvent.js';
import {
  getConversationHistory,
  registerConversation,
} from '@/modules/chat/utils/conversation.js';
import { clearChatUserCache } from '@/modules/chat/utils/identity.js';
import { handleChatMessage } from '@/modules/chat/utils/reply.js';
import {
  applyStreamEvent,
  invalidateModelCatalog,
  sendPrompt,
} from '@/modules/chat/utils/requests.js';
import { handlePromptWithStreaming } from '@/modules/chat/utils/streaming.js';

const RAW_MESSAGE = 'provider-secret global_limit=100';
const RESET_AT = '2026-07-19T00:00:00Z';
const INVALID_RESET_AT = 'not-a-date';
const USER_ID = '00000000-0000-4000-8000-000000000001';

const errorCases = [
  { code: 'free_quota_exhausted', resets_at: RESET_AT },
  { code: 'free_quota_exhausted', resets_at: INVALID_RESET_AT },
  { code: 'free_tier_unavailable' },
  { code: 'sponsored_request_in_progress' },
] as const;

const sseResponse = (payload: Record<string, string>): Response => {
  const body = `event: error\ndata: ${JSON.stringify(payload)}\n\n`;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'x-response-id': 'response-1' },
    status: 200,
  });
};

const userResponse = (): Response =>
  Response.json({
    id: USER_ID,
    provider: 'discord',
    provider_subject: 'discord-user-1',
  });

const modelCatalogResponse = (): Response =>
  Response.json({ models: [], source: 'driver', version: 1 });

const installFetchQueue = (responses: Response[]) => {
  const queue = [...responses];
  globalThis.fetch = async () => {
    const response = queue.shift();
    assert.ok(response, 'the driver exhausted its mocked fetch queue');
    return response;
  };
};

const streamOptions = {
  messages: [{ content: 'question', role: 'user' as const }],
  user_id: USER_ID,
};

const readContent = (value: unknown): string => {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal('content' in value, true);
  const content = value.content;
  assert.equal(typeof content, 'string');
  return content;
};

const fakeInteraction = () => {
  const state = { replied: false, responses: [] as unknown[] };
  const interaction = {
    channelId: 'channel-1',
    deferred: false,
    editReply: async (payload: unknown) => {
      state.responses.push(payload);
    },
    fetchReply: async () => ({ id: 'interaction-response-1' }),
    guild: null,
    replied: state.replied,
    reply: async (payload: unknown) => {
      state.replied = true;
      interaction.replied = true;
      state.responses.push(payload);
    },
    user: { id: 'discord-user-1' },
  } as unknown as ChatInputCommandInteraction;

  return { interaction, state };
};

const fakeMessage = () => {
  const state = { responses: [] as unknown[] };
  const message = {
    author: {
      avatarURL: () => null,
      bot: false,
      displayName: 'Driver User',
      id: 'discord-user-1',
    },
    channel: {
      isSendable: () => true,
      isThread: () => false,
      sendTyping: async () => undefined,
    },
    channelId: 'channel-1',
    content: 'question',
    guild: null,
    reference: { messageId: 'history-root' },
    reply: async (payload: unknown) => {
      state.responses.push(payload);
      return { edit: async () => undefined, id: 'message-response-1' };
    },
  } as unknown as Message;

  return { message, state };
};

const readSseEvent = async (payload: Record<string, string>) => {
  installFetchQueue([sseResponse(payload)]);
  const events: StreamEvent[] = [];
  await sendPrompt(streamOptions, async (event) => {
    events.push(event);
  });
  assert.equal(events.length, 1);
  return events[0];
};

const run = async () => {
  Reflect.set(globalThis, 'Temporal', {
    Instant: {
      from: (value: string) => {
        if (value !== RESET_AT) {
          throw new Error('invalid test instant');
        }
        return { toLocaleString: () => '19.7.2026, 00:00' };
      },
    },
    Now: { instant: () => ({ toString: () => '2026-07-18 00:00:00Z' }) },
  });
  process.env['CHATBOT_URL'] = 'https://chatbot.example';
  process.env['API_KEY'] = 'driver-key';

  const renderedMessages: string[] = [];
  let validExhaustionMessage = '';
  let invalidExhaustionMessage = '';

  for (const [index, testCase] of errorCases.entries()) {
    invalidateModelCatalog(USER_ID);
    const payload = {
      code: testCase.code,
      message: RAW_MESSAGE,
      ...(testCase.resets_at === undefined
        ? {}
        : { resets_at: testCase.resets_at }),
    };
    const event = await readSseEvent(payload);

    assert.equal(event?.type, 'error');
    if (event?.type !== 'error') {
      throw new Error('the driver expected an error event');
    }
    assert.equal(event.code, testCase.code);
    assert.equal(event.resets_at, testCase.resets_at);

    const interactionDriver = fakeInteraction();
    installFetchQueue([sseResponse(payload)]);
    await handlePromptWithStreaming(
      interactionDriver.interaction,
      streamOptions,
      `driver interaction ${index}`,
    );
    const interactionContent = readContent(interactionDriver.state.responses[0]);

    assert.equal(interactionContent.includes(RAW_MESSAGE), false);
    if (testCase.code === 'free_quota_exhausted' && testCase.resets_at === RESET_AT) {
      assert.equal(interactionContent.includes('UTC'), true);
      validExhaustionMessage = interactionContent;
    }
    if (
      testCase.code === 'free_quota_exhausted' &&
      testCase.resets_at === INVALID_RESET_AT
    ) {
      assert.equal(interactionContent.includes('UTC'), false);
      invalidExhaustionMessage = interactionContent;
    }
    renderedMessages.push(interactionContent);

    clearChatUserCache('discord-user-1');
    registerConversation(['history-root'], []);
    const messageDriver = fakeMessage();
    installFetchQueue([
      userResponse(),
      modelCatalogResponse(),
      sseResponse(payload),
    ]);
    await handleChatMessage(messageDriver.message);
    const messageContent = readContent(messageDriver.state.responses[0]);
    assert.equal(messageContent, interactionContent);
    assert.equal(messageContent.includes(RAW_MESSAGE), false);
    assert.equal(getConversationHistory('message-response-1'), undefined);
    assert.equal(getConversationHistory('interaction-response-1'), undefined);
  }

  assert.equal(renderedMessages.length, 4);
  assert.notEqual(validExhaustionMessage, invalidExhaustionMessage);
  assert.notEqual(renderedMessages[2], renderedMessages[3]);

  const interruptedState = {
    answer: 'partial answer',
    errored: false,
    firstChunkAt: 1,
  };
  applyStreamEvent(interruptedState, {
    code: 'interrupted',
    message: 'partial response interrupted',
    type: 'error',
  });
  assert.equal(interruptedState.errored, false);

  applyStreamEvent(interruptedState, { type: 'reset' });
  assert.equal(interruptedState.answer, '');
  assert.equal(interruptedState.firstChunkAt, null);

  applyStreamEvent(interruptedState, {
    code: 'free_quota_exhausted',
    message: RAW_MESSAGE,
    type: 'error',
  });
  assert.equal(interruptedState.errored, true);
};

await run();
console.log('chat-sponsored-errors driver passed');
