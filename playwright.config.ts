import { defineConfig, devices } from '@playwright/test';

// Browser tests against the production build. Locally, PW_CHROMIUM_PATH can point at an installed Chrome.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    launchOptions: { executablePath },
  },
  // Behaviour tests run on frozen sample data (port 4173); e2e/live.spec.ts checks today's data loads (port 4174).
  // npm run e2e:build makes both copies of the site (docs/03-dev-pipeline.md).
  projects: [
    {
      name: 'desktop',
      testIgnore: /live\.spec/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:4173',
        launchOptions: { executablePath },
      },
    },
    {
      name: 'mobile',
      testIgnore: /live\.spec/,
      use: {
        ...devices['Pixel 7'],
        baseURL: 'http://localhost:4173',
        launchOptions: { executablePath },
      },
    },
    {
      name: 'live',
      testMatch: /live\.spec/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:4174',
        launchOptions: { executablePath },
      },
    },
  ],
  webServer: [
    {
      command:
        'npm run e2e:build && npx vite preview --outDir .e2e/fixture --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      // Starts once the first server is up, so the build above has made .e2e/live.
      command: 'npx vite preview --outDir .e2e/live --port 4174 --strictPort',
      url: 'http://localhost:4174',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
