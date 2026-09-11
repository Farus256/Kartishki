import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
export default defineConfig({
  testDir: './tests/browser', testMatch: ['game.spec.ts', 'photo-editor.spec.ts'], workers: 1, timeout: 60000,
  use: { channel: 'chrome', headless: true, viewport: { width: 1280, height: 1100 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5174', timeout: 30000, reuseExistingServer: false,
    env: { ADMIN_TOKEN: 'local-browser-test-key', CATALOG_FILE: resolve(`.cache/catalog-${Date.now()}.json`), PLAYER_DATA_DIR: resolve(`.cache/players-${Date.now()}`) } },
});
