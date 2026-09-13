import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CASE_COST, CASE_XP, CASINO_XP, DAILY_REWARD, MATCH_LOSS_XP, MATCH_WIN_XP, PACK_COST, PACK_XP, WIN_REWARD, battlegroundsEloDelta, remainingMlFromElo, starterCards } from '@kartishki/shared';
import { migratePlayers, openDatabase } from '../src/database';
import { PlayerError, PlayerStore } from '../src/players';

test('players persist decks, daily ink, packs, cases and ranked results', { timeout: 30000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kartishki-players-'));
  const db = await openDatabase(undefined, dir);
  try {
    await migratePlayers(db); await migratePlayers(db);
    const store = new PlayerStore(db);
    const alice = await store.register('Алиса', 'password1');
    await assert.rejects(() => store.register('алиса', 'password1'), error => error instanceof PlayerError && error.code === 'usernameTaken');
    await assert.rejects(() => store.login('Алиса', 'wrongpass'), error => error instanceof PlayerError && error.code === 'loginFailed');
    const again = await store.login('Алиса', 'password1');
    assert.equal(again.library.profile.elo, 1000);
    assert.equal(again.library.profile.xp, 0);
    assert.equal(again.library.profile.currency, 0);
    assert.equal(again.library.profile.dailyAvailable, true);
    assert.equal(again.library.profile.lastDaily, null);
    assert.equal(again.library.decks[0]!.cards.length, 30);
    const playerId = await store.authenticate(again.token);
    await assert.rejects(() => store.saveDeck(playerId, { name: 'Мало', cards: again.library.decks[0]!.cards.slice(0, 29) }, starterCards), error => error instanceof PlayerError && error.code === 'invalidDeck');
    const saved = await store.saveDeck(playerId, { id: again.library.decks[0]!.id, name: 'Боевая', cards: again.library.decks[0]!.cards, version: again.library.decks[0]!.version }, starterCards);
    assert.equal(saved.name, 'Боевая');
    assert.equal(saved.version, again.library.decks[0]!.version + 1);
    const matchCards = await store.matchDeck(playerId, saved.id, starterCards);
    assert.equal(matchCards.length, 30);
    await assert.rejects(() => store.openPack(playerId, starterCards), error => error instanceof PlayerError && error.code === 'insufficientFunds');
    const daily = await store.claimDaily(playerId);
    assert.equal(daily.profile.currency, DAILY_REWARD);
    assert.equal(daily.profile.dailyAvailable, false);
    assert.equal(daily.profile.lastDaily?.length, 10);
    await assert.rejects(() => store.claimDaily(playerId), error => error instanceof PlayerError && error.code === 'alreadyClaimed');
    const pack = await store.openPack(playerId, starterCards);
    assert.equal(pack.cards.length, 5);
    assert.equal(pack.currency, DAILY_REWARD - PACK_COST);
    assert.equal(pack.xp, PACK_XP);
    assert.equal((await store.library(playerId)).profile.xp, PACK_XP);
    const afterPack = await store.library(playerId);
    assert.ok(afterPack.collection.reduce((sum, row) => sum + row.copies, 0) > again.library.collection.reduce((sum, row) => sum + row.copies, 0));
    await db.query('UPDATE players SET currency = $2 WHERE id = $1', [playerId, CASE_COST]);
    const crate = await store.openCase(playerId, starterCards);
    assert.equal(crate.reel[crate.landing]!.id, crate.prize.id);
    assert.equal(crate.currency, 0);
    assert.equal(crate.xp, PACK_XP + CASE_XP);
    const bob = await store.register('Борис', 'password1');
    const rewards = await store.settleMatch(playerId, bob.library.profile.id, playerId);
    assert.equal(rewards[playerId]!.gained, WIN_REWARD);
    assert.equal(rewards[playerId]!.xp, PACK_XP + CASE_XP + MATCH_WIN_XP);
    assert.equal(rewards[bob.library.profile.id]!.xp, MATCH_LOSS_XP);
    assert.ok(rewards[playerId]!.elo > 1000);
    assert.ok(rewards[bob.library.profile.id]!.elo < 1000);
    const vsGuest = await store.settleVs(playerId, 1);
    assert.ok(vsGuest.elo > rewards[playerId]!.elo);
    assert.equal(vsGuest.xp, PACK_XP + CASE_XP + MATCH_WIN_XP + MATCH_WIN_XP);
    const afterSpin = await store.addXp(playerId, CASINO_XP);
    assert.equal(afterSpin.profile.xp, vsGuest.xp + CASINO_XP);
    await assert.rejects(() => store.addXp(playerId, 7), error => error instanceof PlayerError && error.code === 'invalidRequest');
    const beforeBg = await store.library(playerId);
    const bg = await store.settleBattlegrounds([
      { playerId, place: 1 },
      { playerId: bob.library.profile.id, place: 2 },
    ], 40, 2);
    assert.equal(bg[playerId]!.elo, beforeBg.profile.elo + battlegroundsEloDelta(1, 2, 40));
    assert.equal(bg[playerId]!.xp, beforeBg.profile.xp + MATCH_WIN_XP);
    assert.equal(bg[bob.library.profile.id]!.xp, MATCH_LOSS_XP + MATCH_LOSS_XP);
    const ladder = await store.ladder();
    assert.equal(ladder[0]!.username, 'Алиса');
    assert.equal(ladder[0]!.xp, PACK_XP + CASE_XP + MATCH_WIN_XP + MATCH_WIN_XP + CASINO_XP + MATCH_WIN_XP);
    assert.equal(ladder[0]!.remainingMl, remainingMlFromElo(ladder[0]!.elo));
    await store.logout(again.token);
    await assert.rejects(() => store.authenticate(again.token), error => error instanceof PlayerError && error.code === 'loginRequired');
  } finally {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
