import {
  AUTO_BATTLER,
  effectParts,
  hasTribe,
  minionTribes,
  type AutoBattlerEffect,
  type AutoBattlerEffectStep,
  type AutoBattlerEffectTrigger,
  type AutoBattlerKeyword,
  type AutoBattlerMinionDef,
  type AutoBattlerMinionState,
  type AutoBattlerPlayerState,
  type AutoBattlerTribe,
} from '@kartishki/shared';
import type { SeededRng } from './rng';
import type { CombatContext, CombatMinion } from './combatTypes';
import { createMinionState } from './instantiate';

/** Anomaly-adjusted rules a room hands to every recruit action (see AB_ANOMALIES for what each twist sets). */
export type TavernRules = {
  buyCost: number; rerollCost: number; goldCap: number; tavernBonus: number; firstBuyDiscount: number; sellReward: number; upgradeDiscount: number; damageCap: boolean;
  /** Keyword every minion carries into combat (plated / second wind). */
  combatKeyword?: AutoBattlerKeyword;
  /** Copies that merge into a golden (3, or 2 in a golden age). */
  tripleSize: number;
  /** Extra tavern slots that only ever hold spells, and the discount on every spell. */
  spellSlots: number; spellDiscount: number;
  /** +N/+N to every minion in hand at the end of each turn. */
  handGrowth: number;
  /** How many times end-of-turn effects fire, and how many extra times a Battlecry fires. */
  endTurnTimes: number; battlecryEcho: number;
  /** Wheel of fate: every recruit turn opens with a spin for one of AB_WHEEL_BONUSES. */
  wheel: boolean;
};
export const DEFAULT_RULES: TavernRules = { buyCost: AUTO_BATTLER.BUY_COST, rerollCost: AUTO_BATTLER.REROLL_COST, goldCap: AUTO_BATTLER.GOLD_CAP, tavernBonus: 0, firstBuyDiscount: 0, sellReward: AUTO_BATTLER.SELL_REWARD, upgradeDiscount: 0, damageCap: AUTO_BATTLER.DAMAGE_CAP_ENABLED, tripleSize: 3, spellSlots: 0, spellDiscount: 0, handGrowth: 0, endTurnTimes: 1, battlecryEcho: 0, wheel: false };

const tribeMatch = (tribes: Iterable<string>, tribe: AutoBattlerTribe | 'all' | undefined) => tribe === undefined || tribe === 'all' || hasTribe(tribes, tribe);

/** Golden owners double their numbers. */
const scale = (n: number, golden: boolean) => n * (golden ? 2 : 1);

type Body = { id: string; keywords: readonly string[] | string[]; tribes: Iterable<string> };

/** The subject filters (onTribe/onKeyword) gate triggers that name another minion. */
function subjectOk(effect: AutoBattlerEffect, subject: Body | undefined): boolean {
  if (!effect.onTribe && !effect.onKeyword) return true;
  if (!subject) return false;
  if (effect.onTribe && !tribeMatch(subject.tribes, effect.onTribe)) return false;
  if (effect.onKeyword && !subject.keywords.includes(effect.onKeyword)) return false;
  return true;
}

/** Menagerie / count scaling: how many times the buff applies. */
function multiplier(effect: AutoBattlerEffectStep, board: Body[]): number {
  if (!effect.per) return 1;
  if (effect.per === 'tribes') {
    const tribes = new Set<string>();
    for (const m of board) for (const tribe of m.tribes) if (tribe !== 'neutral') tribes.add(tribe);
    return tribes.size;
  }
  return board.filter(m => tribeMatch(m.tribes, effect.perTribe) && (!effect.perKeyword || m.keywords.includes(effect.perKeyword))).length;
}

function grantKeyword(keywords: string[] | { includes(k: string): boolean; push(k: string): number }, keyword: AutoBattlerKeyword): boolean {
  if (keywords.includes(keyword)) return false;
  keywords.push(keyword);
  return true;
}

