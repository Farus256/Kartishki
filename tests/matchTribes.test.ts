import assert from 'node:assert/strict';
import test from 'node:test';
import { abTribes, pickMatchTribes, restrictCatalogToTribes, starterAutoBattlerMinions, tavernTribes } from '@kartishki/shared';

const minion = (id: string, tribes?: string[], extra: Record<string, unknown> = {}) => ({ id, name: { ru: id, en: id }, tavernTier: 1 as const, attack: 1, health: 1, keywords: [], tribes, ...extra });

test('custom tribes come from the copy block and neutral stays last', () => {
  assert.deepEqual(abTribes(), ['beast', 'mech', 'pirate', 'undead', 'dragon', 'demon', 'neutral']);
  assert.deepEqual(abTribes({ tribes: { elf: { name: { ru: 'Эльф', en: 'Elf' } }, beast: { name: { ru: 'Зверь', en: 'Beast' } } } }).slice(-2), ['elf', 'neutral']);
});

test('a table picks five of the tribes in play; the starter tavern has six', () => {
  const starter = { minions: starterAutoBattlerMinions };
  assert.equal(tavernTribes(starter).length, 6);
  assert.deepEqual(pickMatchTribes(starter, () => 0), ['demon', 'dragon', 'mech', 'pirate', 'undead']);
  const catalog = { minions: [...starterAutoBattlerMinions, minion('elf-1', ['elf']), minion('ghost-token', ['ghost'], { token: true })], copy: { tribes: { elf: { name: { ru: 'Эльф', en: 'Elf' } } } } };
  assert.deepEqual(tavernTribes(catalog), ['beast', 'mech', 'pirate', 'undead', 'dragon', 'demon', 'elf']);
  const picked = pickMatchTribes(catalog, n => n - 1);
  assert.equal(picked.length, 5);
  assert.equal(new Set(picked).size, 5);
});

test('minions of a tribe that sat out leave the tavern and Discover but keep their definition', () => {
  const catalog = { version: 1, heroes: [], minions: [minion('a', ['beast']), minion('b', ['dragon']), minion('c', ['beast', 'dragon']), minion('d'), minion('t', ['dragon'], { token: true })] };
  const out = restrictCatalogToTribes(catalog, ['beast']);
  const by = (id: string) => out.minions.find(m => m.id === id)!;
  assert.equal(by('a').inTavern, undefined);
  assert.equal(by('b').inTavern, false);
  assert.equal(by('b').inDiscover, false);
  assert.equal(by('c').inTavern, undefined);
  assert.equal(by('d').inTavern, undefined);
  assert.equal(by('t').inTavern, undefined);
});
