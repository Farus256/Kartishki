import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { BEER_DRAW_MAX, BEER_DRAW_MIN, BEER_LOSS_MAX, BEER_LOSS_MIN, BEER_WIN_MAX, BEER_WIN_MIN } from '@kartishki/shared';
import { addBeerMl, applyMatchElo, beerMlForPlace, beerMlForResult, calibratedRank, isBeerRank, rankFromMl } from '../apps/client/src/beerRank';
const low = () => 0;
const high = () => 0.999999;
test('equal opponents move 16 elo', () => {
  assert.equal(applyMatchElo(1000, 1), 1016);
  assert.equal(applyMatchElo(1000, 0), 984);
  assert.equal(applyMatchElo(1000, 0.5), 1000);
});
test('new players start with an empty bottle', () => {
  assert.deepEqual(calibratedRank(), { league: 'light', remainingMl: 0, lastElo: 1000 });
  assert.equal(calibratedRank(1400).remainingMl, 0);
});
test('wins pour, losses drain, draws jitter, bottle never goes negative', () => {
  assert.equal(beerMlForResult(1, low), BEER_WIN_MIN);
  assert.equal(beerMlForResult(1, high), BEER_WIN_MAX);
  assert.equal(beerMlForResult(0.5, low), BEER_DRAW_MIN);
  assert.equal(beerMlForResult(0.5, high), BEER_DRAW_MAX);
  assert.equal(beerMlForResult(0, low), BEER_LOSS_MIN);
  assert.equal(beerMlForResult(0, high), BEER_LOSS_MAX);
  const initial = calibratedRank();
  const win = addBeerMl(initial, beerMlForResult(1, low));
  assert.equal(win.remainingMl, BEER_WIN_MIN);
  assert.equal(addBeerMl(win, 0), win);
  assert.equal(addBeerMl(win, beerMlForResult(0, high)).remainingMl, 0);
  assert.equal(addBeerMl(initial, -80).remainingMl, 0);
  assert.equal(rankFromMl(0).league, 'light');
});
test('filling the bottle unlocks dark; losses can drop it back', () => {
  const promoted = rankFromMl(2000);
  assert.deepEqual(promoted, { league: 'dark', remainingMl: 2000, lastElo: 1000 });
  assert.equal(addBeerMl(promoted, BEER_WIN_MAX).remainingMl, 2080);
  assert.equal(addBeerMl(promoted, BEER_WIN_MAX).league, 'dark');
  assert.equal(addBeerMl(promoted, BEER_LOSS_MIN).remainingMl, 1920);
  assert.equal(addBeerMl(promoted, BEER_LOSS_MIN).league, 'light');
  assert.equal(beerMlForPlace(1, 2, low), BEER_WIN_MIN);
  assert.equal(beerMlForPlace(2, 2, high), BEER_LOSS_MAX);
});
test('invalid persisted ranks cannot produce a negative bottle', () => {
  assert.equal(isBeerRank({ league: 'light', remainingMl: -1, lastElo: 1000 }), false);
  assert.equal(isBeerRank({ league: 'dark', remainingMl: 2001, lastElo: 1000 }), true);
  assert.equal(isBeerRank({ league: 'other', remainingMl: 0, lastElo: 1000 }), false);
  assert.equal(isBeerRank(calibratedRank()), true);
});
