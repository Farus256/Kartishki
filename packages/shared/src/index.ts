import { schema, t } from '@colyseus/schema';

export const phases = ['start', 'main', 'combat', 'end'] as const;
export type Phase = typeof phases[number];
export type AdvanceAction = { expectedRevision: number };
export const DECK_SIZE = 30;
export const PlayerState = schema({ health: t.number().default(30), mana: t.number().default(0), handCount: t.number().default(0), deckCount: t.number().default(DECK_SIZE) }, 'PlayerState');
export const MinionState = schema({
  id: t.string(), cardId: t.string(), owner: t.string(), attack: t.number(), health: t.number(), maxHealth: t.number(),
  shield: t.boolean().default(false), ready: t.boolean().default(false), enrageBonus: t.number().default(0),
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
  minionTypes: string[]; properties: string[];
  abilities: { trigger: string; effectId: string; params: Record<string, string | number | boolean> }[];
  art: { url: string; crop: { x: number; y: number; size: number }; threshold: number; contrast: number; preset?: 'xerox' | 'comic' | 'stencil'; edgeWidth?: number; rasterIntensity?: number };
  audio: Partial<Record<'spawn' | 'attack' | 'death', string>>;
};
export type HandCard = { instanceId: string; cardId: string };
export type GameEvent = { id: number; kind: 'spawn' | 'attack' | 'death' | 'draw'; cardId: string; source: string; target?: string };
export type Catalog = { version: number; cards: CardDefinition[] };
export { starterCards, validateCard, effects, triggers, properties } from './cards';
export {
  DAILY_REWARD, WIN_REWARD, PACK_COST, CASE_COST, PACK_SIZE,
} from './players';
export type { PlayerProfile, SavedDeck, PlayerLibrary, PlayerLogin, LootCard, PackResult, CaseResult, LadderRow, MatchRewards } from './players';
