import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import type { PlayerStore } from './players';

const derive = promisify(scrypt);

export const DEV_ACCOUNT_CURRENCY = 9_000_000;
export const DEV_ACCOUNT_USERNAME = 'dev';
export const DEFAULT_DEV_PASSWORD = 'password123';

/**
 * A local-only test account with a full purse. It exists solely on a developer's PGlite store: production
 * (NODE_ENV=production) and any external Postgres (DATABASE_URL) never get it.
 * Defaults to 'password123' unless overridden by DEV_ACCOUNT_PASSWORD.
 */
export function devAccountPassword(env: NodeJS.Dict<string> = process.env): string {
  return env.DEV_ACCOUNT_PASSWORD || DEFAULT_DEV_PASSWORD;
}

export function devAccountAllowed(env: NodeJS.Dict<string> = process.env): boolean {
  const password = devAccountPassword(env);
  return env.NODE_ENV !== 'production' && !env.DATABASE_URL && typeof password === 'string' && password.length >= 8;
}

export async function seedDevAccount(players: PlayerStore, env: NodeJS.Dict<string> = process.env): Promise<boolean> {
  if (!devAccountAllowed(env)) return false;
  const password = devAccountPassword(env);
  const existing = (await players.db.query<{ id: string }>('SELECT id FROM players WHERE login_key = $1', [DEV_ACCOUNT_USERNAME])).rows[0];
  const id = existing?.id ?? (await players.register(DEV_ACCOUNT_USERNAME, password)).library.profile.id;

  // Ensure password is kept in sync with the current dev password even if the account already existed
  if (existing) {
    const salt = randomBytes(16).toString('hex');
    const hash = (await derive(password, salt, 64) as Buffer).toString('hex');
    await players.db.query('UPDATE players SET password_salt = $2, password_hash = $3 WHERE id = $1', [id, salt, hash]);
  }

  // Top the purse back up on every start so a spending spree in the shop never leaves the tester broke.
  await players.db.query('UPDATE players SET currency = $2, is_admin = TRUE WHERE id = $1', [id, DEV_ACCOUNT_CURRENCY]);
  return true;
}
