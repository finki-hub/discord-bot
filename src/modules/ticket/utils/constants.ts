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

// Discord's limit for thread names.
export const MAX_THREAD_NAME_LENGTH = 100;

// How far into a thread to look for the first human message or modal request.
export const TICKET_START_LOOKBACK_LIMIT = 50;

// Persisted marker for modal-created tickets. Keep this value stable: existing
// tickets rely on it to be recognized as started during maintenance.
export const TICKET_REQUEST_FOOTER = 'Барање за тикет';
