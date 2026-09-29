import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/biff-timetable/',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'webkit-iphone',
      testMatch: /(?:booking-apply|official-update-ribbon|modal-focus|custom-event-mobile-width|timetable-grid-day-focus|timetable-viewport-stability|timetable-more-menu|screening-selection-count|screening-vertical-alignment|reliability-accessibility|schedule-list|schedule-readability|settings-readability|film-detail-hierarchy|liquid-glass|mobile-layout-regression|layout-system|curator|global-search)\.spec\.ts/,
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/biff-timetable/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
