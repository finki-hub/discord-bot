/* eslint-disable camelcase -- SSE error codes use snake_case */
import type { StreamEvent } from '@/common/types/StreamEvent.js';

import {
  commandErrorFunctions,
  commandErrors,
} from '@/translations/commands.js';

export const LLM_ERRORS: Record<string, string> = {
  credential_required: commandErrors.credentialRequired,
  free_tier_unavailable: commandErrors.freeTierUnavailable,
  LLM_DISABLED: commandErrors.llmDisabled,
  LLM_NOT_READY: commandErrors.llmNotReady,
  LLM_UNAVAILABLE: commandErrors.llmUnavailable,
  sponsored_request_in_progress: commandErrors.sponsoredRequestInProgress,
} as const;

const assertNever = (value: never): never => {
  throw new Error(`Unexpected stream event: ${JSON.stringify(value)}`);
};

export const localizeStreamEvent = (event: StreamEvent): StreamEvent => {
  switch (event.type) {
    case 'done':
      return event;
    case 'error': {
      const message =
        event.code === 'free_quota_exhausted'
          ? commandErrorFunctions.freeQuotaExhausted(event.resets_at)
          : (LLM_ERRORS[event.code] ?? commandErrors.unknownChatError);

      return { ...event, message };
    }
    case 'reset':
    case 'status':
    case 'thinking':
    case 'token':
      return event;
    default:
      return assertNever(event);
  }
};
