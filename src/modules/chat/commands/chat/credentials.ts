import {
  type ChatInputCommandInteraction,
  inlineCode,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

import { executeSubcommand } from '@/common/commands/subcommands.js';
import { safeReplyToInteraction } from '@/common/utils/messages.js';
import {
  ChatApiError,
  type CredentialProvider,
  CredentialProviderSchema,
  type CredentialPublic,
} from '@/modules/chat/schemas/Credentials.js';
import { resolveChatUser } from '@/modules/chat/utils/identity.js';
import {
  deleteCredential,
  invalidateModelCatalog,
  listCredentials,
} from '@/modules/chat/utils/requests.js';
import { commandDescriptions, commandErrors } from '@/translations/commands.js';
import { labels } from '@/translations/labels.js';

const PROVIDER_OPTION_NAME = 'provider';

const credentialProviders: CredentialProvider[] = [
  'anthropic',
  'google',
  'ollama',
  'openai',
];

const handleCredentialsList = async (
  interaction: ChatInputCommandInteraction,
) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const chatUser = await resolveChatUser(interaction.user);
    const credentials = await listCredentials(chatUser.id);

    if (credentials.length === 0) {
      await safeReplyToInteraction(interaction, labels.none, {
        ephemeral: true,
      });
      return;
    }

    const content = credentials
      .map((cred: CredentialPublic) => {
        const baseUrl = cred.base_url ? ` (${cred.base_url})` : '';
        return `- ${inlineCode(cred.provider)}${baseUrl}`;
      })
      .join('\n');

    await safeReplyToInteraction(interaction, content, { ephemeral: true });
  } catch (error) {
    if (error instanceof ChatApiError) {
      await safeReplyToInteraction(
        interaction,
        commandErrors.unknownChatError,
        {
          ephemeral: true,
        },
      );
      return;
    }

    throw error;
  }
};

const handleCredentialsDelete = async (
  interaction: ChatInputCommandInteraction,
) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const provider = interaction.options.getString(PROVIDER_OPTION_NAME, true);
  const parsedProvider = CredentialProviderSchema.parse(provider);
  try {
    const chatUser = await resolveChatUser(interaction.user);
    await deleteCredential(chatUser.id, parsedProvider);
    invalidateModelCatalog(chatUser.id);
    await safeReplyToInteraction(
      interaction,
      `Избришана е API клучот за ${inlineCode(parsedProvider)}.`,
      { ephemeral: true },
    );
  } catch (error) {
    if (error instanceof ChatApiError) {
      await safeReplyToInteraction(
        interaction,
        commandErrors.unknownChatError,
        {
          ephemeral: true,
        },
      );
      return;
    }

    throw error;
  }
};

const handleCredentialsSet = async (
  interaction: ChatInputCommandInteraction,
) => {
  const provider = interaction.options.getString(PROVIDER_OPTION_NAME, true);
  const parsedProvider = CredentialProviderSchema.parse(provider);

  const modal = new ModalBuilder()
    .setCustomId(`credentialSet:${parsedProvider}`)
    .setTitle(`Постави API клуч за ${parsedProvider}`)
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('API клуч')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('api-key')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(500),
        ),
      new LabelBuilder()
        .setLabel('Base URL')
        .setDescription('Опционален HTTPS endpoint')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('base-url')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(500),
        ),
    );

  await interaction.showModal(modal);
};

const credentialsHandlers = {
  delete: handleCredentialsDelete,
  list: handleCredentialsList,
  set: handleCredentialsSet,
};

export const name = 'credentials';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription('Управувај со API клучевите')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('list')
      .setDescription(commandDescriptions['credentials list']),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('set')
      .setDescription(commandDescriptions['credentials set'])
      .addStringOption((option) =>
        option
          .setName(PROVIDER_OPTION_NAME)
          .setDescription('Провајдер за API клучот')
          .setRequired(true)
          .addChoices(
            ...credentialProviders.map((p) => ({ name: p, value: p })),
          ),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('delete')
      .setDescription(commandDescriptions['credentials delete'])
      .addStringOption((option) =>
        option
          .setName(PROVIDER_OPTION_NAME)
          .setDescription('Провајдер за бришење')
          .setRequired(true)
          .addChoices(
            ...credentialProviders.map((p) => ({ name: p, value: p })),
          ),
      ),
  );

export const execute = async (interaction: ChatInputCommandInteraction) => {
  await executeSubcommand(interaction, credentialsHandlers);
};
