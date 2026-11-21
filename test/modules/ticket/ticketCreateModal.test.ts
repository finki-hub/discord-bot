import { expect, test } from 'vitest';

import { shouldDeferCommand } from '@/core/commands/interactionHandlerUtils.js';
import { name as modalName } from '@/modules/ticket/commands/modal/ticketCreate.js';
import {
  getTicketCreateModal,
  TICKET_CREATE_MODAL_ID,
  TICKET_DESCRIPTION_FIELD,
  TICKET_TITLE_FIELD,
} from '@/modules/ticket/components/components.js';

test('builds the ticket modal with a stable custom id and both fields', () => {
  expect(modalName).toBe(TICKET_CREATE_MODAL_ID);

  const modal = getTicketCreateModal('support').toJSON();
  expect(modal.custom_id).toBe(`${TICKET_CREATE_MODAL_ID}:support`);
  expect(JSON.stringify(modal)).toContain(TICKET_TITLE_FIELD);
  expect(JSON.stringify(modal)).toContain(TICKET_DESCRIPTION_FIELD);
});

test('does not defer the ticket create button before showing the modal', () => {
  expect(shouldDeferCommand('ticketCreate')).toBe(false);
});
