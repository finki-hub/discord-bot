export const generateModelChoices = (allowedModels: readonly string[]) =>
  allowedModels.map((value) => ({ name: value, value }));

export const sanitizeOptions = <T extends Record<string, unknown>>(obj: T): T =>
  Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as T;
