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

// Must not exceed the thread's one-week auto-archive: maintenance skips archived
// threads. The reminders are messages, so they keep the thread open until close.
export const ALLOWED_INACTIVITY_DAYS = 7;
export const MAX_TICKET_INACTIVITY_MILLISECONDS =
  ALLOWED_INACTIVITY_DAYS * 86_400_000;

export const TICKET_REMINDER_THREE_DAYS_MILLISECONDS = 3 * 86_400_000;
export const TICKET_REMINDER_ONE_DAY_MILLISECONDS = 86_400_000;

export const TICKETS_PER_PAGE = 8;

// Discord's limit for thread names.
export const MAX_THREAD_NAME_LENGTH = 100;

// Leaves room in the thread name for the longest user tag and part of a title.
export const MAX_TICKET_NAME_LENGTH = 50;

// How far into a thread to look for the first human message or modal request.
export const TICKET_START_LOOKBACK_LIMIT = 50;

// Persisted marker for modal-created tickets. Keep this value stable: existing
// tickets rely on it to be recognized as started during maintenance.
export const TICKET_REQUEST_FOOTER = 'Барање за тикет';

// Persisted marker in the plain-text ticket header. Keep this value stable:
// maintenance deletes tickets it cannot recognize as started.
export const TICKET_REQUEST_MARKER = '-# Приватен тикет од';

// Persisted marker for inactivity warnings. Keep this value stable: the
// reminder stage and timestamp are read from these messages during maintenance.
export const TICKET_REMINDER_FOOTER = 'Автоматска напомена';
