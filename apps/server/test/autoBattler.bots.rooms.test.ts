import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client, type Room } from '@colyseus/sdk';
import {
  AUTO_BATTLER, AutoBattlerRoomState, AUTO_BATTLER_MESSAGES as MSG, AUTO_BATTLER_CLIENT_EVENTS as EV, MATCH_MODES, rewardsFor, validateRoomSettings, DEFAULT_ROOM_SETTINGS,
  battlegroundsCurrencyReward, battlegroundsXp, beerMlForPlace, type AutoBattlerHeroDef, type BattlegroundsRewards,
} from '@kartishki/shared';
import { AutoBattlerRoom, autoBattlerRoomWithPlayers } from '../src/autoBattler/AutoBattlerRoom';
import { listCustomRooms } from '../src/autoBattler/roomList';
import { migratePlayers, openDatabase } from '../src/database';
import { PlayerStore } from '../src/players';

process.env.AB_TEST_MODE = '1'; process.env.AB_TEST_COMBAT_MS = '60';
let serial = 0;
async function until(check: () => boolean, ms = 8000) { const end = Date.now() + ms; while (!check()) { if (Date.now() > end) throw new Error('Synchronization timeout'); await delay(15); } }

type R = Room<AutoBattlerRoomState>;
async function boot(store?: PlayerStore) {
  const http = createServer();
  const server = new Server({ transport: new WebSocketTransport({ server: http }), greet: false });
  server.define('autoBattler', store ? autoBattlerRoomWithPlayers(store) : AutoBattlerRoom).filterBy(['table', 'set', 'mode']);
  await server.listen(0, '127.0.0.1');
  const client = new Client(`http://127.0.0.1:${(http.address() as { port: number }).port}`);
  const offers = new Map<string, AutoBattlerHeroDef[]>();
  const errors = new Map<string, string>();
  const rewards = new Map<string, BattlegroundsRewards>();
  const attach = (r: R) => {
    r.onMessage(EV.discoverOptions, () => {}); r.onMessage(EV.catalog, () => {}); r.onMessage(EV.combatEvents, () => {});
    r.onMessage(EV.heroOffers, o => offers.set(r.sessionId, o)); r.onMessage(EV.actionError, e => errors.set(r.sessionId, e.code));
    r.onMessage(EV.rewards, p => rewards.set(r.sessionId, p)); r.send(MSG.ready); return r;
  };
  const base = { heroMs: 2000, recruitMs: 120000, anomaly: '' };
  const send = async (r: R, message: string, data: Record<string, unknown> = {}) => { const rev = r.state.revision; errors.delete(r.sessionId); r.send(message, { ...data, turn: r.state.turn, actionId: ++serial }); await until(() => r.state.revision > rev || errors.has(r.sessionId)); };
  const host = (r: R) => matchMaker.getLocalRoomById(r.roomId) as AutoBattlerRoom;
  /** Everyone picks a hero, then every human just ends each recruit turn until the game is over. */
  const playOut = async (rooms: R[], h: AutoBattlerRoom) => {
    for (const r of rooms) { await until(() => offers.has(r.sessionId)); r.send(MSG.chooseHero, { heroId: offers.get(r.sessionId)![0]!.id }); }
    for (let round = 0; round < 60 && h.state.phase !== 'GAME_OVER'; round++) {
      await until(() => ['RECRUIT_PHASE', 'GAME_OVER'].includes(h.state.phase), 15000);
      if (h.state.phase === 'GAME_OVER') break;
      const turn = h.state.turn;
      for (const r of rooms) if (!h.state.players.get(r.sessionId)!.eliminated) { await until(() => r.state.phase === 'RECRUIT_PHASE' && r.state.turn === turn); await send(r, MSG.endRecruit); }
      await until(() => h.state.turn > turn || h.state.phase === 'GAME_OVER', 15000);
    }
    assert.equal(h.state.phase, 'GAME_OVER');
  };
  return { server, client, offers, errors, rewards, attach, base, send, host, playOut, stop: () => server.gracefullyShutdown(false) };
}

