import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { applyShopResult, defaultShop, parseShopAction, resolveShop, resolveShopAction, shopCard, shopCash, shopMixed, shopProducts, takeAlbumCard, validateShopConfig, weightedIndex } from '@kartishki/shared';
import { demoCards } from '../apps/client/src/economy';

const wallet = { currency: 2000, xp: 0, owned: Object.fromEntries(demoCards.slice(0, 18).map(card => [card.id, 6])) };

test('default shop validates and mixed packs sit next to card packs', () => {
  assert.equal(validateShopConfig(defaultShop), true);
  assert.deepEqual(resolveShop({}).products.map(p => p.id), defaultShop.products.map(p => p.id));
  assert.ok(shopProducts(defaultShop, 'pack').some(shopMixed));
  assert.ok(shopProducts(defaultShop, 'chest').some(shopMixed));
  assert.equal(shopProducts(defaultShop, 'wheel').length, 1);
  assert.equal(shopProducts(defaultShop, 'slots').length, 1);
});

test('slots pay currency pairs and triples from the shop table', () => {
  const miss = resolveShopAction(defaultShop, demoCards, wallet, { type: 'buy', productId: 'slots' }, () => 0.5);
  assert.equal(miss.kind, 'slots');
  assert.ok(miss.reels);
  const pair = resolveShopAction(defaultShop, demoCards, wallet, { type: 'buy', productId: 'slots' }, (() => { let n = 0; return () => { n += 1; return n <= 3 ? 0 : 0.4; }; })());
  const amount = pair.rewards[0]!.kind === 'currency' ? pair.rewards[0].amount : -1;
  assert.ok(amount === defaultShop.slots.pair[0] || amount === defaultShop.slots.triple[0] || amount === 0);
  const always = () => 0;
  const jackpot = resolveShopAction(defaultShop, demoCards, wallet, { type: 'buy', productId: 'slots' }, always);
  assert.deepEqual(jackpot.reels, [0, 0, 0]);
  assert.deepEqual(jackpot.rewards, [{ kind: 'currency', amount: defaultShop.slots.triple[0]! }]);
  assert.equal(applyShopResult(wallet, jackpot).currency, wallet.currency - 50 + defaultShop.slots.triple[0]!);
  const double = resolveShopAction(defaultShop, demoCards, wallet, { type: 'buy', productId: 'slots', bet: 100 }, always);
  assert.equal(double.cost, 100);
  assert.deepEqual(double.rewards, [{ kind: 'currency', amount: defaultShop.slots.triple[0]! * 2 }]);
  const invalid = resolveShopAction(defaultShop, demoCards, wallet, { type: 'buy', productId: 'slots', bet: 40 }, always);
  assert.equal(invalid.cost, 50);
});

test('wheel manual land costs 1000 and uses the chosen sector', () => {
  const land = resolveShopAction(defaultShop, demoCards, wallet, { type: 'buy', productId: 'wheel', land: 3 }, () => 0.99);
  assert.equal(land.kind, 'wheel');
  assert.equal(land.cost, 1000);
  assert.equal(land.prizeIndex, 3);
  assert.deepEqual(land.rewards, [{ kind: 'currency', amount: 500 }]);
});

test('weighted sampling respects rarity boundaries and empty pools', () => {
  assert.equal(weightedIndex([70, 22, 6, 1.8, .2], () => 0), 0);
  assert.equal(shopCard(demoCards, [0, 20, 45, 30, 5], () => 0).rarity, 'rare');
  assert.equal(shopCard(demoCards, [0, 20, 45, 30, 5], () => .999).rarity, 'ultimate');
  assert.equal(shopCard(demoCards.filter(c => c.rarity === 'epic'), defaultShop.products[2]!.weights, () => .5).rarity, 'epic');
});

test('owned album cards convert to rarity cash, new cards stay unique', () => {
  const owned = demoCards.find(c => c.rarity === 'common' && wallet.owned[c.id])!;
  const fresh = demoCards.find(c => c.rarity === 'common' && !wallet.owned[c.id])!;
  const have = { ...wallet.owned };
  assert.deepEqual(takeAlbumCard(have, owned, defaultShop.sellPrices), { kind: 'duplicate', cardId: owned.id, amount: defaultShop.sellPrices[0] });
  assert.equal(have[owned.id], wallet.owned[owned.id]);
  assert.deepEqual(takeAlbumCard(have, fresh, defaultShop.sellPrices), { kind: 'card', cardId: fresh.id });
  assert.deepEqual(takeAlbumCard(have, fresh, defaultShop.sellPrices), { kind: 'duplicate', cardId: fresh.id, amount: defaultShop.sellPrices[0] });
  const pack = resolveShopAction(defaultShop, [owned], wallet, { type: 'buy', productId: 'basement' }, () => 0);
  assert.equal(pack.kind, 'pack');
  assert.ok(pack.rewards.every(reward => reward.kind === 'duplicate' && reward.amount === defaultShop.sellPrices[0]));
  assert.equal(applyShopResult(wallet, pack).owned[owned.id], wallet.owned[owned.id]);
  assert.equal(applyShopResult(wallet, pack).currency, wallet.currency - pack.cost + shopCash(pack.rewards));
  assert.equal(parseShopAction({ type: 'sell', cardId: owned.id }), undefined);
  assert.equal(parseShopAction({ type: 'upgrade', cardId: owned.id }), undefined);
});
