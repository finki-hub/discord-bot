/* eslint-disable camelcase -- SSE error codes use snake_case */
import { commandErrors } from '@/translations/commands.js';

export const LLM_ERRORS: Record<string, string> = {
  credential_required: commandErrors.credentialRequired,
  LLM_DISABLED: commandErrors.llmDisabled,
  LLM_NOT_READY: commandErrors.llmNotReady,
  LLM_UNAVAILABLE: commandErrors.llmUnavailable,
} as const;
