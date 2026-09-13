import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
// Production base path (see vite.config.ts) — the preview server serves the
// build under this sub-path, matching GitHub Pages.
const BASE_URL = `http://localhost:${PORT}/mallet-42k/`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