/** Extra times a Battlecry / Deathrattle fires thanks to echo minions on the board (a golden echo counts twice); `self` is left out. */
export function echoCount(board: Iterable<{ id: string; baseId: string; golden: boolean; health?: number }>, self: string, what: 'battlecry' | 'deathrattle', defFor: (baseId: string) => AutoBattlerMinionDef | undefined): number {
  let n = 0;
  for (const m of board) {
    if (m.id === self || (m.health !== undefined && m.health <= 0)) continue;
    for (const e of defFor(m.baseId)?.effects ?? []) if (e.trigger === 'aura' && e.action.kind === 'echo' && e.action.echo === what) n += m.golden ? 2 : 1;
  }
  return n;
}

/** Permanent tavern buff: stats and the bonus ledger that survives triples. */
export function buffTavernMinion(minion: AutoBattlerMinionState, attack: number, health: number): void {
  minion.attack = Math.max(0, minion.attack + attack);
  minion.bonusAttack += attack;
  minion.health = Math.max(1, minion.health + health);
  minion.maxHealth = Math.max(1, minion.maxHealth + health);
  minion.bonusHealth += health;
}

export type RecruitEffectDeps = {
  player: AutoBattlerPlayerState;
  rng: SeededRng;
  defFor: (baseId: string) => AutoBattlerMinionDef | undefined;
  rules: TavernRules;
  /** Ids for tokens summoned onto the tavern board. */
  nextId?: () => string;
  /** Eaten tavern offers go back to the bag (a devour without a pool just removes them). */
  pool?: { returnCopy(baseId: string): void };
  onDiscover?: () => void;
  /** Reports each permanent buff (owner → target) so the room can replay end-of-turn effects on the combat table. */
  onBuff?: (owner: AutoBattlerMinionState, target: AutoBattlerMinionState) => void;
  /** Scenario trace: one line per executed step (the editor's step-through preview reads it). */
  trace?: (line: EffectTraceLine) => void;
};

export type EffectTraceLine = { owner: string; trigger: AutoBattlerEffectTrigger; step: number; action: AutoBattlerEffectStep['action']; times: number; targets: string[] };

function pickTargets(player: AutoBattlerPlayerState, owner: AutoBattlerMinionState, effect: AutoBattlerEffectStep, rng: SeededRng, subject?: AutoBattlerMinionState): AutoBattlerMinionState[] {
  const board = [...player.board].filter(m => m.kind !== 'spell');
  switch (effect.target ?? 'self') {
    case 'self': return [owner];
    case 'bought': case 'subject': return subject ? [subject] : [];
    case 'adjacent': {
      const i = board.findIndex(m => m.id === owner.id);
      if (i < 0) return [];
      return [board[i - 1], board[i + 1]].filter((m): m is AutoBattlerMinionState => !!m);
    }
    case 'friendly': return board.filter(m => m.id !== owner.id && tribeMatch(m.tribes, effect.tribe));
    case 'hand': return [...player.hand].filter(m => m.kind !== 'spell' && tribeMatch(m.tribes, effect.tribe));
    case 'tavern': return [...player.tavern.offers].filter(m => m.kind !== 'spell' && tribeMatch(m.tribes, effect.tribe));
    case 'random': {
      const pool = board.filter(m => m.id !== owner.id && tribeMatch(m.tribes, effect.tribe));
      return pool.length ? [rng.pick(pool)] : [];
    }
  }
}

/** A guard on the board (Tier 2 demon ward) takes the blood price so the hero does not. */
export function heroGuarded(deps: Pick<RecruitEffectDeps, 'player' | 'defFor'>): boolean {
  return [...deps.player.board].some(m => m.kind !== 'spell' && (deps.defFor(m.baseId)?.effects ?? []).some(e => e.trigger === 'aura' && e.action.kind === 'guard'));
}

/** Chains like "devour → devour" or "selfDamage → selfDamage" stop here instead of eating the whole tavern in one click. */
let nesting = 0;
const nested = (fn: () => void) => { if (nesting >= 6) return; nesting++; try { fn(); } finally { nesting--; } };

/** Blood price: the hero pays unless guarded (never below 1 Health); the board's selfDamage effects fire either way. */
export function payBlood(deps: RecruitEffectDeps, amount: number, source?: AutoBattlerMinionState): void {
  if (!heroGuarded(deps)) deps.player.hero.health = Math.max(1, deps.player.hero.health - amount);
  nested(() => runBoardEffects(deps, 'selfDamage', source));
}

