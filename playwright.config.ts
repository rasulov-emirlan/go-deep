import { defineConfig } from '@playwright/test'

// PW_BASE_URL=http://127.0.0.1:5190 runs against an already-running dev server
const external = process.env.PW_BASE_URL

export default defineConfig({
  testDir: 'e2e',
  use: {
    baseURL: external ?? 'http://127.0.0.1:4173',
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: external ? undefined : { command: 'pnpm build && pnpm preview --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: true },
})
