import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  timeout: 60000,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4811', viewport: { width: 1280, height: 897 } },
  webServer: { command: 'node scripts/serve.mjs 4811', port: 4811, reuseExistingServer: !process.env.CI, stdout: 'ignore', stderr: 'ignore' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
