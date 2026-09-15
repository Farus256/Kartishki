import { schema, t } from '@colyseus/schema';
import { starterCards, validateCard } from './cards';

/** Phase machine: LOBBY -> HERO_SELECTION -> loop(RECRUIT_PHASE <-> COMBAT_PHASE) -> GAME_OVER */
export const autoBattlerPhases = ['LOBBY', 'HERO_SELECTION', 'RECRUIT_PHASE', 'COMBAT_PHASE', 'GAME_OVER'] as const;
export type AutoBattlerPhase = typeof autoBattlerPhases[number];

export const AUTO_BATTLER = {
  MAX_PLAYERS: 8,
  MIN_PLAYERS: 2,
  BOARD_LIMIT: 7,
  HAND_LIMIT: 10,
  GOLD_CAP: 10,
  BUY_COST: 3,
  SELL_REWARD: 1,
  REROLL_COST: 1,
  FREEZE_COST: 0,
  STARTING_HEALTH: 40,
  MAX_TIER: 6,
  DISCOVER_COUNT: 3,
  DISCOVER_SPELL_ID: 'ab-discover',
  HERO_CHOICES: 2,
  /** Authoritative recruit-phase length. Room clock ticks seconds; at 0 combat starts. */
  /** Turn 1 recruit length; each later turn adds RECRUIT_STEP_MS up to RECRUIT_MAX_MS (bigger boards need more time). */
  RECRUIT_MS: 35_000,
  RECRUIT_STEP_MS: 8_000,
  RECRUIT_MAX_MS: 80_000,
  HERO_SELECT_MS: 20_000,
  RECONNECT_GRACE_SECONDS: 45,
  MAX_COMBAT_ACTIONS: 512,
  MAX_COMBAT_MS: 23_000,
  RESULT_STAMP_MS: 700,
  /** Recruit opens this long after the shortest fight of the round ends; longer fights keep playing on their own clients. */
  COMBAT_GRACE_MS: 4_000,
  DAMAGE_CAP_ENABLED: true,
  DAMAGE_CAP: 15,
} as const;

export const TAVERN_CONFIG: Record<1 | 2 | 3 | 4 | 5 | 6, {
  shopSize: number;
  baseUpgradeCost: number;
  availableMinionTiers: number;
}> = {
  1: { shopSize: 3, baseUpgradeCost: 5, availableMinionTiers: 1 },
  2: { shopSize: 4, baseUpgradeCost: 7, availableMinionTiers: 2 },
  3: { shopSize: 4, baseUpgradeCost: 8, availableMinionTiers: 3 },
  4: { shopSize: 5, baseUpgradeCost: 9, availableMinionTiers: 4 },
  5: { shopSize: 6, baseUpgradeCost: 10, availableMinionTiers: 5 },
  6: { shopSize: 6, baseUpgradeCost: 0, availableMinionTiers: 6 },
};

/**
 * Gold to leave the current tavern tier (index = current tier). Tier 6 cannot upgrade.
 *
 * Upgrade cost rule (documented):
 * - Costs are initialized to (base + 1) when a player is created.
 * - At the START of every recruit phase, including the first after hero select,
 *   the stored cost decreases by 1 (floored at 0).
 * - Therefore turn 1 T1→T2 costs 5, matching Battlegrounds.
 * - Upgrading mid-turn replaces the cost with the FULL base of the new tier
 *   (this turn's decrement is not applied a second time).
 */
export const UPGRADE_BASE_COST = [0, 5, 7, 8, 9, 10] as const;

export const TAVERN_SIZE_BY_TIER = [0, 3, 4, 4, 5, 6, 6] as const;

/** Battlegrounds curve: turn 1 = 3, then +1/turn, cap 10. gold = min(10, turn + 2). */
export function goldForTurn(turn: number): number {
  return Math.min(AUTO_BATTLER.GOLD_CAP, Math.max(0, turn) + 2);
}

export function tavernSizeForTier(tier: number): number {
  const clamped = Math.min(AUTO_BATTLER.MAX_TIER, Math.max(1, tier)) as 1 | 2 | 3 | 4 | 5 | 6;
  return TAVERN_CONFIG[clamped]?.shopSize ?? TAVERN_SIZE_BY_TIER[clamped] ?? 6;
}

export function initialUpgradeCost(tier: number): number {
  const base = UPGRADE_BASE_COST[Math.min(5, Math.max(1, tier))] ?? 10;
  return base + 1;
}

export function upgradeCostAfterTierUp(newTier: number): number {
  if (newTier >= AUTO_BATTLER.MAX_TIER) return 0;
  return UPGRADE_BASE_COST[newTier] ?? 10;
}

