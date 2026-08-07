import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 900_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5215',
    viewport: { width: 1440, height: 900 },
    headless: true,
  },
  reporter: [['list']],
});
