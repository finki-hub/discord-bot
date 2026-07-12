/* eslint-disable camelcase -- API payload fields use snake_case */
import type { User } from 'discord.js';

import { getApiKey, getChatbotUrl } from '@/configuration/environment.js';

import {
  ChatApiError,
  type ChatUser,
  ChatUserSchema,
  ChatUserUpsertSchema,
  SafeErrorDetailSchema,
} from '../schemas/Credentials.js';

const parseSafeDetail = async (response: Response): Promise<string> => {
  try {
    const json = await response.json();
    return (
      SafeErrorDetailSchema.parse(json).detail ?? `HTTP ${response.status}`
    );
  } catch {
    return `HTTP ${response.status}`;
  }
};

const userCache = new Map<string, ChatUser>();

const authHeaders = (): Record<string, string> => {
  const apiKey = getApiKey();
  if (apiKey === null) {
    throw new ChatApiError(401, 'API key not configured');
  }
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
  };
};

export const resolveChatUser = async (discordUser: User): Promise<ChatUser> => {
  const cached = userCache.get(discordUser.id);
  if (cached !== undefined) {
    return cached;
  }

  const chatbotUrl = getChatbotUrl();
  if (chatbotUrl === null) {
    throw new ChatApiError(503, 'Chatbot URL not configured');
  }

  const body = ChatUserUpsertSchema.parse({
    avatar_url: discordUser.avatarURL({ size: 256 }) ?? undefined,
    name: discordUser.displayName,
    provider: 'discord',
    provider_subject: discordUser.id,
  });

  const result = await fetch(`${chatbotUrl}/chat/state/users`, {
    body: JSON.stringify(body),
    headers: authHeaders(),
    method: 'POST',
  });

  if (!result.ok) {
    const detail = await parseSafeDetail(result);
    throw new ChatApiError(result.status, detail);
  }

  const user = ChatUserSchema.parse(await result.json());
  userCache.set(discordUser.id, user);
  return user;
};

export const clearChatUserCache = (discordUserId: string): void => {
  userCache.delete(discordUserId);
};