export const AUTO_BATTLER_MESSAGES = {
  ready: 'ready',
  startGame: 'startGame',
  chooseHero: 'chooseHero',
  buy: 'buy',
  sell: 'sell',
  reroll: 'reroll',
  freeze: 'freeze',
  tierUp: 'tierUp',
  playCard: 'playCard',
  moveBoard: 'moveBoard',
  heroPower: 'heroPower',
  endRecruit: 'endRecruit',
  cancelRecruit: 'cancelRecruit',
  discoverPick: 'discoverPick',
} as const;

export const ACTION_ERROR_CODES = [
  'WRONG_PHASE',
  'PLAYER_DEAD',
  'NOT_ENOUGH_GOLD',
  'INVALID_TARGET',
  'SHOP_SLOT_NOT_FOUND',
  'BOARD_FULL',
  'HAND_FULL',
  'HERO_POWER_EXHAUSTED',
  'HERO_POWER_UNAFFORDABLE',
  'DISCOVER_NOT_ACTIVE',
  'INVALID_DISCOVER_OPTION',
  'TAVERN_MAX_TIER',
  'ACTION_TOO_LATE',
  'INVALID_MOVE',
  'REJECTED',
] as const;
export type ActionErrorCode = typeof ACTION_ERROR_CODES[number];
export type ActionErrorPayload = { code: ActionErrorCode; message: string };

export const AUTO_BATTLER_CLIENT_EVENTS = {
  actionError: 'actionError',
  catalog: 'catalog',
  heroOffers: 'heroOffers',
  combatEvents: 'combatEvents',
  discoverOptions: 'discoverOptions',
  rewards: 'rewards',
} as const;

export type HeroPowerTargetDomain = 'tavern' | 'board' | 'none';
/** Passive = always on (event hooks). Active = spend gold; most are once per turn. */
export type HeroPowerKind = 'passive' | 'active';

/**
 * Replicated Hero Power.
 * Passive: isPassive=true, no click, hooks fire on buy/sell/recruit.
 * Active: goldCost, isExhausted resets each recruit turn.
 * Targeted: click power, then a tavern or board minion (targetDomain).
 */
export const HeroPowerState = schema({
  id: t.string().default(''),
  isPassive: t.boolean().default(false),
  goldCost: t.number().default(0),
  isExhausted: t.boolean().default(false),
  targeted: t.boolean().default(false),
  /** tavern | board | none */
  targetDomain: t.string().default('none'),
}, 'AutoBattlerHeroPowerState');
export type HeroPowerState = InstanceType<typeof HeroPowerState>;
export const HeroPower = HeroPowerState;

/** Replicated Hero: health usually 40, plus HeroPower. */
export const HeroState = schema({
  heroId: t.string().default(''),
  portraitKey: t.string().default(''),
  health: t.number().default(AUTO_BATTLER.STARTING_HEALTH),
  maxHealth: t.number().default(AUTO_BATTLER.STARTING_HEALTH),
  power: HeroPowerState,
}, 'AutoBattlerHeroState');
export type HeroState = InstanceType<typeof HeroState>;
export const Hero = HeroState;

export const AutoBattlerMinionState = schema({
  id: t.string().default(''),
  cardId: t.string().default(''),
  baseId: t.string().default(''),
  kind: t.string().default('minion'),
  attack: t.number().default(0),
  health: t.number().default(0),
  maxHealth: t.number().default(0),
  tavernTier: t.number().default(1),
  keywords: t.array('string'),
  tribes: t.array('string'),
  golden: t.boolean().default(false),
  owner: t.string().default(''),
  bonusAttack: t.number().default(0),
  bonusHealth: t.number().default(0),
  poolCopies: t.number().default(0),
  tripleReward: t.boolean().default(false),
}, 'AutoBattlerMinionState');
export type AutoBattlerMinionState = InstanceType<typeof AutoBattlerMinionState>;

export const TavernState = schema({
  // Owner-only. Nested keyword/tribe arrays need the explicit view.add in AutoBattlerRoom.onBeforePatch.
  offers: t.array(AutoBattlerMinionState).view(1),
  frozen: t.boolean().default(false),
  size: t.number().default(3),
}, 'AutoBattlerTavernState');
export type TavernState = InstanceType<typeof TavernState>;

export const CombatPairState = schema({
  playerA: t.string().default(''),
  playerB: t.string().default(''),
  ghost: t.boolean().default(false),
}, 'AutoBattlerCombatPairState');
export type CombatPairState = InstanceType<typeof CombatPairState>;

export const PoolStockState = schema({
  baseId: t.string().default(''),
  remaining: t.number().default(0),
  tavernTier: t.number().default(1),
}, 'AutoBattlerPoolStockState');
export type PoolStockState = InstanceType<typeof PoolStockState>;

