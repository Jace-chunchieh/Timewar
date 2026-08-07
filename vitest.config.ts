import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      '@shared': new URL('./packages/shared/src', import.meta.url).pathname,
      '@server': new URL('./apps/server/src', import.meta.url).pathname,
    },
  },
});
