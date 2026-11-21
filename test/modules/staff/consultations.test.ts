import { describe, expect, test } from 'vitest';

import { getStaffComponent } from '@/modules/staff/components/components.js';
import { StaffSchema } from '@/modules/staff/schemas/Staff.js';
import { toConsultations } from '@/modules/staff/utils/consultations.js';
import { labels } from '@/translations/labels.js';

const slot = (
  date: string,
  day: string,
  from: string,
  to: string,
  room = 'ТМФ 209',
) => ({
  Classroom: room,
  dateFormatted: date,
  Day: day,
  TimeFrom: from,
  TimeTo: to,
});

describe('consultations', () => {
  test('are ordered from today on, joining back-to-back slots in one room', () => {
    const consultations = toConsultations(
      [
        slot('23-11-2026', 'понеделник', '12:00', '13:00'),
        slot('19-11-2026', 'четврток', '11:00', '12:00'),
        slot('19-11-2026', 'четврток', '10:00', '11:00'),
        slot('18-11-2026', 'среда', '12:00', '13:00'),
        slot('23-11-2026', 'понеделник', '13:00', '14:00', 'Online'),
      ],
      '2026-11-19',
    );

    expect(
      consultations.map(
        ({ date, from, room, to }) => `${date} ${from}-${to} ${room}`,
      ),
    ).toEqual([
      '19-11-2026 10:00-12:00 ТМФ 209',
      '23-11-2026 12:00-13:00 ТМФ 209',
      '23-11-2026 13:00-14:00 Online',
    ]);
  });

  test('leave out a cancelled date', () => {
    expect(
      toConsultations(
        [
          {
            ...slot('20-11-2026', 'петок', '10:00', '11:00'),
            DeactivatedStr: ['20-11-2026'],
          },
        ],
        '2026-11-19',
      ),
    ).toEqual([]);
  });
});

describe('the staff card consultations', () => {
  const staff = StaffSchema.parse({
    active: true,
    cabinet: '209',
    email: 'vesna.dimitrova@finki.ukim.mk',
    name: 'Весна Димитрова',
    position: 'Редовен професор',
    title: 'д-р',
  });
  const textOf = (consultations: Parameters<typeof getStaffComponent>[1]) =>
    JSON.stringify(getStaffComponent(staff, consultations).toJSON());

  test('list each coming consultation', () => {
    const text = textOf([
      {
        date: '19-11-2026',
        day: 'четврток',
        from: '10:00',
        room: 'ТМФ 209',
        to: '12:00',
      },
    ]);

    expect(text).toContain(labels.consultations);
    expect(text).toContain('**четврток 19.11.** 10:00–12:00 · ТМФ 209');
  });

  test('say when none are scheduled, and leave the section out when unknown', () => {
    expect(textOf([])).toContain(labels.noConsultations);
    expect(textOf(null)).not.toContain(labels.noConsultations);
  });
});
