import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOARD_PRESETS, COSMETICS, FAIRNESS_BROKEN, HERO_SKINS, HERO_SLAMS, NAME_FX, boardOwned, cardFairness, cardSetFromCatalog, catalogFromCardSet,
  heroSkinOwned, heroSlamOwned, nameFxOwned, setFairness, starterAutoBattlerCatalog, starterAutoBattlerMinions, validateAutoBattlerEffect, validateCardSet,
  type AutoBattlerMinionDef, type CardSet,
} from '@kartishki/shared';

const tavern = starterAutoBattlerMinions;
const draft = (): CardSet => cardSetFromCatalog(starterAutoBattlerCatalog, 'my-set', { ru: 'Мой набор', en: 'My set' }, 'me');

test('the starter tavern is a valid Workshop set and never grades broken', () => {
  const set = draft();
  assert.ok(validateCardSet(set));
  const verdict = setFairness(set.minions);
  assert.notEqual(verdict.grade, 'broken');
  assert.ok(verdict.tiers.every(t => t.count > 0 && Math.abs(t.mean) < 0.5), 'the norm is measured on the starter itself');
});

test('card sets need an id, at least 8 tavern minions and every summon token', () => {
  const set = draft();
  assert.equal(validateCardSet({ ...set, id: 'Bad Id' }), false);
  assert.equal(validateCardSet({ ...set, format: 2 }), false);
  assert.equal(validateCardSet({ ...set, minions: set.minions.filter(m => m.token).slice(0, 3) }), false);
  const withoutRat = { ...set, minions: set.minions.filter(m => m.id !== 'ab-token-rat') };
  assert.equal(validateCardSet(withoutRat), true, 'starter tokens fill in for a set that summons them');
  assert.ok(catalogFromCardSet(withoutRat).minions.some(m => m.id === 'ab-token-rat'), 'the missing starter token is appended for play');
  assert.equal(validateCardSet({ ...set, minions: [...set.minions, { ...set.minions[0]!, id: 'x', deathrattle: { summonId: 'nope', count: 1 } , keywords: ['deathrattle'] }] }), false);
});

test('hidden fairness points flag an overtuned card and its set', () => {
  const vanilla: AutoBattlerMinionDef = { id: 'fair-body', name: { ru: 'Тело', en: 'Body' }, tavernTier: 1, attack: 2, health: 2, keywords: [], tribes: ['neutral'] };
  assert.equal(cardFairness(vanilla).verdict, 'fair');
  const monster: AutoBattlerMinionDef = { ...vanilla, id: 'monster', attack: 9, health: 9, keywords: ['divineShield', 'poisonous', 'windfury'], effects: [{ trigger: 'endTurn', target: 'friendly', action: { kind: 'buff', attack: 3, health: 3 } }] };
  const judged = cardFairness(monster);
  assert.equal(judged.verdict, 'broken');
  assert.ok(judged.delta > FAIRNESS_BROKEN);
  assert.equal(setFairness([...tavern, monster]).grade, 'broken');
  assert.ok(setFairness([...tavern, monster]).problems.some(p => p.startsWith('monster')));
});

test('scenario steps validate with the effect and add value', () => {
  const effect = { trigger: 'battlecry' as const, target: 'adjacent' as const, action: { kind: 'buff' as const, attack: 1, health: 1 }, steps: [{ target: 'self' as const, action: { kind: 'keyword' as const, keyword: 'taunt' as const } }] };
  assert.ok(validateAutoBattlerEffect(effect));
  assert.equal(validateAutoBattlerEffect({ ...effect, steps: [{ action: { kind: 'aura', attack: 1 } }] }), false, 'an aura step needs the aura trigger');
  assert.equal(validateAutoBattlerEffect({ ...effect, steps: Array.from({ length: 5 }, () => effect.steps[0]) }), false, 'at most four steps');
  const base: AutoBattlerMinionDef = { id: 'stepper', name: { ru: 'Шагун', en: 'Stepper' }, tavernTier: 2, attack: 2, health: 2, keywords: ['battlecry'], tribes: ['neutral'], effects: [{ ...effect, steps: undefined }] };
  assert.ok(cardFairness({ ...base, effects: [effect] }).points > cardFairness(base).points);
});

test('cosmetics: free presets equip without a purchase, bought looks need their unlock', () => {
  assert.ok(BOARD_PRESETS.some(p => p.cost === 0));
  assert.equal(boardOwned('oak', []), true);
  assert.equal(boardOwned('night', []), false);
  assert.equal(boardOwned('night', ['board-night']), true);
  assert.equal(heroSkinOwned('', []), true);
  assert.equal(heroSkinOwned(HERO_SKINS[0]!.id, []), false);
  assert.equal(heroSkinOwned(HERO_SKINS[0]!.id, [HERO_SKINS[0]!.id]), true);
  assert.equal(heroSlamOwned('', []), true);
  assert.equal(heroSlamOwned(HERO_SLAMS[0]!.id, []), false);
  assert.equal(heroSlamOwned(HERO_SLAMS[0]!.id, [HERO_SLAMS[0]!.id]), true);
  assert.equal(nameFxOwned(NAME_FX[0]!.id, [NAME_FX[0]!.id]), true);
  assert.equal(nameFxOwned(HERO_SLAMS[0]!.id, [HERO_SLAMS[0]!.id]), false, 'a slam is not a name effect');
  assert.equal(new Set(COSMETICS.map(c => c.id)).size, COSMETICS.length);
  assert.ok(COSMETICS.every(c => c.cost > 0));
});

test('a set may declare its own tribes and a theme; undeclared tribes and bad theme urls are refused', () => {
  const set = draft();
  set.minions[0]!.tribes = ['elf'];
  assert.equal(validateCardSet(set), false, 'elf is not declared');
  set.copy = { ...set.copy, tribes: { ...set.copy?.tribes, elf: { name: { ru: 'Эльфы', en: 'Elves' } } } };
  assert.equal(validateCardSet(set), true);
  const hex = 'a'.repeat(64);
  set.theme = { wallpaper: [`/api/portraits/${hex}.png`], menuMusic: [{ id: 'm1', name: 'Theme', url: `/api/music/${hex}.mp3` }], leveling: { levels: [{ ru: 'Новичок', en: 'Rookie', xp: 10 }, { ru: 'Ветеран', en: 'Veteran', xp: 20 }] } };
  assert.equal(validateCardSet(set), true);
  set.theme = { wallpaper: ['https://evil.example/x.png'] };
  assert.equal(validateCardSet(set), false, 'wallpaper must be an uploaded portrait');
});
