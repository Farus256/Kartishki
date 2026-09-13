import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { LEVEL_COUNT, levelFromXp, starterLeveling, validatePlayerLeveling } from '@kartishki/shared';

test('starter table has 30 named levels and rejects broken rows', () => {
  assert.equal(starterLeveling.levels.length, LEVEL_COUNT);
  assert.ok(validatePlayerLeveling(starterLeveling));
  assert.equal(validatePlayerLeveling({ levels: starterLeveling.levels.slice(0, 29) }), false);
  assert.equal(validatePlayerLeveling({ levels: starterLeveling.levels.map((row, i) => i ? row : { ...row, ru: '' }) }), false);
  assert.equal(validatePlayerLeveling({ levels: starterLeveling.levels.map((row, i) => i ? row : { ...row, xp: 0 }) }), false);
});

test('levelFromXp spends each quota then caps at 30', () => {
  assert.deepEqual(levelFromXp(0), { level: 1, name: starterLeveling.levels[0], current: 0, need: 40, left: 40, maxed: false });
  assert.equal(levelFromXp(39).level, 1);
  assert.equal(levelFromXp(39).left, 1);
  assert.equal(levelFromXp(40).level, 2);
  assert.equal(levelFromXp(40).current, 0);
  const total = starterLeveling.levels.reduce((sum, row) => sum + row.xp, 0);
  const maxed = levelFromXp(total);
  assert.equal(maxed.level, 30);
  assert.equal(maxed.maxed, true);
  assert.equal(maxed.left, 0);
  assert.equal(levelFromXp(total + 500).maxed, true);
});
