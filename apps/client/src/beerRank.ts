export const BOTTLE_CAPACITY = 2000;
export const CALIBRATION_ML = 1500;
/** Presentation economy: one point of earned/lost ELO changes the bottle by 10 ml. */
export const ML_PER_ELO = 10;
export type BeerLeague = 'light' | 'dark';
export type BeerRank = { league: BeerLeague; remainingMl: number; lastElo: number };
export function calibratedRank(elo = 1000): BeerRank {
  return { league: 'light', remainingMl: CALIBRATION_ML, lastElo: elo };
}
export function updateBeerRank(rank: BeerRank, elo: number): BeerRank {
  if (!Number.isFinite(elo) || elo === rank.lastElo) return rank;
  const remainingMl = Math.max(0, Math.min(BOTTLE_CAPACITY, rank.remainingMl - (elo - rank.lastElo) * ML_PER_ELO));
  // Promotion is permanent; losses refill the current league, never unlock/demote it.
  if (rank.league === 'light' && remainingMl === 0) return { league: 'dark', remainingMl: CALIBRATION_ML, lastElo: elo };
  // Dark is the highest currently defined league, so completion stays at zero.
  return { ...rank, remainingMl, lastElo: elo };
}
export function isBeerRank(value: unknown): value is BeerRank {
  if (!value || typeof value !== 'object') return false;
  const r = value as BeerRank;
  return (r.league === 'light' || r.league === 'dark') && Number.isFinite(r.lastElo)
    && Number.isFinite(r.remainingMl) && r.remainingMl >= 0 && r.remainingMl <= BOTTLE_CAPACITY;
}
