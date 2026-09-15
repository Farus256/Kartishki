import {
  AUTO_BATTLER,
  hasTribe,
  minionTribes,
  type AutoBattlerEffect,
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

/** Anomaly-adjusted prices a room hands to every recruit action. */
export type TavernRules = { buyCost: number; rerollCost: number; goldCap: number; tavernBonus: number; firstBuyDiscount: number; combatBuff: number };
export const DEFAULT_RULES: TavernRules = { buyCost: AUTO_BATTLER.BUY_COST, rerollCost: AUTO_BATTLER.REROLL_COST, goldCap: AUTO_BATTLER.GOLD_CAP, tavernBonus: 0, firstBuyDiscount: 0, combatBuff: 0 };

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
function multiplier(effect: AutoBattlerEffect, board: Body[]): number {
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
  onDiscover?: () => void;
  /** Reports each permanent buff (owner → target) so the room can replay end-of-turn effects on the combat table. */
  onBuff?: (owner: AutoBattlerMinionState, target: AutoBattlerMinionState) => void;
};

function pickTargets(player: AutoBattlerPlayerState, owner: AutoBattlerMinionState, effect: AutoBattlerEffect, rng: SeededRng, subject?: AutoBattlerMinionState): AutoBattlerMinionState[] {
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
    const action = effect.action;
    const times = multiplier(effect, [...deps.player.board].filter(m => m.kind !== 'spell'));
    if (!times) continue;
    if (action.kind === 'gold') deps.player.gold += scale(action.amount, owner.golden) * times;
    else if (action.kind === 'buff') {
      for (const target of pickTargets(deps.player, owner, effect, deps.rng, subject)) { buffTavernMinion(target, scale(action.attack, owner.golden) * times, scale(action.health, owner.golden) * times); deps.onBuff?.(owner, target); }
    } else if (action.kind === 'keyword') {
      for (const target of pickTargets(deps.player, owner, effect, deps.rng, subject)) grantKeyword(target.keywords, action.keyword);
    } else if (action.kind === 'summon' && deps.nextId) {
      const token = deps.defFor(action.summonId);
      if (!token) continue;
      // ponytail: tokens go to the end of the board; a mid-board insert rewrites the list and stales every ref held by the caller.
      for (let n = 0; n < action.count * (owner.golden ? 2 : 1); n++) {
        if (deps.player.board.length >= AUTO_BATTLER.BOARD_LIMIT) break;
        deps.player.board.push(createMinionState(token, deps.nextId(), deps.player.sessionId));
      }
    }
  }
}

/** Every board minion reacts to a tavern event (buy/sell/play/endTurn/triple/reroll). */
export function runBoardEffects(deps: RecruitEffectDeps, trigger: AutoBattlerEffectTrigger, subject?: AutoBattlerMinionState): void {
  for (const minion of [...deps.player.board]) {
    if (minion.kind === 'spell') continue;
    runTavernEffects(deps, trigger, minion, subject);
  }
}

export type CombatTrigger = 'startCombat' | 'deathrattle' | 'friendlyDeath' | 'shieldPop' | 'friendlyAttack';

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
    const alive = board.filter(m => m.health > 0);
    const times = multiplier(effect, alive);
    if (!times) continue;
    if (effect.action.kind === 'summon') {
      const token = ctx.definition(effect.action.summonId);
      if (!token) continue;
      const at = board.findIndex(m => m.id === owner.id);
      ctx.currentSourceId = owner.id;
      for (let n = 0; n < effect.action.count * (owner.golden ? 2 : 1); n++) {
        ctx.summon(side as 0 | 1, (at < 0 ? board.length : at + 1) + n, {
          id: ctx.nextId(), cardId: token.id, baseId: token.id,
          attack: token.attack * (owner.golden ? 2 : 1), health: token.health * (owner.golden ? 2 : 1),
          tavernTier: token.tavernTier, keywords: [...token.keywords], tribes: [...minionTribes(token)], golden: owner.golden, owner: owner.owner, auraAttack: 0,
        });
      }
      continue;
    }
    if (effect.action.kind !== 'buff' && effect.action.kind !== 'keyword') continue;
    let targets: CombatMinion[] = [];
    switch (effect.target ?? 'self') {
      case 'self': targets = owner.health > 0 || trigger === 'startCombat' ? [owner] : []; break;
      case 'subject': case 'bought': targets = subject && subject.health > 0 ? [subject] : []; break;
      case 'adjacent': { const i = board.findIndex(m => m.id === owner.id); targets = [board[i - 1], board[i + 1]].filter((m): m is CombatMinion => !!m && m.health > 0); break; }
      case 'friendly': targets = alive.filter(m => m.id !== owner.id && tribeMatch(m.tribes, effect.tribe)); break;
      case 'random': { const pool = alive.filter(m => m.id !== owner.id && tribeMatch(m.tribes, effect.tribe)); targets = pool.length ? [ctx.rng.pick(pool)] : []; break; }
      default: targets = [];
    }
    if (effect.action.kind === 'keyword') {
      for (const target of targets) if (grantKeyword(target.keywords, effect.action.keyword)) ctx.emit({ kind: 'STATS', sourceId: owner.id, targetId: target.id, attack: target.attack + target.auraAttack, remainingHealth: target.health, keywords: [...target.keywords] });
      continue;
    }
    const attack = scale(effect.action.attack, owner.golden) * times, health = scale(effect.action.health, owner.golden) * times;
    for (const target of targets) {
      target.attack = Math.max(0, target.attack + attack);
      target.health = Math.max(1, target.health + health);
      ctx.emit({ kind: 'STATS', sourceId: owner.id, targetId: target.id, attack: target.attack + target.auraAttack, remainingHealth: target.health });
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
