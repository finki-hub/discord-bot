import { hyperlink, userMention } from 'discord.js';

export const botName = 'ФИНКИ Хаб / Дискорд Бот';

export const aboutMessage = (helpCommand: string, faqCommand: string) =>
  `Овој Дискорд бот е развиен од ${userMention(
    '198249751001563136',
  )} за потребите на ${hyperlink('ФИНКИ Хаб', 'https://finki-hub.com')}. Кодот е отворен и се наоѓа на ${hyperlink(
    'GitHub',
    'https://github.com/finki-hub/discord-bot',
  )}. Ако имате било какви прашања, предлози или проблеми, контактирајте нè на Discord или на GitHub. \n\nНапишете ${helpCommand} за да ги видите сите достапни команди, или ${faqCommand} за да ги видите сите достапни прашања.`;
