import { BOTTLE_CAPACITY } from '@kartishki/shared';
export { BOTTLE_CAPACITY, applyBeerMl, beerMlForPlace, beerMlForResult } from '@kartishki/shared';
export type BeerLeague = 'light' | 'dark';
export type BeerRank = { league: BeerLeague; remainingMl: number; lastElo: number };
export function rankFromMl(ml: number, lastElo = 1000): BeerRank {
  const remainingMl = Math.max(0, Math.floor(Number.isFinite(ml) ? ml : 0));
  return { league: remainingMl >= BOTTLE_CAPACITY ? 'dark' : 'light', remainingMl, lastElo };
}
export function calibratedRank(elo = 1000): BeerRank {
  return rankFromMl(0, elo);
}
export function addBeerMl(rank: BeerRank, delta: number): BeerRank {
  if (!Number.isFinite(delta) || !delta) return rank;
  return rankFromMl(rank.remainingMl + Math.trunc(delta), rank.lastElo);
}
export function isBeerRank(value: unknown): value is BeerRank {
  if (!value || typeof value !== 'object') return false;
  const r = value as BeerRank;
  return (r.league === 'light' || r.league === 'dark') && Number.isFinite(r.lastElo)
    && Number.isFinite(r.remainingMl) && r.remainingMl >= 0 && r.remainingMl <= 1e9;
}
