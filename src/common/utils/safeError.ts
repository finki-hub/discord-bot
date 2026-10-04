export type ErrorCategory = 'error' | 'range_error' | 'type_error' | 'unknown';

// Do not read arbitrary error properties, including name, message, stack or cause.
export const errorCategory = (error: unknown): ErrorCategory => {
  try {
    if (error instanceof TypeError) return 'type_error';
    if (error instanceof RangeError) return 'range_error';
    if (Error.isError(error)) return 'error';
  } catch {
    // A thrown Proxy must not interrupt recovery.
  }

  return 'unknown';
};
