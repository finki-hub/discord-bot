import type { AutocompleteInteraction } from 'discord.js';

import { handleRoomAutocomplete } from '@/modules/room/utils/roomAutocomplete.js';

export const name = 'room';

export const execute = (interaction: AutocompleteInteraction) =>
  handleRoomAutocomplete(interaction);
