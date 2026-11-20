import { ApplicationCommandType } from 'discord.js';
import { expect, test } from 'vitest';

import {
  data,
  ephemeral,
  name,
} from '@/modules/chat/commands/context/promptPrivate.js';

test('exposes an ephemeral message context command', () => {
  expect(name).toBe('Prompt Privately');
  expect(ephemeral).toBe(true);
  expect(data.toJSON()).toMatchObject({
    name,
    type: ApplicationCommandType.Message,
  });
});
