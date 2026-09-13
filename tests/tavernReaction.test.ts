import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTavernReaction } from '../apps/client/src/battlegrounds/tavernReaction';

const base = {
  sessionId: 'p0', gold: 5, tavernTier: 1, tripleSerial: 0, lastCombatResult: '',
  frozen: false, offerCount: 3, offer0: 'a', pieces: 2, board: 1,
};

test('tavern upgrade and gold spend are one reaction each, not a replay', () => {
  assert.equal(detectTavernReaction(undefined, base), '');
  assert.equal(detectTavernReaction(base, { ...base, gold: 2, tavernTier: 2 }), 'UPGRADE');
  assert.equal(detectTavernReaction({ ...base, gold: 2, tavernTier: 2 }, { ...base, gold: 2, tavernTier: 2 }), '');
});

test('a later identity-only snapshot does not look like another upgrade', () => {
  const upgraded = { ...base, gold: 2, tavernTier: 2 };
  assert.equal(detectTavernReaction(upgraded, { ...upgraded }), '');
});
