import { type AutocompleteInteraction } from 'discord.js';

import { createAutocompleteOptions } from '@/common/commands/autocomplete.js';
import { createTransliterationSearchMapFromEntries } from '@/common/utils/transliteration.js';
import {
  getTransformedCourses,
  setTransformedCourses,
} from '@/modules/course/utils/cache.js';
import { getCourseNameVariants } from '@/modules/course/utils/data.js';

export const name = 'course';

export const execute = async (interaction: AutocompleteInteraction) => {
  const focused = interaction.options.getFocused(true);

  let transformedCourses = getTransformedCourses();

  if (transformedCourses === null) {
    transformedCourses = Object.entries(
      createTransliterationSearchMapFromEntries(getCourseNameVariants()),
    );

    setTransformedCourses(transformedCourses);
  }

  await interaction.respond(
    createAutocompleteOptions(transformedCourses, focused.value),
  );
};
