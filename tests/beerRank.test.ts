import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { calibratedRank, updateBeerRank, isBeerRank } from '../apps/client/src/beerRank';
test('new players calibrate at 1500 regardless of initial ELO', () => {
  assert.deepEqual(calibratedRank(), { league: 'light', remainingMl: 1500, lastElo: 1000 });
  assert.equal(calibratedRank(1400).remainingMl, 1500);
});
test('wins drain, losses refill, unchanged snapshots do not apply a result twice', () => {
  const initial = calibratedRank();
  const win = updateBeerRank(initial, 1016);
  assert.equal(win.remainingMl, 1340);
  assert.equal(updateBeerRank(win, 1000).remainingMl, 1500);
  assert.equal(updateBeerRank(win, 1016), win);
  assert.equal(updateBeerRank(initial, 700).remainingMl, 2000);
});
test('only empty light promotes, dark resets to 1500 and stays unlocked', () => {
  assert.equal(updateBeerRank(calibratedRank(), 1149).league, 'light');
  const promoted = updateBeerRank(calibratedRank(), 1150);
  assert.deepEqual(promoted, { league: 'dark', remainingMl: 1500, lastElo: 1150 });
  assert.equal(updateBeerRank(promoted, 1000).league, 'dark');
  assert.equal(updateBeerRank(promoted, 1000).remainingMl, 2000);
  assert.equal(updateBeerRank(promoted, 1300).remainingMl, 0);
  assert.equal(updateBeerRank(calibratedRank(), 2000).remainingMl, 1500);
});
test('invalid persisted ranks cannot produce an out-of-range bottle', () => {
  assert.equal(isBeerRank({ league: 'light', remainingMl: -1, lastElo: 1000 }), false);
  assert.equal(isBeerRank({ league: 'dark', remainingMl: 2001, lastElo: 1000 }), false);
  assert.equal(isBeerRank({ league: 'other', remainingMl: 1500, lastElo: 1000 }), false);
  assert.equal(isBeerRank(calibratedRank()), true);
});
