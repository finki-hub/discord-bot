import { Model } from '../schemas/Model.js';

export const generateModelChoices = (allowedModels: readonly Model[]) =>
  Object.entries(Model)
    .filter(([, value]) => allowedModels.includes(value))
    .map(([key, value]) => ({ name: key, value }));

export const sanitizeOptions = <T extends Record<string, unknown>>(obj: T): T =>
  Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as T;
