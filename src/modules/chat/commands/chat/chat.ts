import {
  type ChatInputCommandInteraction,
  inlineCode,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

import { executeSubcommand } from '@/common/commands/subcommands.js';
import { logger } from '@/common/logger/index.js';
import { Role } from '@/common/schemas/Role.js';
import {
  safeReplyToInteraction,
  safeStreamReplyToInteraction,
} from '@/common/utils/messages.js';
import { DEFAULT_CONFIGURATION } from '@/configuration/bot/defaults.js';
import { getConfigProperty } from '@/configuration/bot/index.js';
import {
  ClosestQuestionsOptionsSchema,
  FillEmbeddingsOptionsSchema,
  FillProgressSchema,
  UnembeddedQuestionsOptionsSchema,
} from '@/modules/chat/schemas/Chat.js';
import {
  EMBEDDING_MODELS,
  INFERENCE_MODELS,
} from '@/modules/chat/schemas/Model.js';
import { getCommonCommand } from '@/modules/chat/utils/chatCommand.js';
import {
  fillEmbeddings,
  getClosestQuestions,
  getSupportedModels,
  getUnembeddedQuestions,
} from '@/modules/chat/utils/requests.js';
import { generateModelChoices } from '@/modules/chat/utils/utils.js';
import { commandDescriptions, commandErrors } from '@/translations/commands.js';
import { labels } from '@/translations/labels.js';

const EMBEDDINGS_MODEL_OPTION_NAME = 'embeddings-model';

export const name = 'chat';

export const permissions = {
  subcommands: {
    embed: {
      permissions: [PermissionFlagsBits.ManageGuild],
      roles: [Role.Administrators],
    },
    query: {
      permissions: [PermissionFlagsBits.ManageMessages],
      roles: [Role.Moderators],
    },
  },
};

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription('chat')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('closest')
      .setDescription(commandDescriptions['chat closest'])
      .addStringOption((option) =>
        option
          .setName('query')
          .setDescription('Прашање за најблиски прашања')
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName(EMBEDDINGS_MODEL_OPTION_NAME)
          .setDescription('Моделот за ембедирање')
          .setRequired(false)
          .setChoices(generateModelChoices(EMBEDDING_MODELS)),
      )
      .addNumberOption((option) =>
        option
          .setName('threshold')
          .setDescription('Праг за сличност на прашањата')
          .setRequired(false)
          .setMinValue(0)
          .setMaxValue(1),
      )
      .addNumberOption((option) =>
        option
          .setName('limit')
          .setDescription('Максимален број на прашања за враќање')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(100),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('models')
      .setDescription(commandDescriptions['chat models']),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('embed')
      .setDescription(commandDescriptions['chat embed'])
      .addStringOption((option) =>
        option
          .setName(EMBEDDINGS_MODEL_OPTION_NAME)
          .setDescription('Моделот за ембедирање')
          .setRequired(false)
          .setChoices(generateModelChoices(EMBEDDING_MODELS)),
      )
      .addStringOption((option) =>
        option
          .setName('question')
          .setDescription('Име на прашање за ембедирање')
          .setRequired(false),
      )
      .addBooleanOption((option) =>
        option
          .setName('all-questions')
          .setDescription(
            'Дали да се ембедираат сите документи или само неембедираните',
          )
          .setRequired(false),
      )
      .addBooleanOption((option) =>
        option
          .setName('all-models')
          .setDescription(
            'Дали да се ембедираат сите модели или само избраниот',
          )
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('unembedded')
      .setDescription(commandDescriptions['chat unembedded'])
      .addStringOption((option) =>
        option
          .setName(EMBEDDINGS_MODEL_OPTION_NAME)
          .setDescription('Моделот за ембедирање')
          .setRequired(false)
          .setChoices(generateModelChoices(EMBEDDING_MODELS)),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('query')
      .setDescription(commandDescriptions['chat query'])
      .addStringOption((option) =>
        option
          .setName('prompt')
          .setDescription('Промпт за LLM агентот')
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName('system-prompt')
          .setDescription('Системски промпт за LLM агентот')
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName(EMBEDDINGS_MODEL_OPTION_NAME)
          .setDescription('Моделот за ембедирање')
          .setRequired(false)
          .setChoices(generateModelChoices(EMBEDDING_MODELS)),
      )
      .addStringOption((option) =>
        option
          .setName('inference-model')
          .setDescription('Моделот за инференца')
          .setRequired(false)
          .setChoices(generateModelChoices(INFERENCE_MODELS)),
      )
      .addNumberOption((option) =>
        option
          .setName('temperature')
          .setDescription('Температурата на моделот')
          .setRequired(false)
          .setMinValue(0)
          .setMaxValue(1),
      )
      .addNumberOption((option) =>
        option
          .setName('top-p')
          .setDescription('Top P вредноста на моделот')
          .setRequired(false)
          .setMinValue(0)
          .setMaxValue(1),
      )
      .addNumberOption((option) =>
        option
          .setName('max-tokens')
          .setDescription('Максималниот број на токени за одговорот')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(4_096),
      ),
  );

const handleChatClosest = async (interaction: ChatInputCommandInteraction) => {
  const prompt = interaction.options.getString('query', true);
  const embeddingsModel =
    interaction.options.getString(EMBEDDINGS_MODEL_OPTION_NAME, false) ??
    undefined;
  const threshold =
    interaction.options.getNumber('threshold', false) ?? undefined;
  const limit = interaction.options.getNumber('limit', false) ?? undefined;

  const models =
    interaction.guild === null
      ? DEFAULT_CONFIGURATION.models
      : await getConfigProperty('models', interaction.guild.id);

  const options = ClosestQuestionsOptionsSchema.parse({
    embeddingsModel: embeddingsModel ?? models.embeddings ?? undefined,
    limit,
    prompt,
    threshold,
  });

  const closestQuestions = await getClosestQuestions(options);

  if (closestQuestions === null) {
    await interaction.editReply(commandErrors.dataFetchFailed);

    return;
  }

  if (closestQuestions.length === 0) {
    await interaction.editReply(labels.none);

    return;
  }

  const content = closestQuestions
    .toSorted((a, b) => {
      if (a.distance === undefined && b.distance === undefined) return 0;
      if (a.distance === undefined) return 1;
      if (b.distance === undefined) return -1;
      return a.distance - b.distance;
    })
    .map(
      ({ distance, name }, index) =>
        `${index + 1}. ${inlineCode(name)} (${distance === undefined ? labels.none : distance.toFixed(3)})`,
    )
    .join('\n');

  await safeReplyToInteraction(interaction, content);
};

const handleChatModels = async (interaction: ChatInputCommandInteraction) => {
  const models = await getSupportedModels();

  if (models === null) {
    await interaction.editReply(commandErrors.dataFetchFailed);
    return;
  }

  if (models.length === 0) {
    await interaction.editReply(labels.none);
    return;
  }

  const content = models.map((model) => `- ${inlineCode(model)}`).join('\n');
  await safeReplyToInteraction(interaction, content);
};

const { execute: handleChatQuery } = getCommonCommand('ask');

const handleChatEmbed = async (interaction: ChatInputCommandInteraction) => {
  const embeddingsModel =
    interaction.options.getString(EMBEDDINGS_MODEL_OPTION_NAME) ?? undefined;
  const question = interaction.options.getString('question') ?? undefined;
  const allQuestions =
    interaction.options.getBoolean('all-questions') ?? undefined;
  const allModels = interaction.options.getBoolean('all-models') ?? undefined;

  const models =
    interaction.guild === null
      ? DEFAULT_CONFIGURATION.models
      : await getConfigProperty('models', interaction.guild.id);

  const options = FillEmbeddingsOptionsSchema.parse({
    allModels,
    allQuestions,
    embeddingsModel: embeddingsModel ?? models.embeddings ?? undefined,
    questions: question ? [question] : undefined,
  });

  try {
    await safeStreamReplyToInteraction(interaction, async (onChunk) => {
      await fillEmbeddings(options, async (chunk) => {
        if (!chunk.includes('{')) {
          await onChunk(chunk);
          return;
        }

        const event = FillProgressSchema.parse(JSON.parse(chunk));

        const state = inlineCode(
          `${event.index} / ${event.total} | ${event.status}`,
        );

        await onChunk(
          `[${state}] ${event.name} (${inlineCode(event.model)})\n`,
        );
      });
    });
  } catch (error) {
    const isLLMUnavailable =
      Error.isError(error) && error.message === 'LLM_UNAVAILABLE';

    if (!isLLMUnavailable) {
      logger.error(`Failed executing chat embed command\n${String(error)}`, {
        guildId: interaction.guild?.id,
      });
    }

    const errorMessage = isLLMUnavailable
      ? commandErrors.llmUnavailable
      : commandErrors.unknownChatError;

    await (interaction.deferred || interaction.replied
      ? interaction.editReply(errorMessage)
      : interaction.reply({
          content: errorMessage,
          flags: MessageFlags.Ephemeral,
        }));
  }
};

const handleChatUnembedded = async (
  interaction: ChatInputCommandInteraction,
) => {
  const embeddingsModel =
    interaction.options.getString('embeddings-model', false) ?? undefined;

  const models =
    interaction.guild === null
      ? DEFAULT_CONFIGURATION.models
      : await getConfigProperty('models', interaction.guild.id);

  const options = UnembeddedQuestionsOptionsSchema.parse({
    embeddingsModel: embeddingsModel ?? models.embeddings ?? undefined,
  });

  const unembeddedQuestions = await getUnembeddedQuestions(options);

  if (unembeddedQuestions === null) {
    logger.error(
      `Failed getting unembedded questions for embeddings model: ${options.model ?? 'default'}`,
      {
        guildId: interaction.guild?.id,
      },
    );
    await interaction.editReply(commandErrors.dataFetchFailed);

    return;
  }

  if (unembeddedQuestions.length === 0) {
    await interaction.editReply(labels.none);

    return;
  }

  const content = unembeddedQuestions.map(({ name }) => `- ${name}`).join('\n');
  await safeReplyToInteraction(interaction, content);
};

const chatHandlers = {
  closest: handleChatClosest,
  embed: handleChatEmbed,
  models: handleChatModels,
  query: handleChatQuery,
  unembedded: handleChatUnembedded,
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  await executeSubcommand(interaction, chatHandlers);
};