export const AutoBattlerPlayerState = schema({
  sessionId: t.string().default(''),
  displayName: t.string().default(''),
  hero: HeroState,
  gold: t.number().default(0),
  tavernTier: t.number().default(1),
  upgradeCost: t.number().default(6),
  board: t.array(AutoBattlerMinionState).view(1),
  hand: t.array(AutoBattlerMinionState).view(1),
  tavern: TavernState,
  tripleCounts: t.map('number').view(1),
  tripleSerial: t.number().default(0),
  /** Highest actionId this player's recruit action applied. Clients drop optimistic ops at or below it. */
  lastActionId: t.number().default(0),
  /** Current prices, so anomalies and free-refresh spells reach every client check. */
  buyCost: t.number().default(AUTO_BATTLER.BUY_COST),
  rerollCost: t.number().default(AUTO_BATTLER.REROLL_COST),
  freeRerolls: t.number().default(0),
  buysThisTurn: t.number().default(0),
  nextOpponentId: t.string().default(''),
  lastOpponentId: t.string().default(''),
  swords: t.boolean().default(false),
  combatPairIndex: t.number().default(-1),
  lastCombatOpponentId: t.string().default(''),
  lastCombatSeed: t.number().default(0),
  lastCombatResult: t.string().default(''),
  lastCombatDamage: t.number().default(0),
  lastCombatEventCount: t.number().default(0),
  lastCombatSummary: t.string().default(''),
  pendingDiscover: t.array(AutoBattlerMinionState).view(1),
  discoverOpen: t.boolean().default(false),
  recruitReady: t.boolean().default(false),
  eliminated: t.boolean().default(false),
  placement: t.number().default(0),
  connected: t.boolean().default(true),
}, 'AutoBattlerPlayerState');
export type AutoBattlerPlayerState = InstanceType<typeof AutoBattlerPlayerState>;

export const AutoBattlerRoomState = schema({
  phase: t.string().default('LOBBY'),
  turn: t.number().default(0),
  revision: t.number().default(0),
  players: t.map(AutoBattlerPlayerState),
  playerOrder: t.array('string'),
  pairing: t.array(CombatPairState),
  pool: t.array(PoolStockState).view(1),
  winnerId: t.string().default(''),
  combatSeed: t.number().default(0).view(1),
  catalogVersion: t.number().default(1),
  /** Whole seconds left in the current recruit phase. 0 outside recruit. */
  recruitSeconds: t.number().default(0),
  heroSeconds: t.number().default(0),
  phaseEndsAt: t.number().default(0),
  /** One rule twist for the whole table, chosen at game start (see AB_ANOMALIES). */
  anomalyId: t.string().default(''),
}, 'AutoBattlerRoomState');
export type AutoBattlerRoomState = InstanceType<typeof AutoBattlerRoomState>;

export type CombatEventKind =
  | 'COMBAT_START'
  | 'ATTACK'
  | 'HUMILIATE'
  | 'BAIT'
  | 'DAMAGE'
  | 'CLEAVE_DAMAGE'
  | 'DIVINE_SHIELD_POP'
  | 'DEATH'
  | 'DEATHRATTLE'
  | 'REBORN'
  | 'SUMMON'
  | 'PLAYER_DAMAGE'
  | 'STATS'
  | 'LIMIT_REACHED'
  | 'COMBAT_END';

export type CombatEvent = {
  id: number;
  kind: CombatEventKind;
  seed?: number;
  playerA?: string;
  playerB?: string;
  sourceId?: string;
  targetId?: string;
  sourceCardId?: string;
  targetCardId?: string;
  cardId?: string;
  minionId?: string;
  owner?: string;
  amount?: number;
  remainingHealth?: number;
  index?: number;
  winnerId?: string;
  loserId?: string;
  damage?: number;
  tie?: boolean;
  minion?: CombatVisualMinion;
  attack?: number;
  /** STATS: the target's keywords after a combat-time grant (Divine Shield, Taunt…). */
  keywords?: string[];
};

export type CombatVisualMinion = {
  id: string; cardId: string; baseId: string; attack: number; health: number;
  tavernTier: number; keywords: string[]; golden: boolean; owner: string;
};

export type CombatEventsMessage = {
  turn: number;
  pairIndex: number;
  playerA: string;
  playerB: string;
  ghost: boolean;
  seed: number;
  events: CombatEvent[];
  boards: { a: CombatVisualMinion[]; b: CombatVisualMinion[] };
  /** Public hero health before any pair resolves this round. */
  initialHealth?: Record<string, number>;
  durationMs: number;
  summary: {
    winnerId: string;
    loserId: string;
    damage: number;
    tie: boolean;
  };
};

export type DiscoverOptionsMessage = {
  spellId: string;
  options: { id: string; cardId: string; attack: number; health: number; tavernTier: number; keywords: string[] }[];
};

export const autoBattlerKeywords = ['taunt', 'divineShield', 'poisonous', 'deathrattle', 'battlecry', 'windfury', 'reborn', 'cleave', 'immune', 'cannotAttack', 'humiliate', 'bait'] as const;
export type AutoBattlerKeyword = typeof autoBattlerKeywords[number];

