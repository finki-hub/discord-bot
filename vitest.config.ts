import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
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
});
