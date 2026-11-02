import { describe, expect, test } from 'vitest';

import { applyStreamEvent } from '@/modules/chat/utils/requests.js';

describe('stream accumulator', () => {
  test('preserves a partial answer when a stream is interrupted', () => {
    const state = {
      answer: 'partial answer',
      errored: false,
    };

    applyStreamEvent(state, {
      code: 'interrupted',
      message: 'partial response interrupted',
      type: 'error',
    });

    expect(state.errored).toBe(false);
  });

  test('clears the answer when a stream resets', () => {
    const state = {
      answer: 'partial answer',
      errored: false,
    };

    applyStreamEvent(state, { type: 'reset' });

    expect(state.answer).toBe('');
  });

  test('marks sponsored quota errors as terminal', () => {
    const state = {
      answer: '',
      errored: false,
    };

    applyStreamEvent(state, {
      code: 'free_quota_exhausted',
      message: 'safe quota message',
      type: 'error',
    });

    expect(state.errored).toBe(true);
  });
});
