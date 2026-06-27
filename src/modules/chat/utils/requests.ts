import { createParser } from 'eventsource-parser';
import { z } from 'zod';

import type { StreamEvent } from '@/common/types/StreamEvent.js';

import { logger } from '@/common/logger/index.js';
import { getApiKey, getChatbotUrl } from '@/configuration/environment.js';
import { QuestionsSchema } from '@/modules/faq/schemas/Question.js';
import { labels } from '@/translations/labels.js';

import type {
  ClosestQuestionsOptions,
  FeedbackOptions,
  FillEmbeddingsOptions,
  SendPromptOptions,
  UnembeddedQuestionsOptions,
} from '../schemas/Chat.js';

import { sanitizeOptions } from './utils.js';

// Await each event so the consumer finishes sending/editing its reply before the
// stream ends; firing them off unawaited lets the final flush race the in-flight
// reply and post a duplicate message.
const drainEvents = async (
  pending: StreamEvent[],
  onEvent: (event: StreamEvent) => Promise<void>,
) => {
  while (pending.length > 0) {
    const event = pending.shift();
    if (event !== undefined) {
      await onEvent(event);
    }
  }
};

// fillEmbeddings streams plain text (no control events), so it keeps a string drain.
const drainChunks = async (
  pending: string[],
  onChunk: (chunk: string) => Promise<void>,
) => {
  while (pending.length > 0) {
    const chunk = pending.shift();
    if (chunk !== undefined) {
      await onChunk(chunk);
    }
  }
};

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const toStreamEvent = (sse: {
  data: string;
  event?: string | undefined;
}): null | StreamEvent => {
  const name = sse.event ?? '';
  if (name === '' || name === 'message') {
    // A bare `data:` frame (GPU passthrough) is answer text; the upstream escapes
    // newlines as a literal "\n".
    return { text: sse.data.replaceAll(String.raw`\n`, '\n'), type: 'token' };
  }

  const parsePayload = (): Record<string, unknown> => {
    try {
      const parsed = JSON.parse(sse.data) as unknown;
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  };

  const payload = parsePayload();

  switch (name) {
    case 'done':
      return { type: 'done' };
    case 'error':
      return {
        code: asString(payload['code'], 'error'),
        message: asString(payload['message']),
        type: 'error',
      };
    case 'reset':
      return { type: 'reset' };
    case 'status': {
      const event: Extract<StreamEvent, { type: 'status' }> = {
        label: asString(payload['label']),
        type: 'status',
      };
      const state = asString(payload['state']);
      if (state) {
        event.state = state;
      }
      const tool = asString(payload['tool']);
      if (tool) {
        event.tool = tool;
      }
      return event;
    }
    case 'thinking':
      return { text: asString(payload['text']), type: 'thinking' };
    case 'token':
      return { text: asString(payload['text']), type: 'token' };
    default:
      return null;
  }
};

export type StreamAccumulator = {
  answer: string;
  errored: boolean;
  firstChunkAt: null | number;
};

export const applyStreamEvent = (
  state: StreamAccumulator,
  event: StreamEvent,
): void => {
  switch (event.type) {
    case 'done':
      break;
    case 'error':
      state.errored = true;
      break;
    case 'reset':
      state.answer = '';
      state.firstChunkAt = null; // so TTFT tracks the post-tool answer, not a preamble
      break;
    case 'status':
      break;
    case 'thinking':
      // Reasoning is display-only: it must not enter the saved answer or count
      // toward time-to-first-token, which tracks the first answer token.
      break;
    case 'token':
      state.firstChunkAt ??= Date.now();
      state.answer += event.text;
      break;
  }
};

export const hasSavableAnswer = (state: StreamAccumulator): boolean =>
  state.answer.length > 0 && !state.errored;

export const sendPrompt = async (
  options: SendPromptOptions,
  onEvent: (event: StreamEvent) => Promise<void>,
) => {
  const chatbotUrl = getChatbotUrl();

  if (chatbotUrl === null) {
    throw new Error('LLM_DISABLED');
  }

  const result = await fetch(`${chatbotUrl}/chat/`, {
    body: JSON.stringify(sanitizeOptions(options)),
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (result.status === 503) {
    const text = await result.text();

    if (text.includes('not ready')) {
      throw new Error('LLM_NOT_READY');
    }

    throw new Error('LLM_UNAVAILABLE');
  }

  if (!result.ok || !result.body || result.status !== 200) {
    throw new Error('LLM_UNAVAILABLE');
  }

  const responseId = result.headers.get('x-response-id');

  let receivedEvents = 0;
  const pendingEvents: StreamEvent[] = [];

  const parser = createParser({
    onEvent: (sse) => {
      receivedEvents++;
      const event = toStreamEvent(sse);
      if (event !== null) {
        pendingEvents.push(event);
      }
    },
  });

  const reader: ReadableStreamDefaultReader<Uint8Array> =
    result.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parser.feed(decoder.decode(value, { stream: true }));
    await drainEvents(pendingEvents, onEvent);
  }

  if (receivedEvents === 0) {
    throw new Error('LLM_UNAVAILABLE');
  }

  logger.info(`Prompt answered: ${options.messages.at(-1)?.content ?? ''}`);

  return responseId;
};

export const sendFeedback = async (
  options: FeedbackOptions,
): Promise<boolean> => {
  const chatbotUrl = getChatbotUrl();
  const apiKey = getApiKey();

  if (chatbotUrl === null || apiKey === null) {
    logger.error('Cannot send feedback: chatbot URL or API key not configured');

    return false;
  }

  try {
    const result = await fetch(`${chatbotUrl}/chat/feedback`, {
      body: JSON.stringify(sanitizeOptions(options)),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      method: 'POST',
    });

    if (!result.ok) {
      logger.error(`Failed sending feedback: HTTP ${result.status}`);

      return false;
    }

    return true;
  } catch (error) {
    logger.error(`Failed sending feedback\n${String(error)}`);

    return false;
  }
};

export const getClosestQuestions = async (options: ClosestQuestionsOptions) => {
  const chatbotUrl = getChatbotUrl();

  if (chatbotUrl === null) {
    return null;
  }

  const url = new URL(`${chatbotUrl}/questions/closest`);

  const sanitizedOptions = sanitizeOptions(options);

  for (const [key, value] of Object.entries(sanitizedOptions)) {
    if (value !== undefined) {
      url.searchParams.append(key, String(value));
    }
  }

  try {
    const result = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!result.ok || !result.body || result.status !== 200) {
      return null;
    }

    return QuestionsSchema.parse(await result.json());
  } catch (error) {
    logger.error(`Failed getting closest questions\n${String(error)}`);
    return null;
  }
};

export const getSupportedModels = async () => {
  const chatbotUrl = getChatbotUrl();

  if (chatbotUrl === null) {
    return null;
  }

  try {
    const result = await fetch(`${chatbotUrl}/chat/models`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!result.ok || !result.body || result.status !== 200) {
      return null;
    }

    return z.array(z.string()).parse(await result.json());
  } catch (error) {
    logger.error(`Failed getting supported models\n${String(error)}`);
    return null;
  }
};

export const fillEmbeddings = async (
  options: FillEmbeddingsOptions,
  onChunk: (chunk: string) => Promise<void>,
) => {
  const chatbotUrl = getChatbotUrl();
  const apiKey = getApiKey();

  if (chatbotUrl === null || apiKey === null) {
    throw new Error('LLM_UNAVAILABLE');
  }

  const result = await fetch(`${chatbotUrl}/questions/fill`, {
    body: JSON.stringify(sanitizeOptions(options)),
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    method: 'POST',
  });

  if (!result.ok || !result.body || result.status !== 200) {
    throw new Error('LLM_UNAVAILABLE');
  }

  const pendingChunks: string[] = [];
  const parser = createParser({
    onEvent: (event) => {
      pendingChunks.push(event.data);
    },
  });

  let hasChunks = false;

  const reader: ReadableStreamDefaultReader<Uint8Array> =
    result.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    hasChunks = true;
    parser.feed(decoder.decode(value, { stream: true }));
    await drainChunks(pendingChunks, onChunk);
  }

  if (!hasChunks) {
    parser.feed(`data: ${labels.none}\n\n`);
    await drainChunks(pendingChunks, onChunk);
  }

  logger.info(
    `Embeddings filled for model ${options.embeddings_model ?? 'ALL'}`,
  );
};

export const getUnembeddedQuestions = async (
  options: UnembeddedQuestionsOptions,
) => {
  const chatbotUrl = getChatbotUrl();

  if (chatbotUrl === null) {
    logger.error(
      'Failed getting unembedded questions: chatbot URL not configured',
    );
    return null;
  }

  const url = new URL(`${chatbotUrl}/questions/unfilled`);

  const sanitizedOptions = sanitizeOptions(options);

  for (const [key, value] of Object.entries(sanitizedOptions)) {
    if (value !== undefined) {
      url.searchParams.append(key, value);
    }
  }

  try {
    const result = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!result.ok || !result.body || result.status !== 200) {
      logger.error(
        `Failed getting unembedded questions: HTTP ${result.status} ${result.statusText}`,
      );
      return null;
    }

    return QuestionsSchema.parse(await result.json());
  } catch (error) {
    logger.error(`Failed getting unembedded questions\n${String(error)}`);
    return null;
  }
};
