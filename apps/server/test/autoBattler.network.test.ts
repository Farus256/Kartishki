import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client } from '@colyseus/sdk';
import {
  AUTO_BATTLER_CLIENT_EVENTS as EV,
  AUTO_BATTLER_MESSAGES as MSG,
  AutoBattlerRoomState,
  type AutoBattlerHeroDef,
  type CombatEventsMessage,
} from '@kartishki/shared';
import { AutoBattlerRoom } from '../src/autoBattler/AutoBattlerRoom';

process.env.AB_TEST_MODE = '1';
process.env.AB_TEST_COMBAT_MS = process.env.AB_TEST_COMBAT_MS || '80';
let seq = 0;
function intent(room: any, message: string, data: any = {}) { room.send(message, { ...data, turn: room.state.turn, actionId: ++seq }); }

async function until(check: () => boolean) {
  const deadline = Date.now() + 4000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('State synchronization timed out');
    await delay(20);
  }
}

test('two clients start an auto-battler, recruit, and receive combat events', { timeout: 15000 }, async () => {
  const http = createServer();
  const server = new Server({ transport: new WebSocketTransport({ server: http }), greet: false });
  server.define('autoBattler', AutoBattlerRoom);
  await server.listen(0, '127.0.0.1');
  const address = http.address();
  assert.ok(address && typeof address === 'object');
  const client = new Client(`http://127.0.0.1:${address.port}`);
  try {
    const a = await client.joinOrCreate<AutoBattlerRoomState>('autoBattler', { anomaly: '' }, AutoBattlerRoomState);
    let offersA: AutoBattlerHeroDef[] = [];
    let combatA: CombatEventsMessage | undefined;
    a.onMessage(EV.heroOffers, offers => { offersA = offers; });
    a.onMessage(EV.catalog, () => {});
    a.onMessage(EV.combatEvents, payload => { combatA = payload; });
    a.onMessage(EV.actionError, () => {});
    a.send(MSG.ready);

    const b = await client.joinOrCreate<AutoBattlerRoomState>('autoBattler', { anomaly: '' }, AutoBattlerRoomState);
    let offersB: AutoBattlerHeroDef[] = [];
    b.onMessage(EV.heroOffers, offers => { offersB = offers; });
    b.onMessage(EV.catalog, () => {});
    b.onMessage(EV.combatEvents, () => {});
    b.onMessage(EV.actionError, () => {});
    b.send(MSG.ready);

    assert.equal(a.roomId, b.roomId);
    await until(() => a.state.players.size === 2 && offersA.length >= 2 && offersB.length >= 2);
    assert.equal(a.state.phase, 'LOBBY');

    a.send(MSG.startGame);
    await until(() => a.state.phase === 'HERO_SELECTION');

    // A passive-gold hero (Tycoon) or token hero (Foreman) would skew turn-one checks.
    const heroA = offersA.find(hero => hero.power.id !== 'ab-power-rich' && hero.power.id !== 'ab-power-hand-token') ?? offersA[0]!;
    a.send(MSG.chooseHero, { heroId: heroA.id });
    b.send(MSG.chooseHero, { heroId: offersB[0]!.id });
    await until(() => a.state.phase === 'RECRUIT_PHASE' && a.state.turn === 1);

    const me = a.state.players.get(a.sessionId)!;
    assert.equal(me.gold, 3);
    assert.equal(me.upgradeCost, 5);
    assert.equal(me.hero.heroId, heroA.id);
    assert.ok(me.tavern.offers.length >= 1);
    assert.ok(me.nextOpponentId);

    const offerId = (me.tavern.offers.find(offer => offer.kind === 'minion') ?? me.tavern.offers[0]!).id;
    intent(a, MSG.buy, { offerId });
    await until(() => (a.state.players.get(a.sessionId)?.hand.length ?? 0) === 1);
    const afterBuy = a.state.players.get(a.sessionId)!;
    assert.ok(afterBuy.gold <= 1);
    assert.equal(afterBuy.hand.length, 1);
    intent(a, MSG.playCard, { cardId: afterBuy.hand[0]!.id });
    await until(() => a.state.players.get(a.sessionId)!.board.length === 1);

    intent(a, MSG.endRecruit);
    await until(() => a.state.players.get(a.sessionId)!.recruitReady);
    intent(a, MSG.cancelRecruit);
    await until(() => !a.state.players.get(a.sessionId)!.recruitReady);
    intent(a, MSG.endRecruit);
    intent(b, MSG.endRecruit);
    await until(() => {
      const meNow = a.state.players.get(a.sessionId);
      return !!combatA && !!meNow && meNow.lastCombatEventCount > 0
        && (a.state.phase === 'RECRUIT_PHASE' || a.state.phase === 'GAME_OVER');
    });
    assert.ok(combatA!.events.some(event => event.kind === 'COMBAT_START'));
    assert.ok(combatA!.events.some(event => event.kind === 'COMBAT_END'));
    assert.ok(a.state.players.get(a.sessionId)!.lastCombatSummary.length > 0);
  } finally {
    await server.gracefullyShutdown(false);
  }
});

