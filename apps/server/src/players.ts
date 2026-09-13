import { createHash, randomBytes, randomInt, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import {
  BATTLEGROUNDS_ELO_MAX, CASE_COST, CASE_XP, DAILY_REWARD, DECK_SIZE, DEFAULT_BATTLEGROUNDS_ELO,
  MATCH_DRAW_XP, MATCH_LOSS_XP, MATCH_WIN_XP, PACK_COST, PACK_SIZE, PACK_XP, WIN_REWARD, XP_AWARDS,
  battlegroundsEloDelta, battlegroundsXp, remainingMlFromElo, starterCards,
  type CardDefinition, type CaseResult, type LadderRow, type LootCard, type MatchRewards,
  type PackResult, type PlayerLibrary, type PlayerLogin, type PlayerProfile, type SavedDeck,
} from '@kartishki/shared';
import { type Database, type Sql } from './database';

const derive = promisify(scrypt);
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
export class PlayerError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
function credentials(username: unknown, password: unknown) {
  if (typeof username !== 'string' || !/^[\p{L}\p{N}_-]{3,24}$/u.test(username) || typeof password !== 'string' || password.length < 8 || password.length > 128) throw new PlayerError('invalidCredentials');
  return { username, login: username.normalize('NFKC').toLowerCase(), password };
}
type AuthRow = { id: string; password_salt: string; password_hash: string };
const packOdds: Record<string, number> = { common: 720, rare: 230, epic: 40, legendary: 9, ultimate: 1 };
const caseOdds: Record<string, number> = { common: 500, rare: 300, epic: 150, legendary: 40, ultimate: 10 };
function loot(card: CardDefinition): LootCard { return { id: card.id, rarity: card.rarity, name: card.name }; }
function pick(cards: CardDefinition[], odds: Record<string, number>) {
  const pool = cards.map(card => ({ card, weight: odds[card.rarity] ?? 0 })).filter(entry => entry.weight > 0);
  if (!pool.length) throw new PlayerError('emptyCatalog');
  let roll = randomInt(pool.reduce((sum, entry) => sum + entry.weight, 0));
  return pool.find(entry => { roll -= entry.weight; return roll < 0; })?.card ?? pool.at(-1)!.card;
}

export class PlayerStore {
  constructor(readonly db: Database) {}
  private async session(tx: Sql, playerId: string) {
    const token = randomBytes(32).toString('hex');
    await tx.query('DELETE FROM player_sessions WHERE player_id = $1 AND expires_at <= CURRENT_TIMESTAMP', [playerId]);
    await tx.query(`INSERT INTO player_sessions (token_hash, player_id, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '30 days')`, [digest(token), playerId]);
    return token;
  }
  async register(username: unknown, password: unknown): Promise<PlayerLogin> {
    const input = credentials(username, password), id = randomUUID(), salt = randomBytes(16).toString('hex');
    const hash = (await derive(input.password, salt, 64) as Buffer).toString('hex');
    try {
      return await this.db.transaction(async tx => {
        await tx.query('INSERT INTO players (id, username, login_key, password_salt, password_hash) VALUES ($1,$2,$3,$4,$5)', [id, input.username, input.login, salt, hash]);
        const cards = Array.from({ length: DECK_SIZE }, (_, n) => starterCards[n % starterCards.length].id);
        for (const cardId of new Set(cards)) await tx.query('INSERT INTO player_collection (player_id, card_id, copies) VALUES ($1,$2,$3)', [id, cardId, 10]);
        await tx.query('INSERT INTO player_decks (id, player_id, name, cards) VALUES ($1,$2,$3,$4::jsonb)', [randomUUID(), id, 'Стартовая колода', JSON.stringify(cards)]);
        return { token: await this.session(tx, id), library: await this.library(id, tx) };
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new PlayerError('usernameTaken', 409);
      throw error;
    }
  }
  async login(username: unknown, password: unknown): Promise<PlayerLogin> {
    const input = credentials(username, password);
    const user = (await this.db.query<AuthRow>('SELECT id, password_salt, password_hash FROM players WHERE login_key = $1', [input.login])).rows[0];
    // Unknown users pay the same password derivation cost.
    const hash = await derive(input.password, user?.password_salt ?? '0'.repeat(32), 64) as Buffer;
    if (!user || !timingSafeEqual(hash, Buffer.from(user.password_hash, 'hex'))) throw new PlayerError('loginFailed', 401);
    return this.db.transaction(async tx => ({ token: await this.session(tx, user.id), library: await this.library(user.id, tx) }));
  }
  async authenticate(token: unknown): Promise<string> {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new PlayerError('loginRequired', 401);
    const row = (await this.db.query<{ player_id: string }>('SELECT player_id FROM player_sessions WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP', [digest(token)])).rows[0];
    if (!row) throw new PlayerError('loginRequired', 401);
    return row.player_id;
  }
  async logout(token: string) { await this.db.query('DELETE FROM player_sessions WHERE token_hash = $1', [digest(token)]); }
  async library(playerId: string, tx: Sql = this.db): Promise<PlayerLibrary> {
    const row = (await tx.query<{ id: string; username: string; elo: string | number; currency: string | number; xp: string | number; lastDaily: string | null; today: string }>(
      'SELECT id, username, elo, currency, xp, last_daily::text AS "lastDaily", CURRENT_DATE::text AS today FROM players WHERE id = $1', [playerId])).rows[0];
    if (!row) throw new PlayerError('loginRequired', 401);
    const lastDaily = row.lastDaily ? String(row.lastDaily).slice(0, 10) : null;
    const profile: PlayerProfile = {
      id: row.id, username: row.username, elo: Number(row.elo), currency: Number(row.currency), xp: Number(row.xp),
      lastDaily, dailyAvailable: !lastDaily || lastDaily < String(row.today).slice(0, 10),
    };
    const collection = (await tx.query<{ cardId: string; copies: number }>('SELECT card_id AS "cardId", copies FROM player_collection WHERE player_id = $1 ORDER BY card_id', [playerId])).rows
      .map(row => ({ cardId: row.cardId, copies: Number(row.copies) }));
    const decks = (await tx.query<SavedDeck>('SELECT id, name, cards, version FROM player_decks WHERE player_id = $1 ORDER BY name, id', [playerId])).rows
      .map(row => ({ ...row, version: Number(row.version) }));
    return { profile, collection, decks };
  }
  async ladder(): Promise<LadderRow[]> {
    return (await this.db.query<{ username: string; elo: string | number; xp: string | number }>(
      'SELECT username, elo, xp FROM players ORDER BY elo DESC, username LIMIT 10')).rows
      .map(row => {
        const elo = Number(row.elo);
        return { username: row.username, elo, xp: Number(row.xp), remainingMl: remainingMlFromElo(elo) };
      });
  }
  private async validateDeck(tx: Sql, playerId: string, cards: unknown, catalog: CardDefinition[]): Promise<string[]> {
    if (!Array.isArray(cards) || cards.length !== DECK_SIZE || !cards.every(id => typeof id === 'string' && catalog.some(c => c.id === id))) throw new PlayerError('invalidDeck');
    const owned = (await tx.query<{ card_id: string; copies: number }>('SELECT card_id, copies FROM player_collection WHERE player_id = $1', [playerId])).rows;
    const counts = new Map<string, number>();
    for (const id of cards) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [id, count] of counts) if (count > Number(owned.find(c => c.card_id === id)?.copies ?? 0)) throw new PlayerError('cardsNotOwned');
    return [...cards];
  }
  async saveDeck(playerId: string, input: unknown, catalog: CardDefinition[]): Promise<SavedDeck> {
    if (!input || typeof input !== 'object') throw new PlayerError('invalidDeck');
    const { id, name, cards, version } = input as Record<string, unknown>;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 60 || (id !== undefined && (!uuid(id) || !Number.isInteger(version) || Number(version) < 1))) throw new PlayerError('invalidDeck');
    return this.db.transaction(async tx => {
      // Owner lock serializes deck quota checks and concurrent saves.
      await tx.query('SELECT id FROM players WHERE id = $1 FOR UPDATE', [playerId]);
      const checked = await this.validateDeck(tx, playerId, cards, catalog);
      if (id) {
        const row = (await tx.query<SavedDeck>('UPDATE player_decks SET name=$1, cards=$2::jsonb, version=version+1 WHERE id=$3 AND player_id=$4 AND version=$5 RETURNING id,name,cards,version', [name.trim(), JSON.stringify(checked), id, playerId, version])).rows[0];
        if (!row) throw new PlayerError('deckConflict', 409);
        return { ...row, version: Number(row.version) };
      }
      if ((await tx.query('SELECT id FROM player_decks WHERE player_id=$1', [playerId])).rows.length >= 10) throw new PlayerError('deckLimit');
      const created = (await tx.query<SavedDeck>('INSERT INTO player_decks (id,player_id,name,cards) VALUES ($1,$2,$3,$4::jsonb) RETURNING id,name,cards,version', [randomUUID(),playerId,name.trim(),JSON.stringify(checked)])).rows[0];
      return { ...created, version: Number(created.version) };
    });
  }
  async deleteDeck(playerId: string, id: unknown, version: unknown) {
    if (!uuid(id) || !Number.isInteger(version)) throw new PlayerError('invalidDeck');
    if (!(await this.db.query('DELETE FROM player_decks WHERE id=$1 AND player_id=$2 AND version=$3 RETURNING id', [id,playerId,version])).rows.length) throw new PlayerError('deckConflict',409);
  }
  async matchDeck(playerId: string, id: unknown, catalog: CardDefinition[]) {
    if (!uuid(id)) throw new PlayerError('invalidDeck');
    return this.db.transaction(async tx => {
      const row = (await tx.query<SavedDeck>('SELECT id,name,cards,version FROM player_decks WHERE id=$1 AND player_id=$2', [id,playerId])).rows[0];
      if (!row) throw new PlayerError('invalidDeck');
      return this.validateDeck(tx, playerId, row.cards, catalog);
    });
  }
  async claimDaily(playerId: string): Promise<PlayerLibrary> {
    return this.db.transaction(async tx => {
      // ponytail: server local date; switch to UTC day if the game goes global
      const row = (await tx.query<{ id: string }>('UPDATE players SET currency = currency + $2, last_daily = CURRENT_DATE WHERE id = $1 AND (last_daily IS NULL OR last_daily < CURRENT_DATE) RETURNING id', [playerId, DAILY_REWARD])).rows[0];
      if (!row) throw new PlayerError('alreadyClaimed', 409);
      return this.library(playerId, tx);
    });
  }
  private async grant(tx: Sql, playerId: string, cards: CardDefinition[], cost: number, xpGain: number) {
    const paid = (await tx.query<{ currency: string | number; xp: string | number }>('UPDATE players SET currency = currency - $2, xp = xp + $3 WHERE id = $1 AND currency >= $2 RETURNING currency, xp', [playerId, cost, xpGain])).rows[0];
    if (!paid) throw new PlayerError('insufficientFunds');
    for (const card of cards) {
      await tx.query(`INSERT INTO player_collection (player_id, card_id, copies) VALUES ($1,$2,1)
        ON CONFLICT (player_id, card_id) DO UPDATE SET copies = player_collection.copies + 1`, [playerId, card.id]);
    }
    return { currency: Number(paid.currency), xp: Number(paid.xp) };
  }
  async addXp(playerId: string, amount: unknown): Promise<PlayerLibrary> {
    if (!Number.isInteger(amount) || !XP_AWARDS.includes(amount as typeof XP_AWARDS[number])) throw new PlayerError('invalidRequest');
    return this.db.transaction(async tx => {
      await tx.query('UPDATE players SET xp = xp + $2 WHERE id = $1', [playerId, amount]);
      return this.library(playerId, tx);
    });
  }
  async openPack(playerId: string, catalog: CardDefinition[]): Promise<PackResult> {
    if (!catalog.length) throw new PlayerError('emptyCatalog');
    return this.db.transaction(async tx => {
      await tx.query('SELECT id FROM players WHERE id = $1 FOR UPDATE', [playerId]);
      const cards = Array.from({ length: PACK_SIZE }, () => pick(catalog, packOdds));
      if (cards.every(card => card.rarity === 'common') && catalog.some(card => card.rarity !== 'common')) {
        cards[PACK_SIZE - 1] = pick(catalog.filter(card => card.rarity !== 'common'), packOdds);
      }
      const paid = await this.grant(tx, playerId, cards, PACK_COST, PACK_XP);
      return { cards: cards.map(loot), ...paid };
    });
  }
  async openCase(playerId: string, catalog: CardDefinition[]): Promise<CaseResult> {
    if (!catalog.length) throw new PlayerError('emptyCatalog');
    return this.db.transaction(async tx => {
      await tx.query('SELECT id FROM players WHERE id = $1 FOR UPDATE', [playerId]);
      const prize = pick(catalog, caseOdds);
      const landing = 18;
      const reel = Array.from({ length: 24 }, () => loot(pick(catalog, caseOdds)));
      reel[landing] = loot(prize);
      const paid = await this.grant(tx, playerId, [prize], CASE_COST, CASE_XP);
      return { prize: loot(prize), reel, landing, ...paid };
    });
  }
  async settleMatch(playerA: string, playerB: string, winnerId: string): Promise<Record<string, MatchRewards>> {
    if (playerA === playerB) throw new PlayerError('alreadyInMatch');
    return this.db.transaction(async tx => {
      const [first, second] = [playerA, playerB].sort();
      await tx.query('SELECT id FROM players WHERE id IN ($1,$2) FOR UPDATE', [first, second]);
      const rows = (await tx.query<{ id: string; elo: string | number; currency: string | number; xp: string | number }>('SELECT id, elo, currency, xp FROM players WHERE id IN ($1,$2)', [playerA, playerB])).rows;
      if (rows.length !== 2) throw new PlayerError('loginRequired', 401);
      const byId = new Map(rows.map(row => [row.id, { elo: Number(row.elo), currency: Number(row.currency), xp: Number(row.xp) }]));
      const result: Record<string, MatchRewards> = {};
      for (const id of [playerA, playerB]) {
        const own = byId.get(id)!, other = byId.get(id === playerA ? playerB : playerA)!;
        const expected = 1 / (1 + 10 ** ((other.elo - own.elo) / 400));
        const score = winnerId === '' ? 0.5 : winnerId === id ? 1 : 0;
        const elo = Math.max(0, Math.round(own.elo + 32 * (score - expected)));
        const gained = winnerId === id ? WIN_REWARD : 0;
        const xpGain = winnerId === '' ? MATCH_DRAW_XP : winnerId === id ? MATCH_WIN_XP : MATCH_LOSS_XP;
        const xp = own.xp + xpGain;
        await tx.query('UPDATE players SET elo = $2, currency = currency + $3, xp = $4 WHERE id = $1', [id, elo, gained, xp]);
        result[id] = { elo, currency: own.currency + gained, gained, xp };
      }
      return result;
    });
  }
  async settleVs(playerId: string, score: number, opponentElo = 1000): Promise<MatchRewards> {
    return this.db.transaction(async tx => {
      const row = (await tx.query<{ id: string; elo: string | number; currency: string | number; xp: string | number }>('SELECT id, elo, currency, xp FROM players WHERE id = $1 FOR UPDATE', [playerId])).rows[0];
      if (!row) throw new PlayerError('loginRequired', 401);
      const ownElo = Number(row.elo), currency = Number(row.currency);
      const expected = 1 / (1 + 10 ** ((opponentElo - ownElo) / 400));
      const elo = Math.max(0, Math.round(ownElo + 32 * (score - expected)));
      const gained = score === 1 ? WIN_REWARD : 0;
      const xpGain = score === 1 ? MATCH_WIN_XP : score === 0.5 ? MATCH_DRAW_XP : MATCH_LOSS_XP;
      const xp = Number(row.xp) + xpGain;
      await tx.query('UPDATE players SET elo = $2, currency = currency + $3, xp = $4 WHERE id = $1', [playerId, elo, gained, xp]);
      return { elo, currency: currency + gained, gained, xp };
    });
  }
  async settleBattlegrounds(results: { playerId: string; place: number }[], amount?: number, count = 0): Promise<Record<string, MatchRewards>> {
    const unique = new Map<string, number>();
    for (const row of results) if (row.playerId && row.place > 0) unique.set(row.playerId, row.place);
    if (unique.size < 1) return {};
    const field = count >= 2 ? count : unique.size;
    const eloAmount = Number.isInteger(amount) && amount! >= 0 && amount! <= BATTLEGROUNDS_ELO_MAX ? amount! : DEFAULT_BATTLEGROUNDS_ELO;
    return this.db.transaction(async tx => {
      const result: Record<string, MatchRewards> = {};
      for (const id of [...unique.keys()].sort()) {
        const row = (await tx.query<{ elo: string | number; currency: string | number; xp: string | number }>('SELECT elo, currency, xp FROM players WHERE id = $1 FOR UPDATE', [id])).rows[0];
        if (!row) continue;
        const place = unique.get(id)!;
        const eloDelta = battlegroundsEloDelta(place, field, eloAmount);
        const xpGain = battlegroundsXp(place, field);
        const elo = Math.max(0, Number(row.elo) + eloDelta);
        const xp = Number(row.xp) + xpGain;
        await tx.query('UPDATE players SET elo = $2, xp = $3 WHERE id = $1', [id, elo, xp]);
        result[id] = { elo, currency: Number(row.currency), gained: 0, xp };
      }
      return result;
    });
  }
}
