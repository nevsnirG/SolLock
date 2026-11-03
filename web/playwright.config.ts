import { defineConfig, devices } from '@playwright/test';

const PORT = 8792;

/**
 * Browser tests against the built site, served by the real Worker in Wrangler's local runtime. The
 * Solana network and the price service are faked in the browser, so no request leaves the machine.
 * Run `pnpm build` first.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'en-US',
    timezoneId: 'Europe/Amsterdam',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node ../worker/node_modules/wrangler/bin/wrangler.js dev --config ../worker/wrangler.jsonc --port ${PORT} --show-interactive-dev-session=false`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { WRANGLER_SEND_METRICS: 'false' },
  },
});
