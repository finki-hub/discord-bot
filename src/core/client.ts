import { GatewayIntentBits } from 'discord-api-types/v10';
import { Client, Partials } from 'discord.js';

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.DirectMessages,
];

const partials = [Partials.Channel];

const presence = {
  activities: [
    {
      name: 'World Domination',
    },
  ],
};

export const client = new Client({
  intents,
  partials,
  presence,
});