test('recruit timer force-ends and emits combatEvents', { timeout: 15000 }, async () => {
  const http = createServer();
  const server = new Server({ transport: new WebSocketTransport({ server: http }), greet: false });
  server.define('autoBattler', AutoBattlerRoom);
  await server.listen(0, '127.0.0.1');
  const address = http.address();
  assert.ok(address && typeof address === 'object');
  const client = new Client(`http://127.0.0.1:${address.port}`);
  try {
    const a = await client.joinOrCreate<AutoBattlerRoomState>('autoBattler', { recruitMs: 600 }, AutoBattlerRoomState);
    let offersA: AutoBattlerHeroDef[] = [];
    let combatA: CombatEventsMessage | undefined;
    a.onMessage(EV.heroOffers, offers => { offersA = offers; });
    a.onMessage(EV.catalog, () => {});
    a.onMessage(EV.combatEvents, payload => { combatA = payload; });
    a.send(MSG.ready);
    const b = await client.joinOrCreate<AutoBattlerRoomState>('autoBattler', { anomaly: '' }, AutoBattlerRoomState);
    let offersB: AutoBattlerHeroDef[] = [];
    b.onMessage(EV.heroOffers, offers => { offersB = offers; });
    b.onMessage(EV.catalog, () => {});
    b.onMessage(EV.combatEvents, () => {});
    b.send(MSG.ready);
    await until(() => a.state.players.size === 2 && offersA.length >= 2 && offersB.length >= 2);
    a.send(MSG.startGame);
    await until(() => a.state.phase === 'HERO_SELECTION');
    a.send(MSG.chooseHero, { heroId: offersA[0]!.id });
    b.send(MSG.chooseHero, { heroId: offersB[0]!.id });
    await until(() => a.state.phase === 'RECRUIT_PHASE' && a.state.recruitSeconds > 0);
    const deadline = Date.now() + 8000;
    while (!combatA) {
      if (Date.now() > deadline) throw new Error('Timer did not start combat');
      await delay(40);
    }
    assert.ok(combatA.events.some(event => event.kind === 'COMBAT_START'));
    await until(() => a.state.phase === 'RECRUIT_PHASE' || a.state.phase === 'GAME_OVER');
    assert.ok((a.state.players.get(a.sessionId)?.lastCombatEventCount ?? 0) > 0);
  } finally {
    await server.gracefullyShutdown(false);
  }
});

test('invalid recruit actions are rejected with structured codes', { timeout: 15000 }, async () => {
  const http = createServer();
  const server = new Server({ transport: new WebSocketTransport({ server: http }), greet: false });
  server.define('autoBattler', AutoBattlerRoom);
  await server.listen(0, '127.0.0.1');
  const address = http.address();
  assert.ok(address && typeof address === 'object');
  const client = new Client(`http://127.0.0.1:${address.port}`);
  try {
    const a = await client.joinOrCreate<AutoBattlerRoomState>('autoBattler', { anomaly: '' }, AutoBattlerRoomState);
    let offersA: AutoBattlerHeroDef[] = [];
    let lastError = '';
    a.onMessage(EV.heroOffers, offers => { offersA = offers; });
    a.onMessage(EV.catalog, () => {});
    a.onMessage(EV.actionError, (payload: { code?: string } | string) => {
      lastError = typeof payload === 'string' ? payload : payload.code ?? '';
    });
    a.send(MSG.ready);
    const b = await client.joinOrCreate<AutoBattlerRoomState>('autoBattler', { anomaly: '' }, AutoBattlerRoomState);
    let offersB: AutoBattlerHeroDef[] = [];
    b.onMessage(EV.heroOffers, offers => { offersB = offers; });
    b.onMessage(EV.catalog, () => {});
    b.send(MSG.ready);
    await until(() => a.state.players.size === 2 && offersA.length >= 2 && offersB.length >= 2);
    intent(a, MSG.buy, { offerId: 'nope' });
    await until(() => lastError === 'ACTION_TOO_LATE' || lastError === 'WRONG_PHASE');
    a.send(MSG.startGame);
    await until(() => a.state.phase === 'HERO_SELECTION');
    a.send(MSG.chooseHero, { heroId: offersA[0]!.id });
    b.send(MSG.chooseHero, { heroId: offersB[0]!.id });
    await until(() => a.state.phase === 'RECRUIT_PHASE');
    lastError = '';
    intent(a, MSG.buy, { offerId: 'missing-slot' });
    await until(() => lastError === 'SHOP_SLOT_NOT_FOUND');
    const offer = a.state.players.get(a.sessionId)!.tavern.offers[0]!;
    intent(a, MSG.buy, { offerId: offer.id, boardIndex: 0 });
    await until(() => (a.state.players.get(a.sessionId)?.hand.length ?? 0) === 1);
  } finally {
    await server.gracefullyShutdown(false);
  }
});
