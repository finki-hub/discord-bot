import { fileURLToPath } from 'node:url';

export default function config() {
  return {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('src', import.meta.url)),
      },
    },
    test: {
      clearMocks: true,
      environment: 'node',
      include: ['test/**/*.test.ts'],
      restoreMocks: true,
      unstubEnvs: true,
      unstubGlobals: true,
    },
  };
}
