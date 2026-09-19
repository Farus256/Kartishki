import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
export default defineConfig({
  testDir: './tests/browser', testMatch: ['game.spec.ts', 'photo-editor.spec.ts', 'portrait-refresh.spec.ts', 'heroes.spec.ts', 'battlegrounds.spec.ts', 'ab-dnd.spec.ts', 'ab-composition.spec.ts', 'battlegrounds-editor.spec.ts', 'server-browser.spec.ts', 'ab-polish.spec.ts'], workers: 1, timeout: 60000,
  use: { channel: 'chrome', headless: true, viewport: { width: 1280, height: 1100 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:2567/health', timeout: 30000, reuseExistingServer: process.env.PW_REUSE_SERVER === '1',
    env: { CATALOG_FILE: resolve(`.cache/catalog-${Date.now()}.json`), PLAYER_DATA_DIR: resolve(`.cache/players-${Date.now()}`) } },
});
