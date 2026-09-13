import { schema, t } from '@colyseus/schema';

export const phases = ['start', 'main', 'combat', 'end'] as const;
export type Phase = typeof phases[number];
export type AdvanceAction = { expectedRevision: number };
export const DECK_SIZE = 30;
export const PlayerState = schema({ health: t.number().default(30), maxHealth: t.number().default(30), heroId: t.string().default(''), powerUsed: t.boolean().default(false), mana: t.number().default(0), handCount: t.number().default(0), deckCount: t.number().default(DECK_SIZE) }, 'PlayerState');
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
export type GameEvent = { id: number; kind: 'spawn' | 'attack' | 'death' | 'draw' | 'power'; cardId: string; source: string; target?: string };
export type HeroDefinition = {
  id: string; name: string; description: string; health: number; art: CardDefinition['art'];
  ability: { name: string; cost: number; effectId: 'damage' | 'heal' | 'summon'; amount: number; cardId?: string };
};
export type Catalog = { version: number; cards: CardDefinition[]; heroes?: HeroDefinition[]; autoBattlerMinions?: import('./autoBattler').AutoBattlerMinionDef[]; autoBattlerHeroes?: import('./autoBattler').AutoBattlerHeroDef[]; autoBattlerCopy?: import('./autoBattler').AutoBattlerCopy; playerLeveling?: import('./leveling').PlayerLeveling; menuMusic?: import('./menuMusic').MenuMusic };
export { starterHeroes, validateHero } from './heroes';
export { starterCards, validateCard, effects, triggers, properties } from './cards';
export {
  DAILY_REWARD, WIN_REWARD, PACK_COST, CASE_COST, PACK_SIZE,
  BOTTLE_CAPACITY, CALIBRATION_ML, ML_PER_ELO, remainingMlFromElo,
} from './players';
export type { PlayerProfile, SavedDeck, PlayerLibrary, PlayerLogin, LootCard, PackResult, CaseResult, LadderRow, MatchRewards, BattlegroundsRewards } from './players';
export * from './autoBattler';
export * from './leveling';
export * from './menuMusic';
