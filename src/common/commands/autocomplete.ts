const MAX_CHOICE_NAME_LENGTH = 100;
const MAX_CHOICE_VALUE_LENGTH = 100;
const MAX_CHOICES = 25;
const ELLIPSIS = '…';

const toChoice = (value: string) => ({
  name:
    value.length > MAX_CHOICE_NAME_LENGTH
      ? `${value.slice(0, MAX_CHOICE_NAME_LENGTH - 1).trimEnd()}${ELLIPSIS}`
      : value,
  value: value.slice(0, MAX_CHOICE_VALUE_LENGTH),
});

export const createAutocompleteOptions = (
  options: Array<[string, string]>,
  term: string,
) =>
  options
    .filter(([key]) => key.toLowerCase().includes(term.toLowerCase()))
    .map(([, value]) => value)
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, MAX_CHOICES)
    .map(toChoice);