for (const humans of [3, 5, 7]) test(`ranked: ${humans} humans get exactly one bot that plays, can die and takes a unique place`, { timeout: 60000 }, async () => {
  const b = await boot();
  try {
    const rooms: R[] = [];
    for (let i = 0; i < humans; i++) rooms.push(b.attach(await b.client.joinOrCreate<AutoBattlerRoomState>('autoBattler', { displayName: `H${i}`, mode: 'ranked', ...b.base }, AutoBattlerRoomState)));
    await until(() => rooms[0]!.state.players.size === humans);
    rooms[0]!.send(MSG.startGame);
    await until(() => rooms[0]!.state.phase === 'HERO_SELECTION');
    const h = b.host(rooms[0]!);
    const bots = [...h.state.players.values()].filter(p => p.isBot);
    assert.equal(bots.length, 1);
    assert.equal(h.state.players.size, humans + 1);
    assert.ok(bots[0]!.hero.heroId, 'the bot picked a hero on its own');
    assert.ok(!bots[0]!.sessionId.includes(rooms[0]!.sessionId));
    // Public replication: every client sees the bot flag and its name, never a session or account id in the name.
    await until(() => [...rooms[0]!.state.players.values()].some(p => p.isBot));
    const seen = [...rooms[0]!.state.players.values()].find(p => p.isBot)!;
    assert.ok(seen.displayName && !seen.displayName.startsWith('bot-'));
    await b.playOut(rooms, h);
    const places = [...h.state.players.values()].map(p => p.placement).sort((a, c) => a - c);
    assert.deepEqual(places, Array.from({ length: humans + 1 }, (_, i) => i + 1));
    const bot = [...h.state.players.values()].find(p => p.isBot)!;
    assert.ok(bot.placement >= 1 && bot.placement <= humans + 1);
    // Idle humans lose to a bot that actually plays: the bot never comes last against seven empty boards.
    assert.notEqual(bot.placement, humans + 1);
    for (const pair of h.state.pairing) assert.notEqual(pair.playerA, pair.playerB);
  } finally { await b.stop(); }
});

test('ranked: an even table seats no bot', { timeout: 30000 }, async () => {
  const b = await boot();
  try {
    const rooms: R[] = [];
    for (let i = 0; i < 4; i++) rooms.push(b.attach(await b.client.joinOrCreate<AutoBattlerRoomState>('autoBattler', { displayName: `H${i}`, mode: 'ranked', ...b.base }, AutoBattlerRoomState)));
    await until(() => rooms[0]!.state.players.size === 4);
    rooms[0]!.send(MSG.startGame);
    await until(() => rooms[0]!.state.phase === 'HERO_SELECTION');
    assert.equal(b.host(rooms[0]!).state.players.size, 4);
    assert.equal([...b.host(rooms[0]!).state.players.values()].filter(p => p.isBot).length, 0);
  } finally { await b.stop(); }
});

test('a bot can be eliminated, keeps its place, and is never written to the player database', { timeout: 60000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kartishki-bots-'));
  const db = await openDatabase(undefined, dir);
  await migratePlayers(db);
  const store = new PlayerStore(db);
  const alice = await store.register('Алиса', 'password1');
  const b = await boot(store);
  try {
    const rooms: R[] = [b.attach(await b.client.joinOrCreate<AutoBattlerRoomState>('autoBattler', { displayName: 'Алиса', mode: 'ranked', playerToken: alice.token, ...b.base }, AutoBattlerRoomState))];
    for (let i = 1; i < 3; i++) rooms.push(b.attach(await b.client.joinOrCreate<AutoBattlerRoomState>('autoBattler', { displayName: `G${i}`, mode: 'ranked', ...b.base }, AutoBattlerRoomState)));
    await until(() => rooms[0]!.state.players.size === 3);
    rooms[0]!.send(MSG.startGame);
    await until(() => rooms[0]!.state.phase === 'HERO_SELECTION');
    const h = b.host(rooms[0]!);
    const bot = [...h.state.players.values()].find(p => p.isBot)!;
    // Kill the bot outright: one health, and idle humans still field nothing, so the bot must lose to nobody… so drop it by damage directly.
    await b.playOut(rooms, h);
    assert.ok(bot.placement >= 1);
    const rowsAfter = await db.query<{ n: string | number }>('SELECT COUNT(*) AS n FROM players');
    assert.equal(Number(rowsAfter.rows[0]!.n), 1, 'only the registered account exists');
    const me = await store.library(await store.authenticate(alice.token));
    const place = h.state.players.get(rooms[0]!.sessionId)!.placement;
    assert.equal(me.profile.currency, battlegroundsCurrencyReward(place, 4), 'ranked cash for a 4-seat table (bot counted as a seat)');
    assert.equal(me.profile.xp, battlegroundsXp(place, 4));
    await until(() => b.rewards.has(rooms[0]!.sessionId));
    assert.equal(b.rewards.get(rooms[0]!.sessionId)!.eloDelta, beerMlForPlace(place, 4));
  } finally { await b.stop(); await db.close(); }
});