export const autoBattlerTribes = ['beast', 'mech', 'pirate', 'undead', 'dragon', 'neutral'] as const;
export type AutoBattlerTribe = typeof autoBattlerTribes[number];
export const autoBattlerBattlecries = ['ab-bc-gold'] as const;
export const autoBattlerAuras = ['ab-aura-beasts'] as const;

/**
 * Data-driven minion effects. The server interprets them (see keywords.ts):
 * - battlecry: when this card is played · play: whenever a friendly minion is played (onTribe filter)
 * - buy: after you buy a minion (onTribe filter; target 'bought' buffs that card)
 * - sell: when this card is sold (gold) or whenever any minion is sold (buff targets)
 * - endTurn: when the recruit phase ends · triple: whenever you make a triple
 * - startCombat: at the start of combat (that fight only) · deathrattle: in combat when this minion dies
 * - aura: attack bonus for other friendly minions of the given tribe during combat
 * - reroll: after you refresh the tavern · friendlyDeath: in combat, whenever another friendly minion dies
 * - shieldPop: in combat, whenever a friendly minion loses Divine Shield · friendlyAttack: in combat, after a friendly minion attacks
 * Buff amounts double for a golden owner.
 */
export const autoBattlerEffectTriggers = ['battlecry', 'play', 'buy', 'sell', 'endTurn', 'triple', 'startCombat', 'deathrattle', 'aura', 'reroll', 'friendlyDeath', 'shieldPop', 'friendlyAttack'] as const;
export type AutoBattlerEffectTrigger = typeof autoBattlerEffectTriggers[number];
export const autoBattlerEffectTargets = ['self', 'adjacent', 'friendly', 'random', 'bought', 'hand', 'tavern', 'subject'] as const;
export type AutoBattlerEffectTarget = typeof autoBattlerEffectTargets[number];
export type AutoBattlerEffectAction =
  | { kind: 'buff'; attack: number; health: number }
  | { kind: 'gold'; amount: number }
  | { kind: 'aura'; attack: number }
  /** Grants a keyword to the targets (no duplicates). */
  | { kind: 'keyword'; keyword: AutoBattlerKeyword }
  /** Summons tokens: onto your tavern board (battlecry/endTurn/…) or into combat (startCombat/deathrattle/friendlyDeath). */
  | { kind: 'summon'; summonId: string; count: number };
export const autoBattlerEffectScales = ['tribes', 'minions'] as const;
export type AutoBattlerEffect = {
  trigger: AutoBattlerEffectTrigger;
  /** Who receives a buff; defaults to 'self'. 'subject' = the minion that caused the trigger (played/bought/dying/attacking). */
  target?: AutoBattlerEffectTarget;
  /** Tribe filter for 'friendly' / 'random' / 'hand' / 'aura' targets. */
  tribe?: AutoBattlerTribe | 'all';
  /** For play/buy/sell/friendlyDeath/shieldPop/friendlyAttack: only fire when the subject minion has this tribe. */
  onTribe?: AutoBattlerTribe | 'all';
  /** Same, by keyword (e.g. only when a Deathrattle minion dies). */
  onKeyword?: AutoBattlerKeyword;
  /** Multiply buff amounts: 'tribes' = distinct tribes on your board (menagerie), 'minions' = friendly minions matching perTribe/perKeyword. */
  per?: typeof autoBattlerEffectScales[number];
  perTribe?: AutoBattlerTribe | 'all';
  perKeyword?: AutoBattlerKeyword;
  action: AutoBattlerEffectAction;
};

export const autoBattlerSpellKinds = ['discover', 'coin', 'freeReroll', 'tonic'] as const;
export type AutoBattlerSpellKind = typeof autoBattlerSpellKinds[number];
export type AutoBattlerSpell = { kind: AutoBattlerSpellKind; amount?: number };

export type AutoBattlerLoc = { ru: string; en: string };
export type AutoBattlerCopyEntry = { name: AutoBattlerLoc; description?: AutoBattlerLoc };
export type AutoBattlerCopy = {
  keywords?: Partial<Record<AutoBattlerKeyword, AutoBattlerCopyEntry>>;
  tribes?: Partial<Record<AutoBattlerTribe, AutoBattlerCopyEntry>>;
  battlecries?: Partial<Record<string, AutoBattlerCopyEntry>>;
  auras?: Partial<Record<string, AutoBattlerCopyEntry>>;
  powers?: Partial<Record<string, AutoBattlerCopyEntry>>;
};
export type AutoBattlerCopyGroup = keyof AutoBattlerCopy;

export function pickLoc(name: { ru: string; en?: string }, lang: string): string {
  return lang.startsWith('en') ? (name.en || name.ru || '') : (name.ru || name.en || '');
}

export function abCopyEntry(copy: AutoBattlerCopy | undefined, group: AutoBattlerCopyGroup, id: string): AutoBattlerCopyEntry | undefined {
  const bag = copy?.[group] as Record<string, AutoBattlerCopyEntry> | undefined;
  return bag?.[id];
}

