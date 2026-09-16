import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client } from '@colyseus/sdk';
import { MatchState, type HeroDefinition, type HandCard } from '@kartishki/shared';
import { MatchRoom } from '../src/MatchRoom';

async function until(check: () => boolean) {
  const deadline = Date.now() + 4000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('State synchronization timed out');
    await delay(20);
  }
}

test('two clients synchronize, reject invalid actions and finish on leave', { timeout: 15000 }, async () => {
  const http = createServer();
  const server = new Server({ transport: new WebSocketTransport({ server: http }), greet: false });
  server.define('match', MatchRoom);
  await server.listen(0, '127.0.0.1');
  const address = http.address();
  assert.ok(address && typeof address === 'object');
  const client = new Client(`http://127.0.0.1:${address.port}`);
  try {
    const a = await client.joinOrCreate<MatchState>('match', {}, MatchState);
    let handA: HandCard[] = [], handB: HandCard[] = [];
    let offersA: HeroDefinition[] = [], offersB: HeroDefinition[] = [];
    a.onMessage('heroOffers', h => { offersA = h; });
    a.onMessage('hand', h => { handA = h.cards; }); a.onMessage('catalog',()=>{}); a.onMessage('event',()=>{}); a.send('ready');
    const b = await client.joinOrCreate<MatchState>('match', {}, MatchState);
    b.onMessage('heroOffers', h => { offersB = h; });
    b.onMessage('hand', h => { handB = h.cards; }); b.onMessage('catalog',()=>{}); b.onMessage('event',()=>{}); b.send('ready');
    a.onMessage('actionError', () => {});
    let rejected = 0;
    b.onMessage('actionError', () => { rejected++; });
    assert.equal(a.roomId, b.roomId);
    await until(() => a.state.status === 'selecting' && offersA.length === 2 && offersB.length === 2);
    assert.equal(new Set(offersA.map(h => h.id)).size, 2);
    assert.equal(handA.length, 0);
    b.send('chooseHero', { heroId: 'forged-hero' }); await until(() => rejected === 1);
    assert.equal(b.state.players.get(b.sessionId)!.heroId, '');
    a.send('chooseHero', { heroId: offersA[0].id });
    await until(() => a.state.players.get(a.sessionId)!.heroId === offersA[0].id);
    assert.equal(a.state.status, 'selecting');
    b.send('chooseHero', { heroId: offersB[0].id });
    await until(() => a.state.status === 'mulligan' && b.state.status === 'mulligan');
    // The first player is a coin flip: 3 cards against 4, then a draw against The Coin.
    const [first, second] = a.state.first === a.sessionId ? [a, b] : [b, a];
    const hand = (room: typeof a) => room === a ? handA : handB;
    await until(() => hand(first).length === 3 && hand(second).length === 4);
    assert.ok(handA.every(a => !handB.some(b => b.instanceId === a.instanceId)));
    assert.equal(JSON.stringify(b.state.toJSON()).includes('instanceId'),false);
    // Turns cannot end during the mulligan; keeping both hands opens the match.
    b.send('advance', { expectedRevision: b.state.revision });
    await until(() => rejected === 2);
    assert.equal(a.state.status, 'mulligan');
    first.send('mulligan', { replace: [] }); second.send('mulligan', { replace: [] });
    await until(() => a.state.status === 'active' && b.state.status === 'active');
    await until(() => hand(first).length === 4 && hand(second).length === 5);
    assert.equal(hand(second).at(-1)!.cardId, 'the-coin');
    assert.equal(a.state.activePlayer, first.sessionId);
    assert.equal(a.state.phase, 'main');
    assert.equal(first.state.players.get(first.sessionId)!.mana, 1);
    assert.ok(a.state.phaseEndsAt > Date.now());
    second.send('advance', { expectedRevision: second.state.revision });
    if (second === b) await until(() => rejected === 3);
    else await delay(100);
    assert.equal(a.state.activePlayer, first.sessionId);
    first.send('advance', { expectedRevision: first.state.revision });
    await until(() => a.state.activePlayer === second.sessionId && b.state.phase === 'main');
    assert.equal(a.state.revision, b.state.revision);
    assert.equal(second.state.players.get(second.sessionId)!.maxMana, 1);
    const c = await client.joinOrCreate<MatchState>('match', {}, MatchState);
    assert.notEqual(c.roomId, a.roomId);
    await c.leave();
    await b.leave();
    await until(() => a.state.status === 'finished');
    assert.equal(a.state.winner, a.sessionId);
    await a.leave();
  } finally {
    await server.gracefullyShutdown(false);
  }
});
