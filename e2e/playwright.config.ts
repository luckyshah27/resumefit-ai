import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 5100);

/**
 * End-to-end tests run against the production build served from one origin (Express serves client/dist),
 * backed by the explicit in-memory demo database. No production secrets are needed.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'report' }]] : 'list',
  outputDir: 'results',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node server/dist/server.js --demo',
    cwd: '..',
    url: `http://localhost:${PORT}/api/health`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT), SERVE_CLIENT: 'true', NODE_ENV: 'development', JWT_SECRET: 'e2e-only-secret-key-not-for-production-use-0001', LOG_LEVEL: 'warn' },
  },
});
