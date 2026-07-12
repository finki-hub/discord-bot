/* eslint-disable camelcase, sonarjs/no-nested-template-literals, sonarjs/no-nested-conditional -- API payload uses snake_case; nested ternary is readable here */
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';

import { logger } from '@/common/logger/index.js';
import {
  ChatApiError,
  type CredentialProvider,
  CredentialProviderSchema,
  type CredentialUpsert,
  CredentialUpsertSchema,
} from '@/modules/chat/schemas/Credentials.js';
import { resolveChatUser } from '@/modules/chat/utils/identity.js';
import {
  invalidateModelCatalog,
  upsertCredential,
} from '@/modules/chat/utils/requests.js';
import { commandErrors } from '@/translations/commands.js';

export const name = 'credentialSet';

const parseProvider = (args: string[]): CredentialProvider => {
  const provider = args[0];
  if (provider === undefined) {
    throw new Error('Missing provider argument');
  }
  return CredentialProviderSchema.parse(provider);
};

export const execute = async (
  interaction: ModalSubmitInteraction,
  args: string[],
) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const provider = parseProvider(args);
  const apiKey = interaction.fields.getTextInputValue('api-key');
  const baseUrlRaw = interaction.fields.getTextInputValue('base-url');

  const baseUrl = baseUrlRaw.trim() === '' ? undefined : baseUrlRaw.trim();

  const credential: CredentialUpsert = CredentialUpsertSchema.parse({
    api_key: apiKey,
    base_url: baseUrl,
    provider,
  });

  try {
    const chatUser = await resolveChatUser(interaction.user);
    const result = await upsertCredential(chatUser.id, provider, credential);
    invalidateModelCatalog(chatUser.id);

    await interaction.editReply(
      `Зачуван е API клучот за ${provider}${result.base_url ? ` (${result.base_url})` : ''}.`,
    );
  } catch (error) {
    if (error instanceof ChatApiError) {
      logger.warn(`Credential upsert failed: HTTP ${error.status}`, {
        guildId: interaction.guild?.id,
      });

      const message =
        error.status === 401
          ? commandErrors.unknownChatError
          : error.status === 422
            ? 'Внесениот API клуч или base URL не е валиден.'
            : commandErrors.unknownChatError;

      await interaction.editReply(message);

      return;
    }

    throw error;
  }
};
