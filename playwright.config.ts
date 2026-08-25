import { defineConfig, devices } from '@playwright/test';

const serveBuiltStudio = process.env.PLAYWRIGHT_SERVE_BUILD === '1';

export default defineConfig({
  testDir: './e2e',
  outputDir: 'output/playwright/test-results',
  timeout: 30_000,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: serveBuiltStudio
      ? 'pnpm --dir apps/studio exec vite preview --host 127.0.0.1 --port 4173 --strictPort'
      : 'pnpm --dir apps/studio exec vite --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
