export const parseInstant = (value: string): Temporal.Instant => {
  try {
    return Temporal.Instant.from(value);
  } catch {
    return Temporal.PlainDateTime.from(value)
      .toZonedDateTime('UTC')
      .toInstant();
  }
};
