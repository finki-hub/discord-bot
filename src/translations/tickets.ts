import { userMention } from 'discord.js';

import type { Ticket } from '../modules/ticket/schemas/Ticket.js';

export const ticketMessages = {
  createTicket: `# Тикети\nДоколку имате некакво прашање, проблем, предлог, поплака или слично, може да испратите **приватен** тикет до надлежните луѓе. Изберете го типот на тикетот и напишете го Вашето образложение. Ќе добиете одговор во најбрз можен рок.\n\nМожете да испратите тикет до:`,
  sendMessage:
    'Доколку имате дополнителни детали, напишете ги овде. Ќе добиете одговор во најбрз можен рок.',
  ticketClosedInactivity: 'Тикетот беше затворен поради неактивност.',
  ticketReminderLastActivity: 'Последна активност',
};

export const ticketMessageFunctions = {
  ticketClosedBy: (userId: string) =>
    `Тикетот беше затворен од ${userMention(userId)}.`,
  ticketCreated: (userId: string) =>
    `${userMention(userId)} Ова е Ваш приватен тикет. Ќе добиете одговор во најбрз можен рок. Доколку имате дополнителни детали, напишете ги овде. За да го затворите тикетот, притиснете го копчето за затворање.`,
  ticketExisting: (ticketLink: string) =>
    `Веќе имате активен тикет од овој тип: ${ticketLink}`,
  ticketInactivityWarning: (days: number) =>
    `⚠️ Овој тикет ќе биде автоматски затворен за ${days} ${days === 1 ? 'ден' : 'дена'} доколку нема нови пораки.`,
  ticketLink: (ticketLink: string) => `Креиран е Вашиот тикет: ${ticketLink}`,
  ticketSendMessage: (ticketList: string) =>
    `Доколку имате некакво прашање, проблем, предлог, поплака или слично, може да испратите **приватен** тикет до надлежните луѓе. Изберете го типот на тикетот и напишете го Вашето образложение. Ќе добиете одговор во најбрз можен рок.\n\nМожете да испратите тикет до:\n${ticketList}`,
  ticketStarted: (roles: string) => `${roles} Креиран е тикет до Вас.`,
  ticketTypes: (ticketTypes: Ticket[]) =>
    ticketTypes
      .map((ticket) => `- ${ticket.name}: ${ticket.description}`)
      .join('\n'),
};
