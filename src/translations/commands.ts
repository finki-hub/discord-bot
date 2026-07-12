import {
  channelMention,
  codeBlock,
  type GuildPremiumTier,
  italic,
  userMention,
} from 'discord.js';

export const commandDescriptions = {
  about: 'За Discord ботот',
  anto: 'Преземи случајна Анто цитата',
  ask: 'Испрати промпт до LLM агентот',
  'chat closest': 'Преземи најблиски прашања',
  'chat embed': 'Ембедирај ги документите',
  'chat models': 'Преземи листа на јазични модели',
  'chat query': 'Испрати промпт до LLM агентот',
  'chat thread': 'Креирај своја приватна нишка за разговор со агентот',
  'chat unembedded': 'Преземи неембедирани документи',
  'config data': 'Освежи ги податоците од складиштето',
  'config get': 'Преземи конфигурација',
  'config reload': 'Освежи ги конфигурациите',
  'config set': 'Измени конфигурација',
  course: 'Преземи информации за предмет',
  'credentials delete': 'Избриши API клуч за провајдер',
  'credentials list': 'Прикажи поставени API клучеви',
  'credentials set': 'Постави API клуч за провајдер',
  faq: 'Преземи најчесто поставувано прашање',
  help: 'Преземи листа од сите достапни команди',
  home: 'Преземи линк до изворниот код',
  link: 'Преземи најчесто баран линк',
  'list commands': 'Преземи листа од сите достапни команди',
  'list links': 'Преземи листа од сите линкови',
  'list questions': 'Преземи листа од сите прашања',
  office: 'Преземи информации за просторија',
  prompt: 'Испрати промпт до LLM агентот',
  room: 'Преземи информации за просторија',
  session: 'Преземи распоред за испитна сесија или колоквиумска недела',
  staff: 'Преземи информации за професор',
  'ticket close': 'Затвори тикет',
  'ticket list': 'Преземи листа од сите тикети',
  'ticket send': 'Испрати порака за креирање тикети',
};

export const commandResponses = {
  chatThreadWelcome:
    'Ова е твојот личен простор за разговор со агентот. Слободно постави прашање тука и ќе ти одговорам. 🤖',
  configurationReloaded: 'Конфигурацијата е освежена.',
  configurationReloading: 'Се освежува конфигурацијата...',
  dataReloaded: 'Податоците се освежени.',
  dataReloading: 'Се освежуваат податоците...',
  feedbackRecorded: 'Ви благодариме на повратната информација!',
  home: 'https://github.com/finki-hub/discord-bot',
  ticketClosed: 'Тикетот е затворен.',
  ticketMessageSent: 'Пораката за тикети е испратена.',
};

export const commandResponseFunctions = {
  chatThreadCreated: (threadId: string) =>
    `Креирана е твојата приватна нишка: ${channelMention(threadId)}`,

  chatThreadExisting: (threadId: string) =>
    `Веќе имаш активна нишка за разговор: ${channelMention(threadId)}`,

  commandFor: (userId: string) => italic(`за ${userMention(userId)}`),

  serverAnimatedEmojiStat: (emojiCount: number, maxCount: number) =>
    `Анимирани емоџиња: ${emojiCount} / ${maxCount}`,

  serverBoostLevelStat: (boostLevel: GuildPremiumTier) => `Ниво: ${boostLevel}`,

  serverBoostStat: (boostCount: number) => `Бустови: ${boostCount}`,

  serverChannelsStat: (channelCount: number) => `Канали: ${channelCount} / 500`,

  serverEmojiStat: (emojiCount: number, maxCount: number) =>
    `Емоџиња: ${emojiCount} / ${maxCount}`,

  serverInvitesStat: (inviteCount: number | string) => `Покани: ${inviteCount}`,

  serverMembersStat: (memberCount: number, maxMembers: null | number) =>
    maxMembers === null
      ? `Членови: ${memberCount}`
      : `Членови: ${memberCount} / ${maxMembers}`,

  serverRolesStat: (roleCount: number) => `Улоги: ${roleCount} / 250`,

  serverSoundboardSoundsStat: (
    soundCount: number | string,
    maxCount: number | string,
  ) => `Звуци: ${soundCount} / ${maxCount}`,

  serverStickersStat: (stickerCount: number, maxCount: number) =>
    `Стикери: ${stickerCount} / ${maxCount}`,
};

export const commandErrors = {
  botMissingPermissions:
    'Ботот нема потребни дозволи за да ја изврши оваа команда. Контактирајте ги администраторите.',
  buttonNoPermission: 'Командата не е ваша.',
  chatThreadCreationFailed:
    'Креирањето на нишката беше неуспешно. Обидете се повторно.',
  chatThreadInvalidChannel:
    'Приватна нишка може да се креира само во текстуален канал.',
  commandError:
    'Настана грешка при извршување на командата. Обидете се повторно, или пријавете ја грешката.',
  commandGuildOnly: 'Оваа команда може да се користи само на сервер.',
  commandNoPermission: 'Немате дозвола да ја извршите командата.',
  commandNotFound: 'Командата не постои.',
  configurationSavingFailed: 'Зачувувањето на конфигурацијата беше неуспешно.',
  courseNotFound: 'Предметот не постои.',
  credentialRequired:
    'Немате поставено API клуч за овој провајдер. Користете /credentials set за да поставите.',
  dataFetchFailed: 'Преземањето на податоците беше неуспешно.',
  dataReloadFailed:
    'Неуспешно освежување на податоците. Проверете ги логите за повеќе детали.',
  faqNotFound: 'Прашањето не постои.',
  feedbackDisabled: 'Повратните информации не се овозможени.',
  invalidChannel: 'Каналот е невалиден.',
  invalidTicket: 'Тикетот не е валиден.',
  invalidTicketType: 'Дадениот тип на тикетот не е валиден.',
  linkNotFound: 'Линкот не постои.',
  linksFetchFailed: 'Преземањето на линковите беше неуспешно.',
  llmDisabled: 'Јазичниот модел е исклучен.',
  llmNotReady: 'Јазичниот модел не е спремен. Обидете се подоцна.',
  llmUnavailable: 'Јазичниот модел не е достапен. Обидете се подоцна.',
  noTicketMembers:
    'Не се избрани членови до кои може да се испрати тикетот. Обидете се на друга категорија.',
  noTickets: 'Нема тикети.',
  questionsFetchFailed: 'Преземањето на прашањата беше неуспешно.',
  roomNotFound: 'Просторијата не постои.',
  sessionNotFound: 'Сесијата не постои.',
  staffNotFound: 'Професорот не постои.',
  ticketingDisabled: 'Тикетите не се овозможени.',
  unknownChatError:
    'Настана грешка при испраќање на промптот. Обидете се повторно.',
};

export const commandErrorFunctions = {
  invalidConfiguration: (error: unknown) =>
    // @ts-expect-error error is unknown
    `Дадената конфигурација не е валидна: ${codeBlock('json', error)}`,
};
