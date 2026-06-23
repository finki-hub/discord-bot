export const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
  month: '2-digit',
  second: '2-digit',
  timeZone: 'UTC',
  year: 'numeric',
});

export const TICKETS_CHECK_INTERVAL = 900_000; // 15 minutes

export const TICKET_ABANDON_TIMEOUT_MILLISECONDS = 1_800_000; // 30 minutes

export const ALLOWED_INACTIVITY_DAYS = 10;
export const MAX_TICKET_INACTIVITY_MILLISECONDS =
  ALLOWED_INACTIVITY_DAYS * 86_400_000;

export const TICKETS_PER_PAGE = 8;
