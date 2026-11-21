import { expect, test } from 'vitest';

import type { Ticket } from '@/modules/ticket/schemas/Ticket.js';

import { findTicketTypeByThreadName } from '@/modules/ticket/utils/tickets.js';

const SUPPORT: Ticket = {
  id: 'support',
  name: 'Поддршка',
  roles: [],
};
const TECHNICAL_SUPPORT: Ticket = {
  id: 'technical-support',
  name: 'Техничка - поддршка',
  roles: [],
};
const TICKETS = [SUPPORT, TECHNICAL_SUPPORT];

test('resolves the type from a legacy thread name', () => {
  expect(findTicketTypeByThreadName('requester#0001 - Поддршка', TICKETS)).toBe(
    SUPPORT,
  );
});

test('resolves a type whose name contains the separator from a legacy name', () => {
  expect(
    findTicketTypeByThreadName('requester#0001 - Техничка - поддршка', TICKETS),
  ).toBe(TECHNICAL_SUPPORT);
});

test('resolves the type from a title-based thread name', () => {
  expect(
    findTicketTypeByThreadName(
      'Не можам да го отворам предметот - requester#0001 - Поддршка',
      TICKETS,
    ),
  ).toBe(SUPPORT);
});

test('resolves a type whose name contains the separator from a title-based name', () => {
  expect(
    findTicketTypeByThreadName(
      'Не можам да го отворам предметот - requester#0001 - Техничка - поддршка',
      TICKETS,
    ),
  ).toBe(TECHNICAL_SUPPORT);
});

test('prefers the longest configured type that matches the suffix', () => {
  expect(
    findTicketTypeByThreadName(
      'Наслов - requester#0001 - Техничка - поддршка',
      TICKETS,
    ),
  ).toBe(TECHNICAL_SUPPORT);
});
