import type { AutocompleteInteraction } from 'discord.js';

import { handleRoomAutocomplete } from '@/modules/room/utils/roomAutocomplete.js';

export const name = 'office';

export const execute = (interaction: AutocompleteInteraction) =>
  handleRoomAutocomplete(interaction);
