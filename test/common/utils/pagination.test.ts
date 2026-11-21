import {
  type ButtonInteraction,
  ContainerBuilder,
  MessageFlags,
} from 'discord.js';
import { describe, expect, test, vi } from 'vitest';

import { handlePagination } from '@/common/utils/pagination.js';
import { commandErrors } from '@/translations/commands.js';

const OWNER_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_ID = '00000000-0000-4000-8000-000000000002';

const fakeButtonInteraction = (
  userId: string,
  { deferred = false }: { deferred?: boolean } = {},
) => {
  const update = vi.fn<(payload: unknown) => Promise<void>>(async () => {});
  const editReply = vi.fn<(payload: unknown) => Promise<void>>(async () => {});
  const reply = vi.fn<(payload: unknown) => Promise<void>>(async () => {});
  const followUp = vi.fn<(payload: unknown) => Promise<void>>(async () => {});

  const interaction = {
    deferred,
    editReply,
    followUp,
    message: {
      interactionMetadata: { user: { id: OWNER_ID } },
    },
    replied: false,
    reply,
    update,
    user: { id: userId },
  } as unknown as ButtonInteraction;

  return { editReply, followUp, interaction, reply, update };
};

const component = new ContainerBuilder();

const paginationArguments = {
  entries: [],
  getComponent: () => component,
  paginationArguments: ['page', '1'],
};

describe('pagination handler', () => {
  test('updates the message in place when the interaction is not deferred', async () => {
    const { editReply, interaction, update } = fakeButtonInteraction(OWNER_ID);

    await handlePagination({ ...paginationArguments, interaction });

    expect(update).toHaveBeenCalledWith({
      components: [component],
      flags: MessageFlags.IsComponentsV2,
    });
    expect(editReply).not.toHaveBeenCalled();
  });

  test('edits the deferred response when the caller acknowledged the click', async () => {
    const { editReply, interaction, update } = fakeButtonInteraction(OWNER_ID, {
      deferred: true,
    });

    await handlePagination({ ...paginationArguments, interaction });

    expect(editReply).toHaveBeenCalledWith({
      components: [component],
      flags: MessageFlags.IsComponentsV2,
    });
    expect(update).not.toHaveBeenCalled();
  });

  test('rejects page clicks from users other than the original invoker', async () => {
    const { editReply, interaction, reply, update } =
      fakeButtonInteraction(OTHER_ID);

    await handlePagination({ ...paginationArguments, interaction });

    expect(reply).toHaveBeenCalledWith({
      content: commandErrors.buttonNoPermission,
      flags: MessageFlags.Ephemeral,
    });
    expect(update).not.toHaveBeenCalled();
    expect(editReply).not.toHaveBeenCalled();
  });
});
