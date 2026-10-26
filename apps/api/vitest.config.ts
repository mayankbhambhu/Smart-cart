import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://smartcart:smartcart@localhost:5432/smartcart_test';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      ENABLE_JOBS: 'false',
      PAYMENTS_DEMO_MODE: 'true',
      AUTH_DEMO_SOCIAL: 'true',
      OTP_DEV_ECHO: 'true',
      PUSH_ENABLED: 'false',
    },
    // The suites share one seeded database, so run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