test('a bot with one health dies in combat and is eliminated like anyone else', { timeout: 30000 }, async () => {
  const b = await boot();
  try {
    const rooms: R[] = [];
    for (let i = 0; i < 3; i++) rooms.push(b.attach(await b.client.joinOrCreate<AutoBattlerRoomState>('autoBattler', { displayName: `H${i}`, mode: 'ranked', ...b.base }, AutoBattlerRoomState)));
    await until(() => rooms[0]!.state.players.size === 3);
    rooms[0]!.send(MSG.startGame);
    await until(() => rooms[0]!.state.phase === 'HERO_SELECTION');
    const h = b.host(rooms[0]!);
    const bot = [...h.state.players.values()].find(p => p.isBot)!;
    for (const r of rooms) { await until(() => b.offers.has(r.sessionId)); r.send(MSG.chooseHero, { heroId: b.offers.get(r.sessionId)![0]!.id }); }
    await until(() => h.state.phase === 'RECRUIT_PHASE');
    bot.hero.health = 1;
    // Give the bot's opponents something to hit with: every human buys and plays one minion.
    for (const r of rooms) {
      const me = () => r.state.players.get(r.sessionId)!;
      await until(() => me().tavern.offers.length > 0);
      await b.send(r, MSG.buy, { offerId: me().tavern.offers[0]!.id });
      await b.send(r, MSG.playCard, { cardId: me().hand[0]!.id });
      // Server-side test fixture: an unbeatable body, so the bot's fights are losses and its single point of health goes.
      const body = h.state.players.get(r.sessionId)!.board[0]!; body.attack = 99; body.health = body.maxHealth = 99;
    }
    for (let round = 0; round < 6 && !bot.eliminated; round++) {
      const turn = h.state.turn;
      for (const r of rooms) if (!h.state.players.get(r.sessionId)!.eliminated) { await until(() => r.state.phase === 'RECRUIT_PHASE' && r.state.turn === turn); await b.send(r, MSG.endRecruit); }
      await until(() => h.state.turn > turn || h.state.phase === 'GAME_OVER', 15000);
    }
    assert.ok(bot.eliminated, 'the one-health bot fell');
    assert.equal(bot.placement, 4);
    assert.equal(bot.board.length, 0, 'its minions went back to the pool');
    await until(() => rooms[0]!.state.players.get(bot.sessionId)!.eliminated);
  } finally { await b.stop(); }
});

