import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migratePlayers, openDatabase } from '../src/database';
import { PlayerStore } from '../src/players';
import { DEV_ACCOUNT_CURRENCY, devAccountAllowed, seedDevAccount } from '../src/devAccount';

test('dev account exists on local store with default password123 or override', { timeout: 30000 }, async () => {
  assert.equal(devAccountAllowed({}), true);
  assert.equal(devAccountAllowed({ DEV_ACCOUNT_PASSWORD: 'local-pass-1' }), true);
  assert.equal(devAccountAllowed({ DEV_ACCOUNT_PASSWORD: 'short' }), false);
  assert.equal(devAccountAllowed({ NODE_ENV: 'production' }), false);
  assert.equal(devAccountAllowed({ DATABASE_URL: 'postgresql://x' }), false);
  const dir = mkdtempSync(join(tmpdir(), 'kartishki-dev-'));
  const db = await openDatabase(undefined, dir);
  try {
    await migratePlayers(db);
    const store = new PlayerStore(db);
    assert.equal(await seedDevAccount(store, { NODE_ENV: 'production' }), false);
    assert.equal(await seedDevAccount(store, {}), true);
    const login = await store.login('dev', 'password123');
    assert.equal(login.library.profile.currency, DEV_ACCOUNT_CURRENCY);
    await store.changeCurrency(login.library.profile.id, -5);
    // Re-seed with override password and check currency reset + new password
    assert.equal(await seedDevAccount(store, { DEV_ACCOUNT_PASSWORD: 'local-pass-1' }), true);
    const loginOverride = await store.login('dev', 'local-pass-1');
    assert.equal(loginOverride.library.profile.currency, DEV_ACCOUNT_CURRENCY);
  } finally { await db.close(); rmSync(dir, { recursive: true, force: true }); }
});
