/* eslint-disable camelcase -- API payload fields intentionally use snake_case before schema transformation */

import { z } from 'zod';

export const ConversationTurnSchema = z.object({
  content: z.string().max(2_000),
  role: z.enum(['assistant', 'user']),
});

export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;

export const SendPromptOptionsSchema = z
  .object({
    embeddingsModel: z.string().optional(),
    history: z.array(ConversationTurnSchema).max(9).optional(),
    inferenceModel: z.string().optional(),
    maxTokens: z.number().min(1).max(4_096).optional(),
    prompt: z.string().min(1, 'Query must not be empty').max(2_000),
    reasoning: z.boolean().optional(),
    temperature: z.number().min(0).max(1).optional(),
    topP: z.number().min(0).max(1).optional(),
    userId: z.uuid(),
  })
  .transform((data) => ({
    embeddings_model: data.embeddingsModel,
    inference_model: data.inferenceModel,
    interface: 'discord' as const,
    max_tokens: data.maxTokens,
    messages: [
      ...(data.history ?? []).slice(-9),
      { content: data.prompt, role: 'user' as const },
    ].slice(-10),
    reasoning: data.reasoning,
    temperature: data.temperature,
    top_p: data.topP,
    user_id: data.userId,
  }));

export type SendPromptOptions = z.infer<typeof SendPromptOptionsSchema>;

export const FeedbackOptionsSchema = z
  .object({
    answerText: z.string().optional(),
    channelId: z.string().optional(),
    client: z.enum(['discord', 'web']),
    clientRef: z.string().optional(),
    embeddingsModel: z.string().optional(),
    feedbackType: z.enum(['like', 'dislike']),
    guildId: z.string().optional(),
    inferenceModel: z.string().optional(),
    questionText: z.string().optional(),
    responseId: z.string(),
    userId: z.string(),
  })
  .transform((data) => ({
    answer_text: data.answerText,
    channel_id: data.channelId,
    client: data.client,
    client_ref: data.clientRef,
    embeddings_model: data.embeddingsModel,
    feedback_type: data.feedbackType,
    guild_id: data.guildId,
    inference_model: data.inferenceModel,
    question_text: data.questionText,
    response_id: data.responseId,
    user_id: data.userId,
  }));

export type FeedbackOptions = z.infer<typeof FeedbackOptionsSchema>;

export const ClosestQuestionsOptionsSchema = z
  .object({
    embeddingsModel: z.string().optional(),
    limit: z.number().min(1).max(100).optional(),
    prompt: z.string().min(1, 'Query must not be empty'),
    threshold: z.number().min(0).max(1).optional(),
  })
  .transform((data) => ({
    embeddings_model: data.embeddingsModel,
    limit: data.limit,
    prompt: data.prompt,
    threshold: data.threshold,
  }));

export type ClosestQuestionsOptions = z.infer<
  typeof ClosestQuestionsOptionsSchema
>;

export const FillProgressSchema = z.object({
  error: z.string(),
  id: z.string(),
  index: z.number(),
  model: z.string(),
  name: z.string(),
  status: z.string(),
  total: z.number(),
  ts: z.string(),
});

export const FillEmbeddingsOptionsSchema = z
  .object({
    allModels: z.boolean().optional(),
    allQuestions: z.boolean().optional(),
    embeddingsModel: z.string().optional(),
    questions: z
      .array(z.string().min(1, 'Question must not be empty'))
      .optional(),
  })
  .transform((data) => ({
    all_models: data.allModels,
    all_questions: data.allQuestions,
    embeddings_model: data.embeddingsModel,
    questions:
      data.questions !== undefined && data.questions.length > 0
        ? data.questions
        : undefined,
  }));

export type FillEmbeddingsOptions = z.infer<typeof FillEmbeddingsOptionsSchema>;

export const UnembeddedQuestionsOptionsSchema = z
  .object({
    embeddingsModel: z.string().optional(),
  })
  .transform((data) => ({
    model: data.embeddingsModel,
  }));

export type UnembeddedQuestionsOptions = z.infer<
  typeof UnembeddedQuestionsOptionsSchema
>;
