import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', testMatch: ['metagame.spec.ts', 'menu.spec.ts'], workers: 1, timeout: 45000,
  use: { channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:5180', viewport: { width: 1600, height: 900 }, screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev -w @kartishki/client -- --host 127.0.0.1 --port 5180', url: 'http://127.0.0.1:5180', reuseExistingServer: false },
});
