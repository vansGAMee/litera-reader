import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  use: { screenshot: 'only-on-failure', baseURL: 'http://127.0.0.1:4173', viewport: { width: 390, height: 844 } },
  webServer: { command: process.env.LITERA_PREVIEW ? 'npx vite preview --host 127.0.0.1 --port 4173' : 'npx vite --host 127.0.0.1 --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: true },
})
