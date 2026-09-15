import test from 'node:test';
import assert from 'node:assert/strict';
import { Decoder, Encoder, StateView } from '@colyseus/schema';
import { AutoBattlerPlayerState, AutoBattlerRoomState, starterAutoBattlerCatalog } from '@kartishki/shared';
import { createMinionState } from '../src/autoBattler/instantiate';
import { tryMoveBoard, tryPlayCard, type RecruitDeps } from '../src/autoBattler/recruit';
import { SharedMinionPool } from '../src/autoBattler/pool';
import { createRng } from '../src/autoBattler/rng';
import { createDefaultRegistry } from '../src/autoBattler/keywords';
import { syncPrivateView } from '../src/autoBattler/AutoBattlerRoom';

const catalog = starterAutoBattlerCatalog;
const def = (id: string) => catalog.minions.find(m => m.id === id)!;

/** A view-filtered client the way AutoBattlerRoom attaches one per player. */
function table() {
  const state = new AutoBattlerRoomState();
  const p = new AutoBattlerPlayerState(); p.sessionId = 'me'; p.gold = 10;
  for (const [i, id] of ['a', 'b', 'c', 'd'].entries()) p.board.push(createMinionState(def(['ab-whelp', 'ab-ward', 'ab-aegis', 'ab-drunk'][i]!), id, 'me'));
  state.players.set('me', p);
  const encoder = new Encoder(state);
  const view = new StateView(); view.add(p, 1); view.add(p.tavern, 1);
  const client = new AutoBattlerRoomState();
  const decoder = new Decoder(client);
  const it = { offset: 0 };
  const full = encoder.encodeAll(it);
  decoder.decode(encoder.encodeAllView(view, full.length, it)); encoder.discardChanges();
  const tick = () => { syncPrivateView(view, p); const it2 = { offset: 0 }; const shared = encoder.encode(it2); decoder.decode(encoder.encodeView(view, shared.length, it2)); encoder.discardChanges(); };
  const ids = () => ({ server: [...p.board].map(m => m.id), client: [...client.players.get('me')!.board].map(m => m.id) });
  const clientOffers = () => [...client.players.get('me')!.tavern.offers].map(m => ({ id: m.id, keywords: [...m.keywords], tribes: [...m.tribes] }));
  let n = 0;
  const deps: RecruitDeps = { player: p, pool: new SharedMinionPool(catalog), rng: createRng(1), nextId: () => `t${++n}`, registry: createDefaultRegistry(catalog.minions), defFor: id => catalog.minions.find(m => m.id === id) };
  return { p, deps, tick, ids, clientOffers };
}

test('board reorders reach a view-filtered client in the same order the server holds', () => {
  const { p, tick, ids } = table();
  for (const [id, to] of [['d', 0], ['a', 3], ['c', 1], ['b', 2], ['a', 0]] as const) {
    assert.equal(tryMoveBoard(p, id, to).ok, true);
    tick();
    const { server, client } = ids();
    assert.deepEqual(client, server, `${id}->${to}`);
  }
});

test('a card played into the middle of the board lands there on the client too', () => {
  const { p, deps, tick, ids } = table();
  const card = createMinionState(def('ab-bruiser'), 'h1', 'me');
  p.hand.push(card); tick();
  assert.equal(tryPlayCard(deps, 'h1', 2).ok, true);
  tick();
  const { server, client } = ids();
  assert.deepEqual(server, ['a', 'b', 'h1', 'c', 'd']);
  assert.deepEqual(client, server);
});

test('keywords and tribes of freshly rolled minions reach the client (view-filtered)', () => {
  const { p, tick, clientOffers } = table();
  p.tavern.offers.push(createMinionState(def('ab-omen'), 'o', 'me')); tick();
  assert.deepEqual(clientOffers(), [{ id: 'o', keywords: ['taunt', 'divineShield'], tribes: ['undead'] }]);
});
