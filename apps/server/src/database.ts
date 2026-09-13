import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Sql {
  query<T extends Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Database extends Sql {
  transaction<T>(run: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Neon and sslmode=require need explicit TLS; local postgres URLs stay plain. */
export function postgresPoolConfig(url: string): pg.PoolConfig {
  const requireSsl = /(?:^|[?&])sslmode=(?:require|verify-ca|verify-full)(?:&|$)/i.test(url)
    || /(?:^|[.@/])neon\.tech(?:[:/?]|$)/i.test(url);
  return { connectionString: url, ...(requireSsl ? { ssl: { rejectUnauthorized: true } } : {}) };
}

export async function openDatabase(url?: string, dataDir = resolve('data/players')): Promise<Database> {
  if (!url) {
    mkdirSync(dataDir, { recursive: true });
    const db = await PGlite.create(dataDir);
    return { query: (text, values) => db.query(text, values), transaction: run => db.transaction(tx => run(tx)), close: () => db.close() };
  }
  const pool = new pg.Pool(postgresPoolConfig(url));
  return {
    query: (text, values) => pool.query(text, values),
    async transaction(run) {
      const client = await pool.connect();
      try { await client.query('BEGIN'); const result = await run(client); await client.query('COMMIT'); return result; }
      catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    close: () => pool.end(),
  };
}

// Additive migration: the existing card catalog and guest matches are untouched.
export async function migratePlayers(db: Database) {
  await db.transaction(async tx => {
    await tx.query(`CREATE TABLE IF NOT EXISTS player_schema_version (version INTEGER PRIMARY KEY)`);
    // Serializes simultaneous server startup on PostgreSQL.
    await tx.query('LOCK TABLE player_schema_version IN EXCLUSIVE MODE');
    const current = Number((await tx.query<{ version: string | number }>('SELECT COALESCE(MAX(version), 0) AS version FROM player_schema_version')).rows[0]?.version ?? 0);
    if (current < 1) {
      await tx.query(`CREATE TABLE players (
        id UUID PRIMARY KEY, username TEXT NOT NULL, login_key TEXT NOT NULL UNIQUE,
        password_salt TEXT NOT NULL, password_hash TEXT NOT NULL,
        elo INTEGER NOT NULL DEFAULT 1000, currency INTEGER NOT NULL DEFAULT 0 CHECK (currency >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
      await tx.query(`CREATE TABLE player_sessions (
        token_hash TEXT PRIMARY KEY, player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL)`);
      await tx.query('CREATE INDEX player_sessions_owner ON player_sessions(player_id)');
      await tx.query(`CREATE TABLE player_collection (
        player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE, card_id TEXT NOT NULL,
        copies INTEGER NOT NULL CHECK (copies > 0), PRIMARY KEY (player_id, card_id))`);
      await tx.query(`CREATE TABLE player_decks (
        id UUID PRIMARY KEY, player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        name TEXT NOT NULL, cards JSONB NOT NULL CHECK (jsonb_typeof(cards) = 'array' AND jsonb_array_length(cards) = 30),
        version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0))`);
      await tx.query('CREATE INDEX player_decks_owner ON player_decks(player_id)');
      await tx.query('INSERT INTO player_schema_version (version) VALUES (1)');
    }
    if (current < 2) {
      await tx.query('ALTER TABLE players ADD COLUMN IF NOT EXISTS last_daily DATE');
      await tx.query('INSERT INTO player_schema_version (version) VALUES (2)');
    }
    if (current < 3) {
      await tx.query('ALTER TABLE players ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0)');
      await tx.query('INSERT INTO player_schema_version (version) VALUES (3)');
    }
    if (current < 4) {
      await tx.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb`);
      await tx.query('INSERT INTO player_schema_version (version) VALUES (4)');
    }
  });
}
