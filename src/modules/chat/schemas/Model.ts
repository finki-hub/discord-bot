import { z } from 'zod';

export const ModelDescriptorSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
});

export type ModelDescriptor = z.infer<typeof ModelDescriptorSchema>;

export const ModelCatalogResponseSchema = z.object({
  models: z.array(ModelDescriptorSchema),
  source: z.string(),
  version: z.number(),
});

export type ModelCatalogResponse = z.infer<typeof ModelCatalogResponseSchema>;

export const EMBEDDING_MODELS = [
  'BAAI/bge-m3',
  'gemini-embedding-001',
  'text-embedding-3-large',
] as const;

export const INFERENCE_MODELS = [
  'claude-haiku-4-5',
  'claude-opus-4-8',
  'claude-sonnet-5',
  'gemini-3.1-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-3.5-flash',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
  'gpt-5.4',
  'gpt-5.5',
  'gpt-5.6-luna',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'qwen3:14b-q4_K_M',
  'qwen3:30b-a3b-instruct-2507-q4_K_M',
  'qwen3:30b-a3b-thinking-2507-q4_K_M',
] as const;