/** `eater` swallows up to `count` random tavern minions and grows by their stats; the board reacts to every meal. */
export function devourTavern(deps: RecruitEffectDeps, eater: AutoBattlerMinionState, count: number): number {
  let meals = 0;
  for (let n = 0; n < count; n++) {
    const food = [...deps.player.tavern.offers].filter(m => m.kind !== 'spell');
    if (!food.length) break;
    const meal = deps.rng.pick(food);
    const at = [...deps.player.tavern.offers].findIndex(m => m.id === meal.id);
    deps.player.tavern.offers.splice(at, 1);
    for (let k = 0; k < meal.poolCopies; k++) deps.pool?.returnCopy(meal.baseId);
    buffTavernMinion(eater, meal.attack, meal.health);
    deps.onBuff?.(eater, eater);
    meals++;
    nested(() => runBoardEffects(deps, 'devour', eater));
  }
  return meals;
}

/**
 * Fire every matching tavern-phase effect of `owner`. `subject` is the minion that caused the
 * trigger (the card played/bought/sold) for onTribe filters and 'bought' targets.
 */
export function runTavernEffects(deps: RecruitEffectDeps, trigger: AutoBattlerEffectTrigger, owner: AutoBattlerMinionState, subject?: AutoBattlerMinionState): void {
  const def = deps.defFor(owner.baseId);
  if (!def?.effects) return;
  for (const effect of def.effects) {
    if (effect.trigger !== trigger) continue;
    if (!subjectOk(effect, subject)) continue;
    // A scenario runs its steps in order; each step scales and targets on its own, on the board as the previous step left it.
    effectParts(effect).forEach((part, step) => {
      const action = part.action;
      const times = multiplier(part, [...deps.player.board].filter(m => m.kind !== 'spell'));
      if (!times) return;
      const hit: string[] = [];
      if (action.kind === 'gold') {
        // End-of-turn gold lands next turn: beginRecruitTurn resets gold to the turn's income before paying the bank out.
        if (trigger === 'endTurn') deps.player.bankedGold += scale(action.amount, owner.golden) * times;
        else deps.player.gold += scale(action.amount, owner.golden) * times;
      } else if (action.kind === 'buff') {
        for (const target of pickTargets(deps.player, owner, part, deps.rng, subject)) { buffTavernMinion(target, scale(action.attack, owner.golden) * times, scale(action.health, owner.golden) * times); deps.onBuff?.(owner, target); hit.push(target.id); }
      } else if (action.kind === 'keyword') {
        for (const target of pickTargets(deps.player, owner, part, deps.rng, subject)) if (grantKeyword(target.keywords, action.keyword)) hit.push(target.id);
      } else if (action.kind === 'summon' && deps.nextId) {
        const token = deps.defFor(action.summonId);
        if (!token) return;
        // ponytail: tokens go to the end of the board; a mid-board insert rewrites the list and stales every ref held by the caller.
        for (let n = 0; n < action.count * (owner.golden ? 2 : 1); n++) {
          if (deps.player.board.length >= AUTO_BATTLER.BOARD_LIMIT) break;
          const born = createMinionState(token, deps.nextId(), deps.player.sessionId);
          deps.player.board.push(born);
          hit.push(born.id);
        }
      } else if (action.kind === 'selfDamage') {
        payBlood(deps, action.amount * times, owner);
        hit.push(deps.player.sessionId);
      } else if (action.kind === 'devour') {
        // The eater is the target (self by default; 'friendly' + tribe lets a Gargoyle feed every demon).
        for (const target of pickTargets(deps.player, owner, part, deps.rng, subject)) if (devourTavern(deps, target, scale(action.count, owner.golden) * times)) hit.push(target.id);
      }
      deps.trace?.({ owner: owner.id, trigger, step, action, times, targets: hit });
    });
  }
}

/** Every board minion reacts to a tavern event (buy/sell/play/endTurn/triple/reroll). */
export function runBoardEffects(deps: RecruitEffectDeps, trigger: AutoBattlerEffectTrigger, subject?: AutoBattlerMinionState): void {
  for (const minion of [...deps.player.board]) {
    if (minion.kind === 'spell') continue;
    runTavernEffects(deps, trigger, minion, subject);
  }
}

export type CombatTrigger = 'startCombat' | 'deathrattle' | 'friendlyDeath' | 'shieldPop' | 'friendlyAttack' | 'friendlySummon';

