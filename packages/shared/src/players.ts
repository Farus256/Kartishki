import { DEFAULT_BATTLEGROUNDS_ELO, battlegroundsEloDelta } from './leveling';
export const DAILY_REWARD = 100;
export const WIN_REWARD = 50;
export const PACK_COST = 100;
export const CASE_COST = 200;
export const PACK_SIZE = 5;
export const BOTTLE_CAPACITY = 2000;
/** Cash by final place (1st … 8th); shorter tables map onto the same curve. */
export const BATTLEGROUNDS_CURRENCY_REWARDS = [400, 250, 150, 100, 60, 40, 25, 10] as const;
/** Index into an 8-step table for a place within a field of any size. */
export function placeStep(place: number, field: number): number {
  const size = Math.max(2, field);
  const p = Math.max(1, Math.min(size, place));
  return Math.round((p - 1) / (size - 1) * 7);
}
export function battlegroundsCurrencyReward(place: number, field = 8) {
  return Number.isInteger(place) && place >= 1 ? BATTLEGROUNDS_CURRENCY_REWARDS[placeStep(place, field)] ?? 0 : 0;
}
export const BEER_WIN_MIN = 40;
export const BEER_WIN_MAX = 80;
export const BEER_DRAW_MIN = -5;
export const BEER_DRAW_MAX = 5;
export const BEER_LOSS_MIN = -80;
export const BEER_LOSS_MAX = -40;
export function beerMlBetween(min: number, max: number, random = Math.random) {
  const lo = Math.min(min, max), hi = Math.max(min, max);
  return lo + Math.floor(random() * (hi - lo + 1));
}
export function beerMlForResult(score: number, random = Math.random) {
  if (score === 1) return beerMlBetween(BEER_WIN_MIN, BEER_WIN_MAX, random);
  if (score === 0.5) return beerMlBetween(BEER_DRAW_MIN, BEER_DRAW_MAX, random);
  return beerMlBetween(BEER_LOSS_MIN, BEER_LOSS_MAX, random);
}
/** Beer for a Battlegrounds place: the Hearthstone top-half-gains / bottom-half-loses split, no luck roll. */
export function beerMlForPlace(place: number, field: number, amount = DEFAULT_BATTLEGROUNDS_ELO) {
  if (field <= 1) return amount;
  return battlegroundsEloDelta(place, field, amount);
}
export function applyBeerMl(current: number, delta: number) {
  return Math.max(0, (Number.isFinite(current) ? current : 0) + (Number.isFinite(delta) ? Math.trunc(delta) : 0));
}
export type PlayerSettings = {
  language: 'ru' | 'en';
  sound: boolean;
  sfxVolume: number;
  musicVolume: number;
  selectedDeck: string;
  /** Equipped table preset (see BOARD_PRESETS); '' = the default oak table. */
  board: string;
  /** Equipped hero frame (see HERO_SKINS); '' = plain. */
  heroSkin: string;
  /** Equipped hero slam effect (see HERO_SLAMS); '' = plain. */
  heroSlam: string;
  /** Equipped nickname effect (see NAME_FX); '' = plain. */
  nameFx: string;
  /** Equipped portrait aura (see PORTRAIT_FX); '' = plain. */
  portraitFx: string;
  /** Equipped card back (see CARD_BACKS); '' = the paper default. */
  cardBack: string;
};
export function defaultSettings(): PlayerSettings {
  return { language: 'ru', sound: true, sfxVolume: 1, musicVolume: 0.5, selectedDeck: '', board: '', heroSkin: '', heroSlam: '', nameFx: '', portraitFx: '', cardBack: '' };
}
const cosmeticId = (value: unknown) => typeof value === 'string' && /^[a-z0-9-]{0,40}$/.test(value);
function unit(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}
export function resolveSettings(value: unknown): PlayerSettings {
  const fallback = defaultSettings();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const row = value as Record<string, unknown>;
  return {
    language: row.language === 'en' ? 'en' : 'ru',
    sound: row.sound !== false,
    sfxVolume: unit(row.sfxVolume, fallback.sfxVolume),
    musicVolume: unit(row.musicVolume, fallback.musicVolume),
    selectedDeck: typeof row.selectedDeck === 'string' && row.selectedDeck.length <= 64 ? row.selectedDeck : '',
    board: cosmeticId(row.board) ? row.board as string : '',
    heroSkin: cosmeticId(row.heroSkin) ? row.heroSkin as string : '',
    heroSlam: cosmeticId(row.heroSlam) ? row.heroSlam as string : '',
    nameFx: cosmeticId(row.nameFx) ? row.nameFx as string : '',
    portraitFx: cosmeticId(row.portraitFx) ? row.portraitFx as string : '',
    cardBack: cosmeticId(row.cardBack) ? row.cardBack as string : '',
  };
}
export function validateSettingsPatch(value: unknown): Partial<PlayerSettings> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const patch: Partial<PlayerSettings> = {};
  if (row.language !== undefined) {
    if (row.language !== 'ru' && row.language !== 'en') return undefined;
    patch.language = row.language;
  }
  if (row.sound !== undefined) {
    if (typeof row.sound !== 'boolean') return undefined;
    patch.sound = row.sound;
  }
  if (row.sfxVolume !== undefined) {
    if (typeof row.sfxVolume !== 'number' || !Number.isFinite(row.sfxVolume) || row.sfxVolume < 0 || row.sfxVolume > 1) return undefined;
    patch.sfxVolume = row.sfxVolume;
  }
  if (row.musicVolume !== undefined) {
    if (typeof row.musicVolume !== 'number' || !Number.isFinite(row.musicVolume) || row.musicVolume < 0 || row.musicVolume > 1) return undefined;
    patch.musicVolume = row.musicVolume;
  }
  if (row.selectedDeck !== undefined) {
    if (typeof row.selectedDeck !== 'string' || row.selectedDeck.length > 64) return undefined;
    patch.selectedDeck = row.selectedDeck;
  }
  if (row.board !== undefined) {
    if (!cosmeticId(row.board)) return undefined;
    patch.board = row.board as string;
  }
  for (const key of ['heroSkin', 'heroSlam', 'nameFx', 'portraitFx', 'cardBack'] as const) {
    if (row[key] === undefined) continue;
    if (!cosmeticId(row[key])) return undefined;
    patch[key] = row[key] as string;
  }
  return patch;
}
export type PlayerProfile = {
  /** `elo` is the beer rating in millilitres — the only rating field. */
  id: string; username: string; elo: number; currency: number; xp: number;
  lastDaily: string | null; dailyAvailable: boolean; settings: PlayerSettings;
  /** Admin accounts open the in-game editor; everyone else sees "in development". */ isAdmin: boolean;
};
export type SavedDeck = { id: string; name: string; cards: string[]; version: number };
export type PlayerLibrary = { profile: PlayerProfile; collection: { cardId: string; copies: number }[]; decks: SavedDeck[]; /** Bought cosmetics and heroes (ids from COSMETICS). */ unlocks?: string[] };
export type PlayerLogin = { token: string; library: PlayerLibrary };
export type LootCard = { id: string; rarity: string; name: Record<string, string> };
export type PackResult = { cards: LootCard[]; currency: number; xp: number; duplicates: { id: string; amount: number }[] };
export type CaseResult = { prize: LootCard; reel: LootCard[]; landing: number; currency: number; xp: number; duplicates: { id: string; amount: number }[] };
export type LadderRow = { username: string; elo: number; xp: number; /** Equipped nickname effect (see cosmetics.ts). */ nameFx?: string };
export type MatchRewards = { elo: number; currency: number; gained: number; xp: number };
export type BattlegroundsRewards = MatchRewards & { place: number; eloDelta: number; xpGain: number; beerMlGain: number };
