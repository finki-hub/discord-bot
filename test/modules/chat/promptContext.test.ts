import { ApplicationCommandType } from 'discord.js';
import { expect, test } from 'vitest';

import * as publicPrompt from '@/modules/chat/commands/context/prompt.js';
import {
  ephemeral,
  data as privateData,
  name as privateName,
} from '@/modules/chat/commands/context/promptPrivate.js';

test('exposes an ephemeral message context command', () => {
  expect(privateName).toBe('Prompt Privately');
  expect(ephemeral).toBe(true);
  expect(privateData.toJSON()).toMatchObject({
    name: privateName,
    type: ApplicationCommandType.Message,
  });
});

test('keeps the existing prompt context command public', () => {
  expect(publicPrompt.name).toBe('Prompt');
  expect('ephemeral' in publicPrompt).toBe(false);
});
