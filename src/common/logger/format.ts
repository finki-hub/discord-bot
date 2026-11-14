type LogLineInfo = Record<string, unknown> & {
  level: string;
  message: unknown;
  timestamp?: unknown;
};

type LogLineMetadata = Record<string, unknown>;

const formatMetadata = (metadata: LogLineMetadata): string => {
  if (Object.keys(metadata).length === 0) {
    return '';
  }

  try {
    return ` ${JSON.stringify(metadata)}`;
  } catch {
    return ' [unserializable metadata]';
  }
};

export const formatLogLine = ({
  level,
  message,
  timestamp,
  ...metadata
}: LogLineInfo): string => {
  const definedMetadata = Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined),
  );
  const timestampText = typeof timestamp === 'string' ? timestamp : '';

  return `${timestampText} - ${level}: ${String(message)}${formatMetadata(definedMetadata)}`;
};