export function abCopyName(copy: AutoBattlerCopy | undefined, group: AutoBattlerCopyGroup, id: string, lang: string, fallback: string): string {
  const entry = abCopyEntry(copy, group, id);
  const name = entry ? pickLoc(entry.name, lang).trim() : '';
  return name || fallback;
}

export function abCopyDescription(copy: AutoBattlerCopy | undefined, group: AutoBattlerCopyGroup, id: string, lang: string, fallback = ''): string {
  const entry = abCopyEntry(copy, group, id);
  const text = entry?.description ? pickLoc(entry.description, lang).trim() : '';
  return text || fallback;
}

export type AutoBattlerMinionDef = {
  id: string;
  name: { ru: string; en: string };
  description?: AutoBattlerLoc;
  art?: import('./index').CardDefinition['art'];
  tavernTier: 1 | 2 | 3 | 4 | 5 | 6;
  attack: number;
  health: number;
  keywords: AutoBattlerKeyword[];
  tribes?: AutoBattlerTribe[];
  poolCopies?: number;
  token?: boolean;
  generated?: boolean;
  inTavern?: boolean;
  inDiscover?: boolean;
  battlecryId?: string;
  deathrattle?: { summonId: string; count: number };
  auraId?: string;
  effects?: AutoBattlerEffect[];
  /** A tavern spell: bought like a minion, played from hand for its effect, never on the board. */
  spell?: AutoBattlerSpell;
  /** Custom golden stats. When omitted, attack/health double. */
  golden?: { attack: number; health: number; keywords?: AutoBattlerKeyword[] };
};

export const autoBattlerHeroPowerPresets = {
  'ab-power-heal': { isPassive: false, goldCost: 1, targeted: false, targetDomain: 'none' as const },
  'ab-power-buff-tavern': { isPassive: false, goldCost: 1, targeted: true, targetDomain: 'tavern' as const },
  'ab-power-buff-board': { isPassive: false, goldCost: 1, targeted: true, targetDomain: 'board' as const },
  'ab-power-sell-gold': { isPassive: true, goldCost: 0, targeted: false, targetDomain: 'none' as const },
  'ab-power-free-roll': { isPassive: true, goldCost: 0, targeted: false, targetDomain: 'none' as const },
  'ab-power-discover': { isPassive: false, goldCost: 2, targeted: false, targetDomain: 'none' as const },
  'ab-power-beast-buy': { isPassive: true, goldCost: 0, targeted: false, targetDomain: 'none' as const },
  'ab-power-shield': { isPassive: false, goldCost: 1, targeted: true, targetDomain: 'board' as const },
  'ab-power-undead-end': { isPassive: true, goldCost: 0, targeted: false, targetDomain: 'none' as const },
  'ab-power-rich': { isPassive: true, goldCost: 0, targeted: false, targetDomain: 'none' as const },
  'ab-power-triple-buff': { isPassive: true, goldCost: 0, targeted: false, targetDomain: 'none' as const },
  'ab-power-swap': { isPassive: false, goldCost: 1, targeted: true, targetDomain: 'board' as const },
} as const;

/** One rule twist per table. Names/descriptions live in i18n (abAnomaly_<id>, abAnomalyHint_<id>). */
export const AB_ANOMALIES = ['ab-anomaly-brawl', 'ab-anomaly-big-tavern', 'ab-anomaly-free-refresh', 'ab-anomaly-fast-start', 'ab-anomaly-deep-pockets', 'ab-anomaly-cheap-powers', 'ab-anomaly-on-the-house', 'ab-anomaly-fence', 'ab-anomaly-back-room', 'ab-anomaly-bloodbath', 'ab-anomaly-plated', 'ab-anomaly-second-wind', 'ab-anomaly-lucky-find'] as const;
export type AbAnomalyId = typeof AB_ANOMALIES[number];
export type AutoBattlerHeroPowerId = keyof typeof autoBattlerHeroPowerPresets;

export type AutoBattlerHeroDef = {
  id: string;
  name: { ru: string; en: string };
  description?: AutoBattlerLoc;
  portraitKey: string;
  art?: import('./index').CardDefinition['art'];
  health: number;
  power: {
    id: AutoBattlerHeroPowerId | string;
    isPassive: boolean;
    goldCost: number;
    targeted: boolean;
    targetDomain: HeroPowerTargetDomain;
  };
};

export type AutoBattlerCatalog = {
  version: number;
  minions: AutoBattlerMinionDef[];
  heroes: AutoBattlerHeroDef[];
  copy?: AutoBattlerCopy;
};

/** Shop copies by tavern tier when a definition omits poolCopies. */
export const DEFAULT_POOL_COPIES = [0, 16, 15, 13, 11, 9, 7] as const;

export { starterAutoBattlerMinions } from './autoBattlerMinions';
import { starterAutoBattlerMinions } from './autoBattlerMinions';

