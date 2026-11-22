import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';

import { DEFAULT_CONFIGURATION } from '@/configuration/bot/defaults.js';
import { getConfigProperty } from '@/configuration/bot/index.js';
import {
  commandDescriptions,
  commandResponses,
} from '@/translations/commands.js';

import { SendPromptOptionsSchema } from '../schemas/Chat.js';
import { interactionDiscordContext } from './discordContext.js';
import { resolveInteractionChatUser } from './interaction.js';
import { getValidatedInferenceModel } from './requests.js';
import { handlePromptWithStreaming } from './streaming.js';

type CommonCommandOptions = {
  readonly allowPrivate?: boolean;
  readonly allowReasoning?: boolean;
};

export const getCommonCommand = (
  name: keyof typeof commandDescriptions,
  { allowPrivate = false, allowReasoning = true }: CommonCommandOptions = {},
) => {
  const data = new SlashCommandBuilder()
    .setName(name)
    .setDescription(commandDescriptions[name])
    .addStringOption((option) =>
      option
        .setName('prompt')
        .setDescription('Промпт за LLM агентот')
        .setRequired(true)
        .setMaxLength(2_000),
    );

  if (allowPrivate) {
    data.addBooleanOption((option) =>
      option
        .setName('private')
        .setDescription('Прикажи го одговорот само тебе')
        .setRequired(false),
    );
  }

  if (allowReasoning) {
    data.addBooleanOption((option) =>
      option
        .setName('reasoning')
        .setDescription(
          'Овозможи размислување пред одговор (ако моделот поддржува)',
        )
        .setRequired(false),
    );
  }

  const execute = async (interaction: ChatInputCommandInteraction) => {
    let streamingStarted = false;
    try {
      const prompt = interaction.options.getString('prompt', true);
      const reasoning = allowReasoning
        ? (interaction.options.getBoolean('reasoning') ?? undefined)
        : false;

      const models =
        interaction.guild === null
          ? DEFAULT_CONFIGURATION.models
          : await getConfigProperty('models', interaction.guild.id);

      const chatUser = await resolveInteractionChatUser(interaction);
      if (chatUser === null) {
        return;
      }

      const inferenceModel = await getValidatedInferenceModel(
        chatUser.id,
        models.inference,
      );

      const options = SendPromptOptionsSchema.parse({
        discordContext: interactionDiscordContext(interaction),
        embeddingsModel: models.embeddings,
        inferenceModel,
        prompt,
        reasoning,
        userId: chatUser.id,
      });

      streamingStarted = true;
      await handlePromptWithStreaming(
        interaction,
        options,
        'chat query command',
      );
    } finally {
      if (!streamingStarted) {
        await interaction.followUp({
          content: commandResponses.chatStorageNotice,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  };

  return { data, execute };
};
