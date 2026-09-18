import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { applyOptimistic } from '../apps/client/src/battlegrounds/abOptimistic';
import type { AbMinion, AbPlayer } from '../apps/client/src/autoBattlerSession';

const unit = (id: string, kind = 'minion'): AbMinion => ({ id, cardId: 'ab-whelp', baseId: 'ab-whelp', kind, attack: 2, health: 1, maxHealth: 1, tavernTier: 1, keywords: [], golden: false, owner: 'me' });
const player = (): AbPlayer => ({
  sessionId: 'me', displayName: 'me', heroId: '', portraitKey: '', skin: '', health: 40, maxHealth: 40,
  power: { id: '', isPassive: true, goldCost: 0, isExhausted: false, targeted: false, targetDomain: 'none' },
  gold: 5, tavernTier: 1, upgradeCost: 5,
  board: [unit('b0'), unit('b1'), unit('b2')], hand: [unit('h0'), unit('spell', 'spell')],
  tavern: { offers: [unit('t0'), unit('t1')], frozen: false, size: 3 },
  nextOpponentId: '', swords: false, eliminated: false, placement: 0, recruitReady: false,
  lastCombatResult: '', lastCombatDamage: 0, lastCombatOpponentId: '', tripleSerial: 0, lastActionId: 0, buyCost: 3, rerollCost: 1, sellReward: 1, freeRerolls: 0, lastCombatSummary: '', discoverOpen: false, pendingDiscover: [], wheelBonus: '',
});
const ids = (list: AbMinion[]) => list.map(m => m.id);

test('move reorders the board in place', () => {
  assert.deepEqual(ids(applyOptimistic(player(), { type: 'move', id: 'b0', index: 2 }).board), ['b1', 'b2', 'b0']);
  assert.deepEqual(ids(applyOptimistic(player(), { type: 'move', id: 'b2', index: 0 }).board), ['b2', 'b0', 'b1']);
  const me = player();
  assert.equal(applyOptimistic(me, { type: 'move', id: 'b0', index: 3 }), me, 'out of range: unchanged');
  assert.equal(applyOptimistic(me, { type: 'move', id: 'nope', index: 1 }), me);
});

test('play moves a hand minion onto the board, never a spell', () => {
  const next = applyOptimistic(player(), { type: 'play', id: 'h0', index: 1 });
  assert.deepEqual(ids(next.board), ['b0', 'h0', 'b1', 'b2']);
  assert.deepEqual(ids(next.hand), ['spell']);
  const me = player();
  assert.equal(applyOptimistic(me, { type: 'play', id: 'spell', index: 0 }), me);
});

test('buy and sell move cards and gold like the server', () => {
  const bought = applyOptimistic(player(), { type: 'buy', id: 't1' });
  assert.equal(bought.gold, 2);
  assert.deepEqual(ids(bought.tavern.offers), ['t0']);
  assert.deepEqual(ids(bought.hand), ['h0', 'spell', 't1']);
  const broke = applyOptimistic(bought, { type: 'buy', id: 't0' });
  assert.equal(broke, bought, 'cannot afford: unchanged');
  const sold = applyOptimistic(player(), { type: 'sell', id: 'b1' });
  assert.equal(sold.gold, 6);
  assert.deepEqual(ids(sold.board), ['b0', 'b2']);
  const me = player();
  assert.equal(applyOptimistic(me, { type: 'sell', id: 'spell' }), me);
});
