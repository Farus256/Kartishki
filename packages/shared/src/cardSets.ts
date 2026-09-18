import {
  abTribes,
  starterAutoBattlerHeroes,
  starterAutoBattlerMinions,
  validateAutoBattlerCopy,
  validateAutoBattlerHero,
  validateAutoBattlerMinion,
  type AutoBattlerCatalog,
  type AutoBattlerCopy,
  type AutoBattlerHeroDef,
  type AutoBattlerLoc,
  type AutoBattlerMinionDef,
} from './autoBattler';
import { BOARD_PRESETS } from './cosmetics';
import { validateMenuMusic, type MenuMusicTrack } from './menuMusic';
import { validateSetLeveling, type PlayerLeveling } from './leveling';

/**
 * A Workshop card set: one self-contained file people share and play with.
 * `format` is the file format version; bump it when the shape changes so old files can be upgraded.
 */
export const CARD_SET_FORMAT = 1;
export const CARD_SET_MIN_TAVERN = 8;
export const CARD_SET_MAX_MINIONS = 260;
export const CARD_SET_MAX_WALLPAPER = 40;
const WALLPAPER_URL = /^\/api\/portraits\/[a-f0-9]{64}\.(png|jpeg|webp)$/;

/** What a set changes outside the tavern: the menu behind it, its music, the level ladder (and later the table itself). */
export type CardSetTheme = {
  /** Cut-out faces drifting behind the main menu (uploaded portraits). */
  wallpaper?: string[];
  /** Menu playlist instead of the server's default. */
  menuMusic?: MenuMusicTrack[];
  /** Level names and count (display-side; XP awards stay the game's). */
  leveling?: PlayerLeveling;
};

export type CardSet = {
  format: number;
  id: string;
  name: AutoBattlerLoc;
  description?: AutoBattlerLoc;
  author?: string;
  /** Bumped on every publish; the lobby shows it so tables agree on the file. */
  version: number;
  minions: AutoBattlerMinionDef[];
  /** Optional hero roster; the starter heroes play when omitted. */
  heroes?: AutoBattlerHeroDef[];
  copy?: AutoBattlerCopy;
  /** Table preset the set was designed for (cosmetic). */
  board?: string;
  theme?: CardSetTheme;
};

export type CardSetSummary = Pick<CardSet, 'id' | 'name' | 'author' | 'version' | 'board'> & { minions: number; heroes: number };

const idOk = (id: unknown) => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,59}$/.test(id);
const locOk = (value: unknown, max: number) => !!value && typeof value === 'object'
  && typeof (value as AutoBattlerLoc).ru === 'string' && (value as AutoBattlerLoc).ru.length <= max
  && typeof (value as AutoBattlerLoc).en === 'string' && (value as AutoBattlerLoc).en.length <= max;

/** Every id a set summons (deathrattles and summon steps) must exist in the set or among the starter tokens. */
export function cardSetSummonIds(minions: AutoBattlerMinionDef[]): string[] {
  const ids = new Set<string>();
  for (const m of minions) {
    if (m.deathrattle) ids.add(m.deathrattle.summonId);
    for (const effect of m.effects ?? []) for (const part of [effect, ...(effect.steps ?? [])]) if (part.action.kind === 'summon') ids.add(part.action.summonId);
  }
  return [...ids];
}

export function validateCardSet(value: unknown): value is CardSet {
  if (!value || typeof value !== 'object') return false;
  const set = value as CardSet;
  if (set.format !== CARD_SET_FORMAT || !idOk(set.id)) return false;
  if (!locOk(set.name, 100) || !set.name.ru.trim()) return false;
  if (set.description !== undefined && !locOk(set.description, 1000)) return false;
  if (set.author !== undefined && (typeof set.author !== 'string' || set.author.length > 60)) return false;
  if (!Number.isInteger(set.version) || set.version < 1) return false;
  if (!Array.isArray(set.minions) || set.minions.length < 1 || set.minions.length > CARD_SET_MAX_MINIONS || !set.minions.every(validateAutoBattlerMinion)) return false;
  if (new Set(set.minions.map(m => m.id)).size !== set.minions.length) return false;
  if (set.minions.filter(m => !m.token && !m.spell && m.inTavern !== false).length < CARD_SET_MIN_TAVERN) return false;
  const known = new Set([...set.minions.map(m => m.id), ...starterAutoBattlerMinions.filter(m => m.token).map(m => m.id)]);
  if (!cardSetSummonIds(set.minions).every(id => known.has(id))) return false;
  if (set.heroes !== undefined && (!Array.isArray(set.heroes) || set.heroes.length < 2 || set.heroes.length > 40 || !set.heroes.every(validateAutoBattlerHero) || new Set(set.heroes.map(h => h.id)).size !== set.heroes.length)) return false;
  if (set.copy !== undefined && !validateAutoBattlerCopy(set.copy)) return false;
  if (set.board !== undefined && !BOARD_PRESETS.some(p => p.id === set.board)) return false;
  const tribes = abTribes(set.copy);
  if (set.minions.some(m => m.tribes?.some(id => !tribes.includes(id)))) return false;
  if (set.theme !== undefined && !validateCardSetTheme(set.theme)) return false;
  return true;
}

export function cardSetSummary(set: CardSet): CardSetSummary {
  return { id: set.id, name: set.name, author: set.author, version: set.version, board: set.board, minions: set.minions.filter(m => !m.token).length, heroes: set.heroes?.length ?? 0 };
}

/** The tavern a table plays when it picked a set: the set's minions plus any starter token they summon. */
export function catalogFromCardSet(set: CardSet, version = set.version, fallbackHeroes: AutoBattlerHeroDef[] = starterAutoBattlerHeroes): AutoBattlerCatalog {
  const own = new Set(set.minions.map(m => m.id));
  const needed = new Set(cardSetSummonIds(set.minions));
  const tokens = starterAutoBattlerMinions.filter(m => m.token && needed.has(m.id) && !own.has(m.id));
  return {
    version,
    minions: [...set.minions, ...tokens],
    heroes: set.heroes?.length ? set.heroes : fallbackHeroes,
    copy: set.copy,
  };
}

/** A fresh set built from the current tavern: the natural starting point for a Workshop author. */
export function cardSetFromCatalog(catalog: AutoBattlerCatalog, id: string, name: AutoBattlerLoc, author = ''): CardSet {
  return { format: CARD_SET_FORMAT, id, name, author, version: 1, minions: structuredClone(catalog.minions), heroes: structuredClone(catalog.heroes), copy: catalog.copy ? structuredClone(catalog.copy) : undefined };
}

export function validateCardSetTheme(value: unknown): value is CardSetTheme {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const theme = value as CardSetTheme;
  if (theme.wallpaper !== undefined && (!Array.isArray(theme.wallpaper) || theme.wallpaper.length > CARD_SET_MAX_WALLPAPER || !theme.wallpaper.every(url => typeof url === 'string' && WALLPAPER_URL.test(url)))) return false;
  if (theme.menuMusic !== undefined && !validateMenuMusic({ tracks: theme.menuMusic })) return false;
  if (theme.leveling !== undefined && !validateSetLeveling(theme.leveling)) return false;
  return true;
}
