/* eslint-disable import-x/no-unresolved -- the SDK's subpath exports resolve in TypeScript, not in the import plugin */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
// pubapi serves MCP over SSE only, so the deprecated SSE transport it is.
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
/* eslint-enable import-x/no-unresolved -- only the two SDK imports above */
import { z } from 'zod';

import { logger } from '@/common/logger/index.js';
import { getPubapiApiKey, getPubapiUrl } from '@/configuration/environment.js';

// A staff member's consultations of the coming week, from FINKI's public
// APIs (pubapi), which serve them as an MCP tool. Without a key, or when
// pubapi does not answer, the card keeps only its link.

const CONSULTATIONS_TIMEOUT_MS = 8_000;
const CONSULTATIONS_TTL_MS = 15 * 60 * 1_000;
const SKOPJE_TIME_ZONE = 'Europe/Skopje';

const SlotSchema = z.object({
  Classroom: z.string().nullish(),
  dateFormatted: z.string(),
  Day: z.string().nullish(),
  DeactivatedStr: z.array(z.string()).nullish(),
  TimeFrom: z.string(),
  TimeTo: z.string(),
});

export type Consultation = {
  // DD-MM-YYYY, as pubapi writes it.
  date: string;
  day: string;
  from: string;
  room: string;
  to: string;
};

type RawSlot = z.infer<typeof SlotSchema>;

// DD-MM-YYYY as YYYY-MM-DD, so dates sort and compare as text.
const sortableDate = (date: string) => date.split('-').toReversed().join('-');

// Today in Skopje as YYYY-MM-DD.
const todayInSkopje = () =>
  Temporal.Now.plainDateISO(SKOPJE_TIME_ZONE).toString();

// The slots from today on, by date and time, without cancelled ones, with
// back-to-back slots in the same room joined into one.
export const toConsultations = (
  slots: readonly RawSlot[],
  today = todayInSkopje(),
): Consultation[] => {
  const sorted = slots
    .filter(
      (slot) =>
        sortableDate(slot.dateFormatted) >= today &&
        !(slot.DeactivatedStr ?? []).includes(slot.dateFormatted),
    )
    .map((slot) => ({
      date: slot.dateFormatted,
      day: slot.Day ?? '',
      from: slot.TimeFrom,
      room: slot.Classroom ?? '',
      to: slot.TimeTo,
    }))
    .toSorted((left, right) => {
      const leftKey = `${sortableDate(left.date)} ${left.from}`;
      const rightKey = `${sortableDate(right.date)} ${right.from}`;

      if (leftKey === rightKey) {
        return 0;
      }

      return leftKey < rightKey ? -1 : 1;
    });

  const joined: Consultation[] = [];

  for (const slot of sorted) {
    const previous = joined.at(-1);

    if (
      previous?.date === slot.date &&
      previous.room === slot.room &&
      previous.to === slot.from
    ) {
      joined[joined.length - 1] = { ...previous, to: slot.to };
    } else {
      joined.push(slot);
    }
  }

  return joined;
};

const readSlots = async (name: string, url: string, apiKey: string) => {
  const headers = { 'X-Api-Key': apiKey };
  const transport = new SSEClientTransport(new URL(url), {
    eventSourceInit: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          headers: { ...init.headers, ...headers },
        }),
    },
    requestInit: { headers },
  });
  const client = new Client({
    name: 'finki-hub-discord-bot',
    version: '1.0.0',
  });

  try {
    await client.connect(transport, {
      signal: AbortSignal.timeout(CONSULTATIONS_TIMEOUT_MS),
    });
    const result = await client.callTool(
      { arguments: { name }, name: 'get_professor_consultations' },
      undefined,
      { signal: AbortSignal.timeout(CONSULTATIONS_TIMEOUT_MS) },
    );
    const content = z
      .array(z.object({ text: z.string().optional(), type: z.string() }))
      .parse(result.content);
    const text = content.find((part) => part.type === 'text')?.text ?? '[]';

    return z.array(SlotSchema).parse(JSON.parse(text));
  } finally {
    await client.close();
  }
};

const cache = new Map<string, { at: number; slots: RawSlot[] }>();

// The coming consultations of a staff member, or null when unknown (no key,
// pubapi unavailable). An empty list means none are scheduled.
export const getConsultations = async (
  name: string,
): Promise<Consultation[] | null> => {
  const apiKey = getPubapiApiKey();

  if (apiKey === null) {
    return null;
  }

  const cached = cache.get(name);

  if (cached && Date.now() - cached.at < CONSULTATIONS_TTL_MS) {
    return toConsultations(cached.slots);
  }

  try {
    const slots = await readSlots(name, getPubapiUrl(), apiKey);

    cache.set(name, { at: Date.now(), slots });

    return toConsultations(slots);
  } catch (error) {
    logger.warn(`Failed reading the consultations of ${name}`, error);
    return null;
  }
};