export const starterAutoBattlerHeroes: AutoBattlerHeroDef[] = [
  {
    id: 'ab-hero-captain', name: { ru: 'Капитан', en: 'Captain' }, portraitKey: 'ab-hero-captain',
    health: 40,
    power: { id: 'ab-power-heal', isPassive: false, goldCost: 1, targeted: false, targetDomain: 'none' },
  },
  {
    id: 'ab-hero-warden', name: { ru: 'Смотритель', en: 'Warden' }, portraitKey: 'ab-hero-warden',
    health: 40,
    power: { id: 'ab-power-buff-tavern', isPassive: false, goldCost: 1, targeted: true, targetDomain: 'tavern' },
  },
  {
    id: 'ab-hero-merchant', name: { ru: 'Купец', en: 'Merchant' }, portraitKey: 'ab-hero-merchant',
    health: 40,
    power: { id: 'ab-power-sell-gold', isPassive: true, goldCost: 0, targeted: false, targetDomain: 'none' },
  },
  {
    id: 'ab-hero-brute', name: { ru: 'Зверь', en: 'Brute' }, portraitKey: 'ab-hero-brute',
    health: 40,
    power: { id: 'ab-power-buff-board', isPassive: false, goldCost: 1, targeted: true, targetDomain: 'board' },
  },
  { id: 'ab-hero-innkeeper', name: { ru: 'Трактирщик', en: 'Innkeeper' }, portraitKey: 'ab-hero-innkeeper', health: 40, power: { id: 'ab-power-free-roll', isPassive: true, goldCost: 0, targeted: false, targetDomain: 'none' } },
  { id: 'ab-hero-gambler', name: { ru: 'Картёжник', en: 'Gambler' }, portraitKey: 'ab-hero-gambler', health: 35, power: { id: 'ab-power-discover', isPassive: false, goldCost: 2, targeted: false, targetDomain: 'none' } },
  { id: 'ab-hero-beastmaster', name: { ru: 'Зверолов', en: 'Beastmaster' }, portraitKey: 'ab-hero-beastmaster', health: 40, power: { id: 'ab-power-beast-buy', isPassive: true, goldCost: 0, targeted: false, targetDomain: 'none' } },
  { id: 'ab-hero-tinker', name: { ru: 'Механик', en: 'Tinker' }, portraitKey: 'ab-hero-tinker', health: 40, power: { id: 'ab-power-shield', isPassive: false, goldCost: 1, targeted: true, targetDomain: 'board' } },
  { id: 'ab-hero-necromancer', name: { ru: 'Некромант', en: 'Necromancer' }, portraitKey: 'ab-hero-necromancer', health: 38, power: { id: 'ab-power-undead-end', isPassive: true, goldCost: 0, targeted: false, targetDomain: 'none' } },
  { id: 'ab-hero-tycoon', name: { ru: 'Магнат', en: 'Tycoon' }, portraitKey: 'ab-hero-tycoon', health: 35, power: { id: 'ab-power-rich', isPassive: true, goldCost: 0, targeted: false, targetDomain: 'none' } },
  { id: 'ab-hero-collector', name: { ru: 'Собиратель', en: 'Collector' }, portraitKey: 'ab-hero-collector', health: 40, power: { id: 'ab-power-triple-buff', isPassive: true, goldCost: 0, targeted: false, targetDomain: 'none' } },
  { id: 'ab-hero-alchemist', name: { ru: 'Алхимик', en: 'Alchemist' }, portraitKey: 'ab-hero-alchemist', health: 40, power: { id: 'ab-power-swap', isPassive: false, goldCost: 1, targeted: true, targetDomain: 'board' } },
];

export const starterAutoBattlerCatalog: AutoBattlerCatalog = {
  version: 1,
  minions: starterAutoBattlerMinions,
  heroes: starterAutoBattlerHeroes,
};

const idOk = (id: unknown) => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,59}$/.test(id);
const locOk = (value: unknown, max: number) => {
  if (!value || typeof value !== 'object') return false;
  const loc = value as AutoBattlerLoc;
  return typeof loc.ru === 'string' && loc.ru.length <= max && typeof loc.en === 'string' && loc.en.length <= max;
};

function copyEntryOk(value: unknown): value is AutoBattlerCopyEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as AutoBattlerCopyEntry;
  if (!locOk(entry.name, 100) || !entry.name.ru.trim()) return false;
  if (entry.description !== undefined && !locOk(entry.description, 500)) return false;
  return true;
}

