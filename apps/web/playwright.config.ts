import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a running API + web app with the development seed.
 * `npm run test:e2e` starts both dev servers unless E2E_BASE_URL points at a
 * deployment. Set PW_CHROMIUM_PATH to use a system Chromium.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    permissions: ['clipboard-read', 'clipboard-write'],
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'npm run dev -w @smartcart/api',
          cwd: '../..',
          url: 'http://localhost:4000/health',
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: 'npm run dev -w @smartcart/web',
          cwd: '../..',
          url: 'http://localhost:5173',
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
