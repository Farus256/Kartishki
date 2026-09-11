import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CASES, PACKS, demoCards, drawCard, slotReward } from '../apps/client/src/economy';

test('slot payouts cover loss, every currency multiplier, cards and packs', () => {
  assert.equal(slotReward([0, 1, 2, 3, 4]).dollars, 0);
  assert.equal(slotReward([0, 1, 0, 2, 0]).dollars, 100);
  assert.equal(slotReward([1, 1, 1, 1, 2]).dollars, 400);
  assert.equal(slotReward([5, 5, 5, 5, 5]).dollars, 1000);
  assert.equal(slotReward([7, 7, 7, 7, 7]).cards, 3);
  assert.equal(slotReward([6, 6, 6, 6, 6]).packs, 3);
});
test('three-reel slots award only triples across all 512 outcomes', () => {
  let wins = 0;
  for (let a=0; a<8; a++) for (let b=0; b<8; b++) for (let c=0; c<8; c++) {
    const reward = slotReward([a,b,c]);
    const won = reward.dollars + reward.cards + reward.packs > 0;
    assert.equal(won, a===b && b===c);
    if (won) wins++;
  }
  assert.equal(wins, 8);
  assert.equal(slotReward([0,0,0]).dollars, 100);
  assert.equal(slotReward([6,6,6]).packs, 1);
  assert.equal(slotReward([7,7,7]).cards, 1);
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
