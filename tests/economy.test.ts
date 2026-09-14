import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { defaultShop, shopCard, shopProducts } from '@kartishki/shared';
import { demoCards } from '../apps/client/src/economy';

test('slot table has eight faces and currency-only payouts', () => {
  assert.equal(defaultShop.slots.weights.length, 8);
  assert.equal(defaultShop.slots.weights.reduce((a, b) => a + b), 100);
  assert.equal(defaultShop.slots.pair.length, 8);
  assert.equal(defaultShop.slots.triple.length, 8);
});

test('all card products keep rarity weights and sampling stays in catalog', () => {
  for (const p of [...shopProducts(defaultShop, 'pack'), ...shopProducts(defaultShop, 'chest')]) {
    assert.equal(p.weights.length, 5);
    assert.ok(demoCards.some(card => card.id === shopCard(demoCards, p.weights, () => .5).id));
  }
  assert.equal(shopCard(demoCards, [0, 20, 45, 30, 5], () => 0).rarity, 'rare');
  assert.equal(shopCard(demoCards, [0, 20, 45, 30, 5], () => .999).rarity, 'ultimate');
});

test('shop has casino, mixed packs and mixed chests', () => {
  const wheel = defaultShop.products.find(p => p.kind === 'wheel')!;
  assert.deepEqual(wheel.prizes.map(p => [p.kind, p.amount, p.weight]), [
    ['currency', 25, 52], ['currency', 75, 28], ['currency', 200, 12],
    ['currency', 500, 5], ['currency', 1000, 2], ['currency', 2000, 0.7], ['currency', 5000, 0.3],
  ]);
  assert.equal(wheel.prizes.reduce((sum, p) => sum + p.weight, 0), 100);
  assert.ok(shopProducts(defaultShop, 'pack').some(p => p.prizes.some(r => r.kind !== 'cards')));
  assert.ok(shopProducts(defaultShop, 'chest').some(p => p.prizes.some(r => r.kind !== 'cards')));
});
