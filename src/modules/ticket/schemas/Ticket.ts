import { z } from 'zod';

import { MAX_TICKET_NAME_LENGTH } from '../utils/constants.js';

export const TicketSchema = z.object({
  description: z.string().optional(),
  id: z.string(),
  name: z.string(),
  roles: z.array(z.string()),
});

export type Ticket = z.infer<typeof TicketSchema>;

// Applied only when saving through `/config set`. TicketSchema also parses the
// config file, where one long name would invalidate the whole configuration.
export const TicketNamesSchema = z.object({
  tickets: z
    .array(z.object({ name: z.string().max(MAX_TICKET_NAME_LENGTH) }))
    .optional(),
});
