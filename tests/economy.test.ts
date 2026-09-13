import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CASES, PACKS, demoCards, drawCard, pickSlotSymbol, SLOT_PAIR, SLOT_TRIPLE, SLOT_WEIGHTS, slotReward } from '../apps/client/src/economy';

test('pairs pay consolation, triples pay the jackpot row', () => {
  assert.equal(slotReward([0, 1, 2]).dollars, 0);
  assert.equal(slotReward([0, 0, 1]).dollars, SLOT_PAIR[0].dollars);
  assert.equal(slotReward([0, 0, 0]).dollars, SLOT_TRIPLE[0].dollars);
  assert.equal(slotReward([5, 5, 5]).dollars, SLOT_TRIPLE[5].dollars);
  assert.equal(slotReward([6, 6, 1]).packs, 1);
  assert.equal(slotReward([6, 6, 6]).packs, 3);
  assert.equal(slotReward([7, 7, 0]).cards, 1);
  assert.equal(slotReward([7, 7, 7]).cards, 5);
});

test('weighted reels hit like a hall machine and keep a house edge', () => {
  assert.equal(pickSlotSymbol(() => 0), 0);
  assert.equal(pickSlotSymbol(() => 0.999), 7);
  assert.equal(SLOT_WEIGHTS.reduce((a, b) => a + b), 100);
  const pack = 100, card = 60, bet = 50;
  let ev = 0, hit = 0, triples = 0;
  for (let i = 0; i < SLOT_WEIGHTS.length; i++) {
    const p = SLOT_WEIGHTS[i] / 100, p3 = p ** 3, p2 = 3 * p * p * (1 - p);
    const pair = SLOT_PAIR[i], trip = SLOT_TRIPLE[i];
    const v2 = (pair.dollars ?? 0) + (pair.packs ?? 0) * pack + (pair.cards ?? 0) * card;
    const v3 = (trip.dollars ?? 0) + (trip.packs ?? 0) * pack + (trip.cards ?? 0) * card;
    ev += p2 * v2 + p3 * v3;
    if (v2) hit += p2;
    if (v3) { hit += p3; triples += p3; }
  }
  assert.ok(hit > 0.25 && hit < 0.5);
  assert.ok(triples > 0.02 && triples < 0.08);
  assert.ok(ev / bet > 0.88 && ev / bet < 0.97);
});

test('all products sum to 100% and weighted sampling respects rarity boundaries', () => {
  for (const p of [...PACKS, ...CASES]) {
    assert.equal(p.weights.reduce((a, b) => a + b), 100);
    assert.ok(demoCards.includes(drawCard(demoCards, p.weights, () => .5)));
  }
  assert.equal(drawCard(demoCards, PACKS[2].weights, () => 0).rarity, 'rare');
  assert.equal(drawCard(demoCards, PACKS[2].weights, () => .999).rarity, 'ultimate');
  assert.equal(drawCard(demoCards.filter(c => c.rarity === 'epic'), PACKS[0].weights, () => .5).rarity, 'epic');
});
