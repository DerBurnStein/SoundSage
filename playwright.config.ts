// Playwright config for the dashboard smoke suite.
// `webServer` boots `next dev` on demand so a fresh CI checkout doesn't
// need a separate "run the app first" step. Locally it reuses any dev
// server already on :3000.

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE,
    reuseExistingServer: !process.env.CI,
    // Next.js cold start (esp. with the Prisma client + bundling) routinely
    // takes 30s+ — give it room.
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
