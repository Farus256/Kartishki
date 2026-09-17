import type { PlayerStore } from './players';

export const DEV_ACCOUNT_CURRENCY = 9_000_000;
export const DEV_ACCOUNT_USERNAME = 'dev';

/**
 * A local-only test account with a full purse. It exists solely on a developer's PGlite store: production
 * (NODE_ENV=production) and any external Postgres (DATABASE_URL) never get it, and the password is the one
 * the developer set in DEV_ACCOUNT_PASSWORD — nothing is baked in, nothing bypasses the normal login.
 */
export function devAccountAllowed(env: NodeJS.Dict<string> = process.env): boolean {
  return env.NODE_ENV !== 'production' && !env.DATABASE_URL && typeof env.DEV_ACCOUNT_PASSWORD === 'string' && env.DEV_ACCOUNT_PASSWORD.length >= 8;
}

export async function seedDevAccount(players: PlayerStore, env: NodeJS.Dict<string> = process.env): Promise<boolean> {
  if (!devAccountAllowed(env)) return false;
  const password = env.DEV_ACCOUNT_PASSWORD!;
  const existing = (await players.db.query<{ id: string }>('SELECT id FROM players WHERE login_key = $1', [DEV_ACCOUNT_USERNAME])).rows[0];
  const id = existing?.id ?? (await players.register(DEV_ACCOUNT_USERNAME, password)).library.profile.id;
  // Top the purse back up on every start so a spending spree in the shop never leaves the tester broke.
  await players.db.query('UPDATE players SET currency = $2, is_admin = TRUE WHERE id = $1', [id, DEV_ACCOUNT_CURRENCY]);
  return true;
}
