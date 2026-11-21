// The sessions of an academic year, latest first.
const PERIODS_LATEST_FIRST = [
  'Септември',
  'Јуни',
  'Летен - Втор',
  'Летен - Прв',
  'Јануари',
  'Зимски - Втор',
  'Зимски - Прв',
];

const ACADEMIC_YEAR_REGEX = /^(?<year>\d{4})\//u;

const startYear = (name: string) =>
  Number(ACADEMIC_YEAR_REGEX.exec(name)?.groups?.['year'] ?? 0);

const periodRank = (name: string) => {
  const rank = PERIODS_LATEST_FIRST.findIndex((period) =>
    name.includes(period),
  );

  return rank === -1 ? PERIODS_LATEST_FIRST.length : rank;
};

// Newest academic year first, and the latest session first within a year.
export const compareSessionsNewestFirst = (left: string, right: string) =>
  startYear(right) - startYear(left) || periodRank(left) - periodRank(right);
