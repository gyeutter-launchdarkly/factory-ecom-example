import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3107',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROME
      ? { executablePath: process.env.PLAYWRIGHT_CHROME }
      : {},
  },
  webServer: {
    command:
      'FACTORY_CONTROL_DIR=.autofactory/e2e-control FACTORY_PROGRESS_FILE=.autofactory/e2e.ndjson npm run dev -- --hostname 127.0.0.1 --port 3107',
    url: 'http://127.0.0.1:3107',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