export function validateAutoBattlerCopy(value: unknown): value is AutoBattlerCopy {
  if (!value || typeof value !== 'object') return false;
  const copy = value as AutoBattlerCopy;
  const bag = (items: Record<string, AutoBattlerCopyEntry> | undefined, allowed?: readonly string[]) => {
    if (!items) return true;
    if (typeof items !== 'object' || Array.isArray(items)) return false;
    return Object.entries(items).every(([id, entry]) => (allowed ? (allowed as readonly string[]).includes(id) : typeof id === 'string' && id.length <= 60) && copyEntryOk(entry));
  };
  return bag(copy.keywords as Record<string, AutoBattlerCopyEntry> | undefined, autoBattlerKeywords)
    && bag(copy.tribes as Record<string, AutoBattlerCopyEntry> | undefined, autoBattlerTribes)
    && bag(copy.powers as Record<string, AutoBattlerCopyEntry> | undefined, Object.keys(autoBattlerHeroPowerPresets))
    && bag(copy.battlecries as Record<string, AutoBattlerCopyEntry> | undefined, autoBattlerBattlecries)
    && bag(copy.auras as Record<string, AutoBattlerCopyEntry> | undefined, autoBattlerAuras);
}

export function validateAutoBattlerEffect(value: unknown): value is AutoBattlerEffect {
  if (!value || typeof value !== 'object') return false;
  const e = value as AutoBattlerEffect;
  if (!autoBattlerEffectTriggers.includes(e.trigger)) return false;
  if (e.target !== undefined && !autoBattlerEffectTargets.includes(e.target)) return false;
  const tribeOk = (tribe: unknown) => tribe === undefined || tribe === 'all' || autoBattlerTribes.includes(tribe as AutoBattlerTribe);
  if (!tribeOk(e.tribe) || !tribeOk(e.onTribe) || !tribeOk(e.perTribe)) return false;
  const keywordOk = (k: unknown) => k === undefined || autoBattlerKeywords.includes(k as AutoBattlerKeyword);
  if (!keywordOk(e.onKeyword) || !keywordOk(e.perKeyword)) return false;
  if (e.per !== undefined && !autoBattlerEffectScales.includes(e.per)) return false;
  const a = e.action;
  if (!a || typeof a !== 'object') return false;
  const num = (n: unknown, min: number, max: number) => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
  if (a.kind === 'buff') return num(a.attack, -20, 20) && num(a.health, -20, 20);
  if (a.kind === 'gold') return num(a.amount, 1, 10);
  if (a.kind === 'aura') return e.trigger === 'aura' && num(a.attack, 1, 10);
  if (a.kind === 'keyword') return autoBattlerKeywords.includes(a.keyword);
  if (a.kind === 'summon') return idOk(a.summonId) && num(a.count, 1, 7);
  return false;
}

export function validateAutoBattlerMinion(value: unknown): value is AutoBattlerMinionDef {
  if (!value || typeof value !== 'object') return false;
  const m = value as AutoBattlerMinionDef;
  if (!idOk(m.id) || !m.name || typeof m.name.ru !== 'string' || !m.name.ru.trim() || m.name.ru.length > 100) return false;
  if (typeof m.name.en !== 'string' || m.name.en.length > 100) return false;
  if (m.description && !locOk(m.description, 500)) return false;
  if (![1, 2, 3, 4, 5, 6].includes(m.tavernTier)) return false;
  if (!Number.isInteger(m.attack) || m.attack < 0 || m.attack > 99) return false;
  if (!Number.isInteger(m.health) || m.health < 1 || m.health > 99) return false;
  if (!Array.isArray(m.keywords) || m.keywords.length > 8 || new Set(m.keywords).size !== m.keywords.length
    || m.keywords.some(k => !autoBattlerKeywords.includes(k))) return false;
  if (m.tribes && (!Array.isArray(m.tribes) || m.tribes.length > 3 || m.tribes.some(t => !autoBattlerTribes.includes(t)))) return false;
  if (m.poolCopies !== undefined && (!Number.isInteger(m.poolCopies) || m.poolCopies < 1 || m.poolCopies > 30)) return false;
  if (m.token !== undefined && typeof m.token !== 'boolean') return false;
  if (m.generated !== undefined && typeof m.generated !== 'boolean') return false;
  if (m.inTavern !== undefined && typeof m.inTavern !== 'boolean') return false;
  if (m.inDiscover !== undefined && typeof m.inDiscover !== 'boolean') return false;
  if (m.battlecryId !== undefined && !idOk(m.battlecryId)) return false;
  if (m.auraId !== undefined && !idOk(m.auraId)) return false;
  if (m.effects !== undefined && (!Array.isArray(m.effects) || m.effects.length > 6 || !m.effects.every(validateAutoBattlerEffect))) return false;
  if (m.spell !== undefined && (!m.spell || typeof m.spell !== 'object' || !autoBattlerSpellKinds.includes(m.spell.kind) || (m.spell.amount !== undefined && (!Number.isInteger(m.spell.amount) || m.spell.amount < 1 || m.spell.amount > 10)))) return false;
  if (m.deathrattle) {
    if (!idOk(m.deathrattle.summonId) || !Number.isInteger(m.deathrattle.count) || m.deathrattle.count < 1 || m.deathrattle.count > 7) return false;
  } else if (m.deathrattle !== undefined) return false;
  if (m.golden) {
    if (!Number.isInteger(m.golden.attack) || m.golden.attack < 0 || m.golden.attack > 99) return false;
    if (!Number.isInteger(m.golden.health) || m.golden.health < 1 || m.golden.health > 99) return false;
    if (m.golden.keywords && (!Array.isArray(m.golden.keywords) || m.golden.keywords.some(k => !autoBattlerKeywords.includes(k)))) return false;
  }
  if (m.art !== undefined && !validateCard({ ...starterCards[0], id: m.id, name: { ru: m.name.ru }, health: m.health, art: m.art })) return false;
  return true;
}

