import { userMention } from 'discord.js';

import { TICKET_REQUEST_MARKER } from '../modules/ticket/utils/constants.js';

export const ticketMessages = {
  ticketCloseConfirm: 'Дали сте сигурни дека сакате да го затворите тикетот?',
  ticketClosedInactivity: 'Тикетот беше затворен поради неактивност.',
  ticketReminderLastActivity: 'Последна активност',
};

export const ticketMessageFunctions = {
  ticketClosedBy: (userId: string) =>
    `Тикетот беше затворен од ${userMention(userId)}.`,
  ticketExisting: (ticketLink: string) =>
    `Веќе имате активен тикет од овој тип: ${ticketLink}`,
  ticketInactivityWarning: (days: number) =>
    `⚠️ Овој тикет ќе биде автоматски затворен за ${days} ${days === 1 ? 'ден' : 'дена'} доколку нема нови пораки.`,
  ticketLink: (ticketLink: string) => `Креиран е Вашиот тикет: ${ticketLink}`,
  ticketRequestHeader: (title: string, userId: string, roles: string) =>
    `## ${title}\n${TICKET_REQUEST_MARKER} ${userMention(userId)} до ${roles}. Ќе добиете одговор во најбрз можен рок, а дополнителни детали може да напишете овде.`,
  ticketSendMessage: (ticketList: string) =>
    `# Тикети\nДоколку имате некакво прашање, проблем, предлог, поплака или слично, може да испратите **приватен** тикет до надлежните луѓе. Изберете го типот на тикетот и напишете го Вашето образложение. Ќе добиете одговор во најбрз можен рок.\n\nМожете да испратите тикет до:\n${ticketList}`,
  ticketStarted: (roles: string) => `${roles} Креиран е тикет до Вас.`,
};
