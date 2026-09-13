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
  RECRUIT_MS: 40_000,
  HERO_SELECT_MS: 20_000,
  RECONNECT_GRACE_SECONDS: 45,
  MAX_COMBAT_ACTIONS: 512,
  MAX_COMBAT_MS: 90_000,
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

export const autoBattlerTribes = ['beast', 'mech', 'pirate', 'undead', 'neutral'] as const;
export type AutoBattlerTribe = typeof autoBattlerTribes[number];
export const autoBattlerBattlecries = ['ab-bc-gold'] as const;
export const autoBattlerAuras = ['ab-aura-beasts'] as const;

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
  /** Custom golden stats. When omitted, attack/health double. */
  golden?: { attack: number; health: number; keywords?: AutoBattlerKeyword[] };
};

export const autoBattlerHeroPowerPresets = {
  'ab-power-heal': { isPassive: false, goldCost: 1, targeted: false, targetDomain: 'none' as const },
  'ab-power-buff-tavern': { isPassive: false, goldCost: 1, targeted: true, targetDomain: 'tavern' as const },
  'ab-power-buff-board': { isPassive: false, goldCost: 2, targeted: true, targetDomain: 'board' as const },
  'ab-power-sell-gold': { isPassive: true, goldCost: 0, targeted: false, targetDomain: 'none' as const },
} as const;
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

export const starterAutoBattlerMinions: AutoBattlerMinionDef[] = [
  { id: 'ab-token-1-1', name: { ru: 'Жетон', en: 'Token' }, tavernTier: 1, attack: 1, health: 1, keywords: [], tribes: ['neutral'], token: true, inTavern: false, inDiscover: false },
  { id: 'ab-whelp', name: { ru: 'Змееныш', en: 'Whelp' }, tavernTier: 1, attack: 2, health: 1, keywords: [], tribes: ['beast'] },
  { id: 'ab-ward', name: { ru: 'Страж', en: 'Ward' }, tavernTier: 1, attack: 1, health: 3, keywords: ['taunt'], tribes: ['mech'] },
  { id: 'ab-aegis', name: { ru: 'Эгида', en: 'Aegis' }, tavernTier: 1, attack: 2, health: 2, keywords: ['divineShield'], tribes: ['mech'] },
  { id: 'ab-broker', name: { ru: 'Маклер', en: 'Broker' }, tavernTier: 1, attack: 1, health: 2, keywords: ['battlecry'], tribes: ['pirate'], battlecryId: 'ab-bc-gold' },
  { id: 'ab-viper', name: { ru: 'Гадюка', en: 'Viper' }, tavernTier: 2, attack: 1, health: 2, keywords: ['poisonous'], tribes: ['beast'] },
  { id: 'ab-breeder', name: { ru: 'Заводчик', en: 'Breeder' }, tavernTier: 2, attack: 2, health: 2, keywords: ['deathrattle'], tribes: ['beast'], deathrattle: { summonId: 'ab-token-1-1', count: 1 } },
  { id: 'ab-bruiser', name: { ru: 'Громила', en: 'Bruiser' }, tavernTier: 2, attack: 3, health: 3, keywords: [], tribes: ['neutral'] },
  { id: 'ab-alpha', name: { ru: 'Вожак', en: 'Alpha' }, tavernTier: 2, attack: 2, health: 3, keywords: [], tribes: ['beast'], auraId: 'ab-aura-beasts' },
  { id: 'ab-bulwark', name: { ru: 'Бастион', en: 'Bulwark' }, tavernTier: 3, attack: 2, health: 5, keywords: ['taunt'], tribes: ['mech'] },
  { id: 'ab-fang', name: { ru: 'Клык', en: 'Fang' }, tavernTier: 3, attack: 3, health: 2, keywords: ['poisonous'], tribes: ['beast'] },
  { id: 'ab-dervish', name: { ru: 'Дервиш', en: 'Dervish' }, tavernTier: 3, attack: 2, health: 2, keywords: ['windfury'], tribes: ['pirate'] },
  { id: 'ab-knight', name: { ru: 'Рыцарь', en: 'Knight' }, tavernTier: 4, attack: 4, health: 4, keywords: ['divineShield'], tribes: ['mech'] },
  { id: 'ab-howler', name: { ru: 'Ревун', en: 'Howler' }, tavernTier: 4, attack: 3, health: 6, keywords: ['taunt'], tribes: ['beast'] },
  { id: 'ab-butcher', name: { ru: 'Мясник', en: 'Butcher' }, tavernTier: 4, attack: 3, health: 3, keywords: ['cleave'], tribes: ['undead'] },
  { id: 'ab-hydra', name: { ru: 'Гидра', en: 'Hydra' }, tavernTier: 5, attack: 2, health: 8, keywords: ['deathrattle'], tribes: ['beast'], deathrattle: { summonId: 'ab-token-1-1', count: 2 } },
  { id: 'ab-assassin', name: { ru: 'Убийца', en: 'Assassin' }, tavernTier: 5, attack: 6, health: 3, keywords: ['poisonous'], tribes: ['pirate'] },
  { id: 'ab-ashes', name: { ru: 'Пепел', en: 'Ashes' }, tavernTier: 5, attack: 4, health: 2, keywords: ['reborn'], tribes: ['undead'] },
  { id: 'ab-colossus', name: { ru: 'Колосс', en: 'Colossus' }, tavernTier: 6, attack: 8, health: 8, keywords: [], tribes: ['mech'] },
  { id: 'ab-omen', name: { ru: 'Знамение', en: 'Omen' }, tavernTier: 6, attack: 6, health: 7, keywords: ['taunt', 'divineShield'], tribes: ['undead'] },
];

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
    power: { id: 'ab-power-buff-board', isPassive: false, goldCost: 2, targeted: true, targetDomain: 'board' },
  },
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
