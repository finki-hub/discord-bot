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
// Saved names stay valid so they do not block edits to the rest of the value.
export const getTicketNamesSchema = (savedNames: ReadonlySet<string>) =>
  z.object({
    tickets: z
      .array(
        z.object({
          name: z
            .string()
            .refine(
              (name) =>
                name.length <= MAX_TICKET_NAME_LENGTH || savedNames.has(name),
              `Ticket names may have at most ${MAX_TICKET_NAME_LENGTH} characters`,
            ),
        }),
      )
      .optional(),
  });
