import { codeBlock, type ContainerBuilder } from 'discord.js';
import { describe, expect, test } from 'vitest';

import type { Question } from '@/modules/faq/schemas/Question.js';
import type { Staff } from '@/modules/staff/schemas/Staff.js';
import type { Ticket } from '@/modules/ticket/schemas/Ticket.js';

import { getPaginationComponent } from '@/common/components/pagination.js';
import {
  componentTextLength,
  fitsJsonCodeBlock,
  isButtonUrl,
  MAX_COMPONENT_TEXT_LENGTH,
  MAX_MESSAGE_LENGTH,
  truncateButtonLabel,
  truncateComponentText,
} from '@/common/utils/limits.js';
import { getCourseComponent } from '@/modules/course/components/components.js';
import { CourseSchema } from '@/modules/course/schemas/Course.js';
import { getQuestionComponent } from '@/modules/faq/components/components.js';
import { getButtonLinks } from '@/modules/faq/utils/links.js';
import { getStaffComponent } from '@/modules/staff/components/components.js';
import { getTicketCreateComponents } from '@/modules/ticket/components/components.js';

type Json = { components?: Json[]; custom_id?: string; label?: string };

const componentCount = (component: Json): number =>
  1 +
  (component.components ?? []).reduce(
    (total, child) => total + componentCount(child),
    0,
  );

const flatten = (component: Json): Json[] => [
  component,
  ...(component.components ?? []).flatMap((child) => flatten(child)),
];

const jsonOf = (card: ContainerBuilder) => card.toJSON() as unknown as Json;

describe('truncateComponentText', () => {
  test('keeps text at the limit and shortens longer text', () => {
    const atLimit = 'a'.repeat(MAX_COMPONENT_TEXT_LENGTH);
    const truncated = truncateComponentText(`${atLimit}a`);

    expect(truncateComponentText(atLimit)).toBe(atLimit);
    expect(truncated).toHaveLength(MAX_COMPONENT_TEXT_LENGTH);
    expect(truncated.endsWith('…')).toBe(true);
  });
});

const pageCard = (pages: number, page: number) =>
  getPaginationComponent({
    buttonId: 'list',
    description: 'description',
    entries: Array.from({ length: pages * 8 }, (_, index) => `entry ${index}`),
    entriesLabel: 'entries',
    page,
    pageSize: 8,
    title: 'title',
  });

const buttonLabels = (card: ContainerBuilder) =>
  flatten(jsonOf(card))
    .filter((component) => component.custom_id !== undefined)
    .map((component) => component.label);

describe('paginated lists', () => {
  test('stay within 40 components however many pages there are', () => {
    for (const pages of [1, 5, 6, 20, 21, 500]) {
      for (const page of [0, 1, Math.floor(pages / 2), pages - 1]) {
        expect(
          componentCount(jsonOf(pageCard(pages, page))),
        ).toBeLessThanOrEqual(40);
      }
    }
  });

  test('offer the first, last and neighbouring pages, each once', () => {
    expect(buttonLabels(pageCard(13, 6))).toEqual(['1', '6', '7', '8', '13']);
    expect(buttonLabels(pageCard(13, 0))).toEqual(['1', '2', '13']);
    expect(buttonLabels(pageCard(13, 12))).toEqual(['1', '12', '13']);
  });

  test('offer every page when they fit in one row', () => {
    expect(buttonLabels(pageCard(5, 2))).toEqual(['1', '2', '3', '4', '5']);
  });
});

describe('the course card', () => {
  test('drops profile links and shortens the staff to fit the text limit', () => {
    const names = Array.from(
      { length: 300 },
      (_, index) => `Име Презименски ${index}`,
    );
    const course = CourseSchema.parse({
      '2018-available': 'FALSE',
      '2023-available': 'FALSE',
      assistants: names.join('\n'),
      name: 'Предмет',
      professors: names.join('\n'),
    });
    const card = getCourseComponent(course).toJSON();

    expect(componentTextLength(card)).toBeLessThan(MAX_COMPONENT_TEXT_LENGTH);
    expect(JSON.stringify(card)).toContain('(+285)');
  });
});

describe('the staff card', () => {
  test('lists at most 20 consultations and counts the rest', () => {
    const information = {
      active: true,
      email: 'name@finki.ukim.mk',
      name: 'Име',
      position: 'Доцент',
      title: 'д-р',
    } as Staff;
    const consultation = {
      date: '25-11-2026',
      day: 'среда',
      from: '16:00',
      room: 'ТМФ 320',
      to: '18:00',
    };
    const card = getStaffComponent(
      information,
      Array.from({ length: 500 }, (_, index) => ({
        ...consultation,
        from: `${index}`,
      })),
    ).toJSON();

    expect(componentTextLength(card)).toBeLessThan(MAX_COMPONENT_TEXT_LENGTH);
    expect(JSON.stringify(card)).toContain('(+480)');
  });
});

describe('link and ticket buttons', () => {
  test('shorten a long label to 80 characters', () => {
    const label = truncateButtonLabel('а'.repeat(120));

    expect(label).toHaveLength(80);
    expect(label.endsWith('…')).toBe(true);
    expect(truncateButtonLabel('кратко')).toBe('кратко');
  });

  test('accept only a web address Discord can open', () => {
    expect(isButtonUrl('https://finki.ukim.mk/')).toBe(true);
    expect(isButtonUrl('https://not a url')).toBe(false);
    expect(isButtonUrl('mailto:name@finki.ukim.mk')).toBe(false);
    expect(isButtonUrl(`https://finki.ukim.mk/${'a'.repeat(512)}`)).toBe(false);
  });

  test('a question with a bad link still builds, without that button', () => {
    const links = {
      '': 'https://finki.ukim.mk/',
      Добар: 'finki.ukim.mk',
      Лош: 'https://not a url',
      [`Долг ${'а'.repeat(120)}`]: 'https://finki.ukim.mk/long',
    };

    expect(getButtonLinks(links)).toHaveLength(2);
    expect(() =>
      getQuestionComponent({
        content: 'Одговор',
        links,
        name: 'Прашање',
      } as unknown as Question).toJSON(),
    ).not.toThrow();
  });

  test('ticket buttons stop at five rows and shorten long names', () => {
    const tickets = Array.from({ length: 40 }, (_, index) => ({
      id: String(index),
      name: 'т'.repeat(120),
      roles: [],
    })) as Ticket[];
    const rows = getTicketCreateComponents(tickets).map((row) => row.toJSON());

    expect(rows).toHaveLength(5);
    expect(
      rows
        .flatMap((row) => row.components)
        .every((button) => {
          const { label } = button as { label?: string };

          return (label?.length ?? 0) <= 80;
        }),
    ).toBe(true);
  });
});

describe('the config reply', () => {
  test('counts the code block around the JSON', () => {
    const wrapper = codeBlock('json', '').length;
    const fits = 'a'.repeat(MAX_MESSAGE_LENGTH - wrapper);

    expect(fitsJsonCodeBlock(fits)).toBe(true);
    expect(fitsJsonCodeBlock(`${fits}a`)).toBe(false);
  });
});
