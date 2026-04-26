import {
  base,
  node,
  perfectionist,
  prettier,
  typescript,
} from 'eslint-config-imperium';

const config = [
  {
    ignores: ['dist/', '.devcontainer/', 'logs/'],
  },
  ...base,
  node,
  typescript,
  prettier,
  perfectionist,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../..'],
              message:
                'Relative imports with two or more levels of nesting are not allowed. Use absolute imports with @/ instead, or use a single level (../) if necessary.',
            },
          ],
        },
      ],
    },
  },
];

export default config;
