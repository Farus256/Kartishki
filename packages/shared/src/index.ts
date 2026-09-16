import { schema, t } from '@colyseus/schema';
export * from './shop';

export const phases = ['start', 'main', 'combat', 'end'] as const;
export type Phase = typeof phases[number];
export type AdvanceAction = { expectedRevision: number };
export const DECK_SIZE = 30;
/** 1v1 (Hearthstone standard) pacing and limits. */
export const MATCH_RULES = {
  /** Hero pick, mulligan and a turn: the room clock ends each on its own. */
  HERO_MS: 30_000,
  MULLIGAN_MS: 30_000,
  TURN_MS: 75_000,
  /** The fuse burns for the last stretch of a turn. */
  ROPE_MS: 15_000,
  RECONNECT_S: 30,
  BOARD_LIMIT: 7,
  HAND_LIMIT: 10,
  MAX_MANA: 10,
  /** Opening hands: the first player draws three, the second four plus The Coin. */
  FIRST_HAND: 3,
  SECOND_HAND: 4,
} as const;
/** The Coin is not a catalog card: the second player gets it after the mulligan and it cannot be put in a deck. */
export const COIN_CARD_ID = 'the-coin';
export const PlayerState = schema({
  health: t.number().default(30), maxHealth: t.number().default(30), heroId: t.string().default(''), powerUsed: t.boolean().default(false),
  mana: t.number().default(0), maxMana: t.number().default(0), handCount: t.number().default(0), deckCount: t.number().default(DECK_SIZE),
  /** Mulligan confirmed (or timed out). */
  mulliganDone: t.boolean().default(false),
  connected: t.boolean().default(true),
}, 'PlayerState');
export const MinionState = schema({
  id: t.string(), cardId: t.string(), owner: t.string(), attack: t.number(), health: t.number(), maxHealth: t.number(),
  shield: t.boolean().default(false), ready: t.boolean().default(false), enrageBonus: t.number().default(0), enraged: t.boolean().default(false),
}, 'MinionState');
export type MinionState = InstanceType<typeof MinionState>;
// Public information only. Never add hidden hands or deck order here.
export const MatchState = schema({
  players: t.map(PlayerState), status: t.string().default('waiting'),
  minions: t.map(MinionState), catalogVersion: t.number().default(1),
  phase: t.string().default('start'), activePlayer: t.string().default(''),
  turn: t.number().default(0), revision: t.number().default(0), winner: t.string().default(''),
  /** Epoch ms when the running phase (hero pick, mulligan, turn) ends on its own; 0 = no clock. */
  phaseEndsAt: t.number().default(0),
  /** Who plays the first turn (the other side holds The Coin). */
  first: t.string().default(''),
}, 'MatchState');
export type MatchState = InstanceType<typeof MatchState>;
export const rarities = ['common', 'rare', 'epic', 'legendary', 'ultimate'] as const;
export type CardDefinition = {
  schemaVersion: 1; id: string; name: Record<string, string>; description: Record<string, string>;
  rarity: typeof rarities[number]; cost: number; attack: number; health: number;
  autoBattlerId?: string;
  minionTypes: string[]; properties: string[];
  abilities: { name?: string; trigger: string; effectId: string; params: Record<string, string | number | boolean> }[];
  art: {
    url: string; crop: { x: number; y: number; size: number }; threshold: number; contrast: number;
    preset?: 'printed' | 'dirty' | 'noir' | 'faded' | 'sepia' | 'harsh' | 'cyan' | 'bleach' | 'offset' | 'flash' | 'toon' | 'gif' | 'none' | 'xerox' | 'comic' | 'stencil';
    saturation?: number; intensity?: number; edgeWidth?: number; rasterIntensity?: number;
    originalUrl?: string;
    brightness?: number; warmth?: number; grain?: number; paper?: number; vignette?: number; inkEdge?: number; rotation?: number;
  };
  audio: Partial<Record<'spawn' | 'attack' | 'death', string>>;
};
export type HandCard = { instanceId: string; cardId: string };
export type GameEvent = { id: number; kind: 'spawn' | 'attack' | 'death' | 'draw' | 'power' | 'coin' | 'burn' | 'fatigue' | 'turn'; cardId: string; source: string; target?: string; amount?: number };
export type HeroDefinition = {
  id: string; name: string; description: string; health: number; art: CardDefinition['art'];
  ability: { name: string; cost: number; effectId: 'damage' | 'heal' | 'summon'; amount: number; cardId?: string };
};
export type Catalog = { version: number; cards: CardDefinition[]; heroes?: HeroDefinition[]; autoBattlerMinions?: import('./autoBattler').AutoBattlerMinionDef[]; autoBattlerHeroes?: import('./autoBattler').AutoBattlerHeroDef[]; autoBattlerCopy?: import('./autoBattler').AutoBattlerCopy; playerLeveling?: import('./leveling').PlayerLeveling; menuMusic?: import('./menuMusic').MenuMusic; shop?: import('./shop').ShopConfig; /** Workshop card sets published on this server. */ cardSets?: import('./cardSets').CardSet[] };
export { starterHeroes, validateHero } from './heroes';
export { starterCards, coinCard, validateCard, effects, triggers, properties } from './cards';
export {
  DAILY_REWARD, WIN_REWARD, PACK_COST, CASE_COST, PACK_SIZE,
  BOTTLE_CAPACITY, BEER_WIN_MIN, BEER_WIN_MAX, BEER_DRAW_MIN, BEER_DRAW_MAX, BEER_LOSS_MIN, BEER_LOSS_MAX,
  beerMlBetween, beerMlForResult, beerMlForPlace, applyBeerMl,
  defaultSettings, resolveSettings, validateSettingsPatch,
} from './players';
export type { PlayerProfile, PlayerSettings, SavedDeck, PlayerLibrary, PlayerLogin, LootCard, PackResult, CaseResult, LadderRow, MatchRewards, BattlegroundsRewards } from './players';
export { BATTLEGROUNDS_CURRENCY_REWARDS, battlegroundsCurrencyReward } from './players';
export * from './autoBattler';
export * from './matchTribes';
export * from './cardSets';
export * from './fairness';
export * from './cosmetics';
export * from './leveling';
export * from './menuMusic';