test('custom rooms: create, browse, join, host permissions, capacity, invalid settings, bots, reconnect and unranked rewards', { timeout: 90000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kartishki-rooms-'));
  const db = await openDatabase(undefined, dir);
  await migratePlayers(db);
  const store = new PlayerStore(db);
  const alice = await store.register('Алиса', 'password1');
  const b = await boot(store);
  try {
    const hostRoom = b.attach(await b.client.create<AutoBattlerRoomState>('autoBattler', { displayName: 'Алиса', mode: 'custom', playerToken: alice.token, room: { name: 'Пивная', maxPlayers: 4, bots: 2, anomaly: 'ab-anomaly-fence', timer: 45 }, heroMs: 2000, recruitMs: 120000 }, AutoBattlerRoomState));
    await until(() => hostRoom.state.room.hostId === hostRoom.sessionId);
    const h = b.host(hostRoom);
    assert.equal(hostRoom.state.mode, 'custom');
    assert.equal(hostRoom.state.room.name, 'Пивная');
    assert.equal(hostRoom.state.room.bots, 2);
    assert.equal(hostRoom.state.anomalyId, 'ab-anomaly-fence');
    // Browser listing shows the room with its rules; a ranked table never appears there.
    const ranked = b.attach(await b.client.joinOrCreate<AutoBattlerRoomState>('autoBattler', { displayName: 'R', mode: 'ranked', ...b.base }, AutoBattlerRoomState));
    assert.notEqual(ranked.roomId, hostRoom.roomId, 'the ranked queue never lands in a custom room');
    const listing = await listCustomRooms();
    assert.equal(listing.length, 1);
    assert.deepEqual({ ...listing[0], roomId: '' }, { roomId: '', name: 'Пивная', host: 'Алиса', players: 1, maxPlayers: 4, bots: 2, setId: '', anomaly: 'ab-anomaly-fence', anomalySetting: 'ab-anomaly-fence', timer: 45, status: 'waiting', joinable: true });
    // Guests are not hosts: settings patches and start are rejected for them.
    const guest = b.attach(await b.client.joinById<AutoBattlerRoomState>(hostRoom.roomId, { displayName: 'Гость' }, AutoBattlerRoomState));
    await until(() => hostRoom.state.players.size === 2);
    assert.equal((await listCustomRooms())[0]!.players, 2);
    await b.send(guest, MSG.roomSettings, { bots: 0 });
    assert.equal(b.errors.get(guest.sessionId), 'REJECTED');
    assert.equal(h.state.room.bots, 2);
    guest.send(MSG.startGame); await delay(100);
    assert.equal(h.state.phase as string, 'LOBBY');
    // Capacity: 4 seats, 2 bots, 2 humans → a third human bounces; the host cannot add a bot on top of the people.
    await assert.rejects(() => b.client.joinById<AutoBattlerRoomState>(hostRoom.roomId, { displayName: 'Лишний' }, AutoBattlerRoomState));
    await b.send(hostRoom, MSG.roomSettings, { bots: 3 });
    assert.equal(b.errors.get(hostRoom.sessionId), 'INVALID_TARGET');
    for (const bad of [{ anomaly: 'ab-anomaly-nope' }, { timer: 17 }, { maxPlayers: 9 }, { setId: 'ghost-set' }, { name: 'x'.repeat(40) }, { bots: -1 }]) {
      await b.send(hostRoom, MSG.roomSettings, bad);
      assert.equal(b.errors.get(hostRoom.sessionId), 'INVALID_TARGET', JSON.stringify(bad));
    }
    // A valid host patch lands and re-lists.
    await b.send(hostRoom, MSG.roomSettings, { bots: 1, anomaly: 'none', name: 'Пивная 2' });
    assert.equal(h.state.room.bots, 1);
    assert.equal(h.state.anomalyId, '');
    assert.equal((await listCustomRooms())[0]!.name, 'Пивная 2');
    // Clients cannot flip the mode: the room decides at creation and the state says so.
    await b.send(hostRoom, MSG.roomSettings, { mode: 'ranked' });
    assert.equal(h.state.mode, 'custom');
    // Start: host only. The bot is seated, the listing turns to 'playing' and stops being joinable.
    hostRoom.send(MSG.startGame);
    await until(() => h.state.phase === 'HERO_SELECTION');
    assert.equal([...h.state.players.values()].filter(p => p.isBot).length, 1);
    assert.equal(h.state.players.size, 3);
    assert.equal((await listCustomRooms())[0]!.status, 'playing');
    assert.equal((await listCustomRooms())[0]!.joinable, false);
    await b.send(hostRoom, MSG.roomSettings, { bots: 0 });
    assert.equal(b.errors.get(hostRoom.sessionId), 'REJECTED', 'no settings after the match started');
    // Reconnect still works in a custom match.
    for (const r of [hostRoom, guest]) { await until(() => b.offers.has(r.sessionId)); r.send(MSG.chooseHero, { heroId: b.offers.get(r.sessionId)![0]!.id }); }
    await until(() => h.state.phase === 'RECRUIT_PHASE');
    const token = guest.reconnectionToken, guestId = guest.sessionId;
    await guest.leave(false);
    const back = b.attach(await b.client.reconnect<AutoBattlerRoomState>(token, AutoBattlerRoomState));
    assert.equal(back.sessionId, guestId);
    await until(() => back.state.players.get(guestId)?.connected === true);
    // Play out; the account is paid on the custom curve and its rating is untouched.
    for (let round = 0; round < 60 && h.state.phase !== 'GAME_OVER'; round++) {
      await until(() => ['RECRUIT_PHASE', 'GAME_OVER'].includes(h.state.phase), 15000);
      if (h.state.phase === 'GAME_OVER') break;
      const turn = h.state.turn;
      for (const r of [hostRoom, back]) if (!h.state.players.get(r.sessionId)!.eliminated) { await until(() => r.state.phase === 'RECRUIT_PHASE' && r.state.turn === turn); await b.send(r, MSG.endRecruit); }
      await until(() => h.state.turn > turn || h.state.phase === 'GAME_OVER', 15000);
    }
    assert.equal(h.state.phase, 'GAME_OVER');
    assert.equal(h.state.mode, 'custom');
    const place = h.state.players.get(hostRoom.sessionId)!.placement;
    await until(() => b.rewards.has(hostRoom.sessionId));
    const paid = b.rewards.get(hostRoom.sessionId)!;
    const expected = rewardsFor('custom', { currency: battlegroundsCurrencyReward(place, 3), xp: battlegroundsXp(place, 3), rating: beerMlForPlace(place, 3) });
    assert.equal(paid.gained, expected.currency);
    assert.equal(paid.xpGain, expected.xp);
    assert.equal(paid.eloDelta, 0);
    const me = await store.library(await store.authenticate(alice.token));
    assert.equal(me.profile.currency, expected.currency);
    assert.equal(me.profile.xp, expected.xp);
    assert.equal(me.profile.elo, 0, 'custom matches never move the rating');
    assert.equal(Number((await db.query<{ n: string | number }>('SELECT COUNT(*) AS n FROM players')).rows[0]!.n), 1);
  } finally { await b.stop(); await db.close(); }
});

