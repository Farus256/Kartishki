export const DAILY_REWARD = 100;
export const WIN_REWARD = 50;
export const PACK_COST = 100;
export const CASE_COST = 200;
export const PACK_SIZE = 5;
export const BOTTLE_CAPACITY = 2000;
export const CALIBRATION_ML = 1500;
export const ML_PER_ELO = 10;
export function remainingMlFromElo(elo: number) {
  const n = Number.isFinite(elo) ? elo : 1000;
  return Math.max(0, Math.min(BOTTLE_CAPACITY, CALIBRATION_ML - (n - 1000) * ML_PER_ELO));
}
export type PlayerProfile = {
  id: string; username: string; elo: number; currency: number; xp: number;
  lastDaily: string | null; dailyAvailable: boolean;
};
export type SavedDeck = { id: string; name: string; cards: string[]; version: number };
export type PlayerLibrary = { profile: PlayerProfile; collection: { cardId: string; copies: number }[]; decks: SavedDeck[] };
export type PlayerLogin = { token: string; library: PlayerLibrary };
export type LootCard = { id: string; rarity: string; name: Record<string, string> };
export type PackResult = { cards: LootCard[]; currency: number; xp: number };
export type CaseResult = { prize: LootCard; reel: LootCard[]; landing: number; currency: number; xp: number };
export type LadderRow = { username: string; elo: number; xp: number; remainingMl: number };
export type MatchRewards = { elo: number; currency: number; gained: number; xp: number };
export type BattlegroundsRewards = MatchRewards & { place: number; eloDelta: number; xpGain: number };
