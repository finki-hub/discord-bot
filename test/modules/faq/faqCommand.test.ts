import { type ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { Question } from '@/modules/faq/schemas/Question.js';

import { getCommonCommand } from '@/modules/faq/utils/faqCommand.js';
import { commandResponseFunctions } from '@/translations/commands.js';

const mocks = vi.hoisted(() => ({
  getClosestQuestion:
    vi.fn<() => Promise<null | Pick<Question, 'content' | 'links' | 'name'>>>(),
}));

vi.mock('@/modules/faq/utils/search.js', () => ({
  getClosestQuestion: mocks.getClosestQuestion,
}));

const createInteraction = (userId: null | string = null) => {
  const editReply = vi.fn<(payload: unknown) => Promise<void>>(async () => {});
  const followUp = vi.fn<(payload: unknown) => Promise<void>>(async () => {});
  const interaction = {
    deferred: true,
    editReply,
    followUp,
    options: {
      getString: () => 'FAQ',
      getUser: () => (userId ? { id: userId } : null),
    },
  } as unknown as ChatInputCommandInteraction;

  return { editReply, followUp, interaction };
};

const setQuestion = (content: string, links: Question['links'] = null) => {
  mocks.getClosestQuestion.mockResolvedValue({
    content,
    links,
    name: 'FAQ',
  });
};

describe('/faq long answers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('keeps components at the combined 4000-character boundary', async () => {
    setQuestion('a'.repeat(3_994));
    const { editReply, followUp, interaction } = createInteraction();

    await getCommonCommand('faq').execute(interaction);

    expect(editReply).toHaveBeenCalledWith({
      allowedMentions: { parse: [], users: [] },
      components: [expect.anything()],
      flags: MessageFlags.IsComponentsV2,
    });
    expect(followUp).not.toHaveBeenCalled();
  });

  test.each([3_995, 4_281])(
    'sends a %i-character answer in full through the existing reply helper',
    async (length: number) => {
      const content = 'а'.repeat(length);
      setQuestion(content, {
        '': 'ignored.example',
        Guide: 'example.com/guide',
      });
      const { editReply, followUp, interaction } = createInteraction();

      await getCommonCommand('faq').execute(interaction);

      const payloads = [...editReply.mock.calls, ...followUp.mock.calls].map(
        ([payload]) => payload as { content: string; flags?: number },
      );
      expect(followUp).toHaveBeenCalled();
      expect(payloads.map((payload) => payload.content).join('')).toBe(
        `## FAQ\n\n${content}\n\n[Guide](https://example.com/guide)`,
      );
      for (const payload of payloads) {
        expect(payload.content.length).toBeLessThanOrEqual(2_000);
        expect(payload.flags).toBeUndefined();
      }
    },
  );

  test('includes mention overhead in the budget and sends the mention once', async () => {
    setQuestion('a'.repeat(3_994));
    const userId = '123456789012345678';
    const { editReply, followUp, interaction } = createInteraction(userId);

    await getCommonCommand('faq').execute(interaction);

    const contents = [...editReply.mock.calls, ...followUp.mock.calls].map(
      ([payload]) => (payload as { content: string }).content,
    );
    expect(contents[0]).toBe(
      `${commandResponseFunctions.commandFor(userId)}\n\n## FAQ\n\n`,
    );
    expect(contents.join('').split(`<@${userId}>`)).toHaveLength(2);
    expect(followUp).toHaveBeenCalled();
  });
});