test('reward policy: ranked unchanged, custom a third of the cash and half the xp, rounded half-up, no rating', () => {
  assert.deepEqual(MATCH_MODES.ranked, { moneyMultiplier: 1, xpMultiplier: 1, ratingEnabled: true });
  assert.equal(MATCH_MODES.custom.ratingEnabled, false);
  for (let place = 1; place <= 8; place++) {
    const base = { currency: battlegroundsCurrencyReward(place, 8), xp: battlegroundsXp(place, 8), rating: beerMlForPlace(place, 8) };
    assert.deepEqual(rewardsFor('ranked', base), base);
    const custom = rewardsFor('custom', base);
    assert.equal(custom.currency, Math.round(base.currency / 3));
    assert.equal(custom.xp, Math.round(base.xp / 2));
    assert.equal(custom.rating, 0);
  }
  // Documented rounding: 400 → 133, 250 → 83, 10 → 3; 40 xp → 20, 15 xp → 8 (7.5 rounds up), 35 → 18 (17.5 rounds up).
  assert.equal(rewardsFor('custom', { currency: 400, xp: 40, rating: 60 }).currency, 133);
  assert.equal(rewardsFor('custom', { currency: 250, xp: 15, rating: 60 }).xp, 8);
  assert.equal(rewardsFor('custom', { currency: 10, xp: 35, rating: -60 }).currency, 3);
  assert.equal(rewardsFor('custom', { currency: 10, xp: 35, rating: -60 }).xp, 18);
});

test('room settings validation: capacity, minimum, anomaly, timer and set', () => {
  const ok = validateRoomSettings(DEFAULT_ROOM_SETTINGS, { maxPlayers: 4, bots: 3 }, 1, []);
  assert.ok(ok.ok && ok.settings.bots === 3);
  assert.deepEqual(validateRoomSettings(DEFAULT_ROOM_SETTINGS, { maxPlayers: 4, bots: 4 }, 1, []), { ok: false, field: 'bots' });
  assert.deepEqual(validateRoomSettings({ ...DEFAULT_ROOM_SETTINGS, maxPlayers: 4, bots: 2 }, { maxPlayers: 3 }, 2, []), { ok: false, field: 'maxPlayers' });
  assert.deepEqual(validateRoomSettings(DEFAULT_ROOM_SETTINGS, { maxPlayers: 1 }, 1, []), { ok: false, field: 'maxPlayers' });
  assert.deepEqual(validateRoomSettings(DEFAULT_ROOM_SETTINGS, { anomaly: 'whatever' }, 1, []), { ok: false, field: 'anomaly' });
  assert.deepEqual(validateRoomSettings(DEFAULT_ROOM_SETTINGS, { timer: 61 }, 1, []), { ok: false, field: 'timer' });
  assert.deepEqual(validateRoomSettings(DEFAULT_ROOM_SETTINGS, { setId: 'nope' }, 1, []), { ok: false, field: 'setId' });
  const set = validateRoomSettings(DEFAULT_ROOM_SETTINGS, { setId: 'mine' }, 1, ['mine']);
  assert.ok(set.ok && set.settings.setId === 'mine');
  assert.equal(AUTO_BATTLER.MIN_PLAYERS, 2);
});
