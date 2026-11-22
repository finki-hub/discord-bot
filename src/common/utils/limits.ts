import { codeBlock } from 'discord.js';

// Discord's limits on what a message carries. A message over one of them is
// refused whole, so a card built from data keeps within them.

export const MAX_ACTION_ROW_BUTTONS = 5;
export const MAX_MESSAGE_LENGTH = 2_000;
export const MAX_COMPONENT_TEXT_LENGTH = 4_000;

const MAX_BUTTON_LABEL_LENGTH = 80;
const MAX_BUTTON_URL_LENGTH = 512;
const WEB_URL_REGEX = /^https?:\/\//iu;

export const truncateButtonLabel = (label: string) =>
  label.length > MAX_BUTTON_LABEL_LENGTH
    ? `${label.slice(0, MAX_BUTTON_LABEL_LENGTH - 1).trimEnd()}…`
    : label;

export const truncateComponentText = (text: string) =>
  text.length > MAX_COMPONENT_TEXT_LENGTH
    ? `${text.slice(0, MAX_COMPONENT_TEXT_LENGTH - 1).trimEnd()}…`
    : text;

export const isButtonUrl = (url: string) =>
  url.length <= MAX_BUTTON_URL_LENGTH &&
  WEB_URL_REGEX.test(url) &&
  URL.canParse(url);

export const fitsJsonCodeBlock = (text: string) =>
  codeBlock('json', text).length <= MAX_MESSAGE_LENGTH;

// The characters of a component's text, nested components included: Discord
// counts them across the whole message.
export const componentTextLength = (component: object): number => {
  const { components = [], content = '' } = component as {
    components?: readonly object[];
    content?: string;
  };

  return components.reduce(
    (total, child) => total + componentTextLength(child),
    content.length,
  );
};
