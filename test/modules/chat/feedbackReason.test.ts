import type { ButtonInteraction } from 'discord.js';

import { describe, expect, test, vi } from 'vitest';

import { execute } from '@/modules/chat/commands/button/chatFeedbackReason.js';
import { FeedbackOptionsSchema } from '@/modules/chat/schemas/Chat.js';
import { buildFeedbackReasonModal } from '@/modules/chat/utils/feedback.js';
import { commandErrors } from '@/translations/commands.js';

const fakeInteraction = (userId: string) => ({
  reply: vi.fn<(options: unknown) => Promise<void>>(async () => {}),
  showModal: vi.fn<(modal: unknown) => Promise<void>>(async () => {}),
  user: { id: userId },
});

const base = {
  client: 'discord',
  feedbackType: 'dislike',
  responseId: 'r1',
  userId: '42',
} as const;

describe('feedback reason options', () => {
  test('sends a known reason and a trimmed comment', () => {
    expect(
      FeedbackOptionsSchema.parse({
        ...base,
        comment: '  Стара цена.  ',
        reason: 'outdated',
      }),
    ).toMatchObject({ comment: 'Стара цена.', reason: 'outdated' });
  });

  test('drops an empty comment and rejects an unknown reason', () => {
    expect(
      FeedbackOptionsSchema.parse({ ...base, comment: ' '.repeat(3) }).comment,
    ).toBeUndefined();
    expect(
      FeedbackOptionsSchema.safeParse({ ...base, reason: 'meh' }).success,
    ).toBe(false);
  });
});

describe('feedback reason form', () => {
  test('asks for one reason and an optional comment', () => {
    const modal = buildFeedbackReasonModal('r1').toJSON();
    const [reason, comment] = modal.components as unknown as Array<{
      component: { custom_id: string; options?: unknown[]; required?: boolean };
    }>;

    expect(modal.custom_id).toBe('chatFeedbackReason:r1');
    expect(reason?.component.custom_id).toBe('reason');
    expect(reason?.component.options).toHaveLength(5);
    expect(comment?.component.custom_id).toBe('comment');
    expect(comment?.component.required).toBe(false);
  });

  test('opens only for the person who asked', async () => {
    const asker = fakeInteraction('42');
    const other = fakeInteraction('7');

    await execute(asker as unknown as ButtonInteraction, ['r1', '42']);
    await execute(other as unknown as ButtonInteraction, ['r1', '42']);

    expect(asker.showModal).toHaveBeenCalledOnce();
    expect(other.showModal).not.toHaveBeenCalled();
    expect(other.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: commandErrors.buttonNoPermission }),
    );
  });
});