/** Combat-time effects (start of combat, deathrattle, avenge-likes) on the owner's side. Not permanent. */
export function runCombatEffects(ctx: CombatContext, trigger: CombatTrigger, owner: CombatMinion, subject?: CombatMinion): void {
  const def = ctx.definition(owner.baseId);
  if (!def?.effects) return;
  const side = ctx.sideOf(owner.owner);
  if (side < 0) return;
  const board = ctx.boards[side as 0 | 1];
  for (const effect of def.effects) {
    if (effect.trigger !== trigger) continue;
    if (!subjectOk(effect, subject)) continue;
    for (const part of effectParts(effect)) {
      const alive = board.filter(m => m.health > 0);
      const times = multiplier(part, alive);
      if (!times) continue;
      if (part.action.kind === 'summon') {
        const token = ctx.definition(part.action.summonId);
        if (!token) continue;
        const at = board.findIndex(m => m.id === owner.id);
        ctx.currentSourceId = owner.id;
        for (let n = 0; n < part.action.count * (owner.golden ? 2 : 1); n++) {
          ctx.summon(side as 0 | 1, (at < 0 ? board.length : at + 1) + n, {
            id: ctx.nextId(), cardId: token.id, baseId: token.id,
            attack: token.attack * (owner.golden ? 2 : 1), health: token.health * (owner.golden ? 2 : 1),
            tavernTier: token.tavernTier, keywords: [...token.keywords], tribes: [...minionTribes(token)], golden: owner.golden, owner: owner.owner, auraAttack: 0,
          });
        }
        continue;
      }
      if (part.action.kind !== 'buff' && part.action.kind !== 'keyword') continue;
      let targets: CombatMinion[] = [];
      switch (part.target ?? 'self') {
        case 'self': targets = owner.health > 0 || trigger === 'startCombat' ? [owner] : []; break;
        case 'subject': case 'bought': targets = subject && subject.health > 0 ? [subject] : []; break;
        case 'adjacent': { const i = board.findIndex(m => m.id === owner.id); targets = [board[i - 1], board[i + 1]].filter((m): m is CombatMinion => !!m && m.health > 0); break; }
        case 'friendly': targets = alive.filter(m => m.id !== owner.id && tribeMatch(m.tribes, part.tribe)); break;
        case 'random': { const pool = alive.filter(m => m.id !== owner.id && tribeMatch(m.tribes, part.tribe)); targets = pool.length ? [ctx.rng.pick(pool)] : []; break; }
        default: targets = [];
      }
      if (part.action.kind === 'keyword') {
        for (const target of targets) if (grantKeyword(target.keywords, part.action.keyword)) ctx.emit({ kind: 'STATS', sourceId: owner.id, targetId: target.id, attack: target.attack + target.auraAttack, remainingHealth: target.health, keywords: [...target.keywords] });
        continue;
      }
      const attack = scale(part.action.attack, owner.golden) * times, health = scale(part.action.health, owner.golden) * times;
      for (const target of targets) {
        target.attack = Math.max(0, target.attack + attack);
        target.health = Math.max(1, target.health + health);
        ctx.emit({ kind: 'STATS', sourceId: owner.id, targetId: target.id, attack: target.attack + target.auraAttack, remainingHealth: target.health });
      }
    }
  }
}

/** Every living minion on `side` reacts to a combat event about `subject` (a death, a shield pop, an attack). */
export function runSideEffects(ctx: CombatContext, trigger: CombatTrigger, side: 0 | 1, subject: CombatMinion): void {
  for (const minion of [...ctx.boards[side]]) {
    if (minion.health <= 0 || minion.id === subject.id) continue;
    runCombatEffects(ctx, trigger, minion, subject);
  }
}

/** Attack auras from effect descriptors: other friendly minions of the tribe. */
export function auraBonus(ctx: CombatContext, board: CombatMinion[], minion: CombatMinion): number {
  let bonus = 0;
  for (const source of board) {
    if (source.health <= 0 || source.id === minion.id) continue;
    const def = ctx.definition(source.baseId);
    for (const effect of def?.effects ?? []) {
      if (effect.trigger !== 'aura' || effect.action.kind !== 'aura') continue;
      if (tribeMatch(minion.tribes, effect.tribe)) bonus += scale(effect.action.attack, source.golden);
    }
  }
  return bonus;
}
