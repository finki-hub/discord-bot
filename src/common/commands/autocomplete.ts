// Discord caps choice names and string values at 100 characters. Values are
// truncated rather than dropped because the current callers resolve a
// selection through fuzzy search, so a prefix still identifies the entry.
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
    .map(([, value]) => toChoice(value))
    .filter(
      (choice, index, array) =>
        array.findIndex((item) => item.value === choice.value) === index,
    )
    .slice(0, MAX_CHOICES);