export function publishedAutoBattlerMinions(list?: AutoBattlerMinionDef[]): AutoBattlerMinionDef[] {
  return list?.length ? list : starterAutoBattlerMinions;
}

export function publishedAutoBattlerHeroes(list?: AutoBattlerHeroDef[]): AutoBattlerHeroDef[] {
  return list?.length ? list : starterAutoBattlerHeroes;
}

export function validateAutoBattlerHero(value: unknown): value is AutoBattlerHeroDef {
  if (!value || typeof value !== 'object') return false;
  const h = value as AutoBattlerHeroDef;
  if (!idOk(h.id) || !idOk(h.portraitKey)) return false;
  if (!h.name || typeof h.name.ru !== 'string' || !h.name.ru.trim() || h.name.ru.length > 100) return false;
  if (typeof h.name.en !== 'string' || h.name.en.length > 100) return false;
  if (h.description && !locOk(h.description, 500)) return false;
  if (!Number.isInteger(h.health) || h.health < 1 || h.health > 99) return false;
  const preset = autoBattlerHeroPowerPresets[h.power?.id as AutoBattlerHeroPowerId];
  if (!preset) return false;
  if (h.power.isPassive !== preset.isPassive || h.power.targeted !== preset.targeted || h.power.targetDomain !== preset.targetDomain) return false;
  if (!Number.isInteger(h.power.goldCost) || h.power.goldCost < 0 || h.power.goldCost > 10) return false;
  if (h.art !== undefined && !validateCard({ ...starterCards[0], id: h.id, name: { ru: h.name.ru }, health: h.health, art: h.art })) return false;
  return true;
}

/** Room catalog: persisted minions/heroes when present, else starters. 1v1 portraits still fill empty minion art. */
export function resolveAutoBattlerCatalog(input: {
  version: number;
  cards: { autoBattlerId?: string; art?: AutoBattlerMinionDef['art'] }[];
  autoBattlerMinions?: AutoBattlerMinionDef[];
  autoBattlerHeroes?: AutoBattlerHeroDef[];
  autoBattlerCopy?: AutoBattlerCopy;
}): AutoBattlerCatalog {
  const linked = new Map(input.cards.filter(c => c.autoBattlerId && c.art).map(c => [c.autoBattlerId!, c.art]));
  return {
    version: input.version,
    heroes: publishedAutoBattlerHeroes(input.autoBattlerHeroes),
    minions: publishedAutoBattlerMinions(input.autoBattlerMinions).map(m => ({
      ...m,
      art: m.art?.url ? m.art : linked.get(m.id) ?? m.art,
    })),
    copy: input.autoBattlerCopy,
  };
}

export function isSpellDef(def: Pick<AutoBattlerMinionDef, 'spell'> | undefined): boolean {
  return !!def?.spell;
}

export function minionDefById(catalog: AutoBattlerCatalog, id: string): AutoBattlerMinionDef | undefined {
  return catalog.minions.find(m => m.id === id);
}

export function heroDefById(catalog: AutoBattlerCatalog, id: string): AutoBattlerHeroDef | undefined {
  return catalog.heroes.find(h => h.id === id);
}

export function hasKeyword(keywords: Iterable<string>, keyword: string): boolean {
  for (const item of keywords) if (item === keyword) return true;
  return false;
}

export function minionTribes(def: Pick<AutoBattlerMinionDef, 'tribes'> | undefined): AutoBattlerTribe[] {
  return def?.tribes?.length ? def.tribes : ['neutral'];
}

export function hasTribe(tribes: Iterable<string>, tribe: AutoBattlerTribe | 'all'): boolean {
  if (tribe === 'all') return true;
  for (const item of tribes) if (item === tribe) return true;
  return false;
}

export function goldenStats(def: AutoBattlerMinionDef): { attack: number; health: number; keywords: AutoBattlerKeyword[] } {
  if (def.golden) {
    return {
      attack: def.golden.attack,
      health: def.golden.health,
      keywords: def.golden.keywords ?? def.keywords,
    };
  }
  return { attack: def.attack * 2, health: def.health * 2, keywords: def.keywords };
}

export function printedStats(def: AutoBattlerMinionDef, golden: boolean): { attack: number; health: number; keywords: AutoBattlerKeyword[] } {
  return golden ? goldenStats(def) : { attack: def.attack, health: def.health, keywords: def.keywords };
}
