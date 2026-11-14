import { expect, test } from 'vitest';

import { localizeStreamEvent } from '@/modules/chat/utils/constants.js';
import { commandErrors } from '@/translations/commands.js';

test.each([
  ['interrupted', commandErrors.answerInterrupted],
  ['no_answer', commandErrors.noAnswer],
  ['agent_error', commandErrors.agentError],
  ['something_new', commandErrors.unknownChatError],
])('words the %s stream error for users', (code, message) => {
  expect(
    localizeStreamEvent({ code, message: 'raw API text', type: 'error' }),
  ).toStrictEqual({ code, message, type: 'error' });
});

