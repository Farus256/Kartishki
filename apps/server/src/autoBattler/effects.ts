import {
  AUTO_BATTLER,
  hasTribe,
  type AutoBattlerEffect,
  type AutoBattlerEffectTrigger,
  type AutoBattlerMinionDef,
  type AutoBattlerMinionState,
  type AutoBattlerPlayerState,
  type AutoBattlerTribe,
} from '@kartishki/shared';
import type { SeededRng } from './rng';
import type { CombatContext, CombatMinion } from './combatTypes';

/** Anomaly-adjusted prices a room hands to every recruit action. */
export type TavernRules = { buyCost: number; rerollCost: number; goldCap: number; tavernBonus: number; firstBuyDiscount: number; combatBuff: number };
export const DEFAULT_RULES: TavernRules = { buyCost: AUTO_BATTLER.BUY_COST, rerollCost: AUTO_BATTLER.REROLL_COST, goldCap: AUTO_BATTLER.GOLD_CAP, tavernBonus: 0, firstBuyDiscount: 0, combatBuff: 0 };

const tribeMatch = (tribes: Iterable<string>, tribe: AutoBattlerTribe | 'all' | undefined) => tribe === undefined || tribe === 'all' || hasTribe(tribes, tribe);

/** Golden owners double their numbers. */
const scale = (n: number, golden: boolean) => n * (golden ? 2 : 1);

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
  onDiscover?: () => void;
};

function pickTargets(player: AutoBattlerPlayerState, owner: AutoBattlerMinionState, effect: AutoBattlerEffect, rng: SeededRng, bought?: AutoBattlerMinionState): AutoBattlerMinionState[] {
  const board = [...player.board].filter(m => m.kind !== 'spell');
  switch (effect.target ?? 'self') {
    case 'self': return [owner];
    case 'bought': return bought ? [bought] : [];
    case 'adjacent': {
      const i = board.findIndex(m => m.id === owner.id);
      if (i < 0) return [];
      return [board[i - 1], board[i + 1]].filter((m): m is AutoBattlerMinionState => !!m);
    }
    case 'friendly': return board.filter(m => m.id !== owner.id && tribeMatch(m.tribes, effect.tribe));
    case 'hand': return [...player.hand].filter(m => m.kind !== 'spell' && tribeMatch(m.tribes, effect.tribe));
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
    if (effect.onTribe && (!subject || !tribeMatch(subject.tribes, effect.onTribe))) continue;
    const action = effect.action;
    if (action.kind === 'gold') deps.player.gold += scale(action.amount, owner.golden);
    else if (action.kind === 'buff') {
      for (const target of pickTargets(deps.player, owner, effect, deps.rng, subject)) buffTavernMinion(target, scale(action.attack, owner.golden), scale(action.health, owner.golden));
    }
  }
}

/** Every board minion reacts to a tavern event (buy/sell/play/endTurn/triple). */
export function runBoardEffects(deps: RecruitEffectDeps, trigger: AutoBattlerEffectTrigger, subject?: AutoBattlerMinionState): void {
  for (const minion of [...deps.player.board]) {
    if (minion.kind === 'spell') continue;
    runTavernEffects(deps, trigger, minion, subject);
  }
}

/** Combat-time buffs (start of combat, deathrattle) on the owner's side. Not permanent. */
export function runCombatEffects(ctx: CombatContext, trigger: 'startCombat' | 'deathrattle', owner: CombatMinion): void {
  const def = ctx.definition(owner.baseId);
  if (!def?.effects) return;
  const side = ctx.sideOf(owner.owner);
  if (side < 0) return;
  const board = ctx.boards[side as 0 | 1];
  for (const effect of def.effects) {
    if (effect.trigger !== trigger || effect.action.kind !== 'buff') continue;
    const attack = scale(effect.action.attack, owner.golden), health = scale(effect.action.health, owner.golden);
    const alive = board.filter(m => m.health > 0);
    let targets: CombatMinion[] = [];
    switch (effect.target ?? 'self') {
      case 'self': targets = owner.health > 0 || trigger === 'startCombat' ? [owner] : []; break;
      case 'adjacent': { const i = board.findIndex(m => m.id === owner.id); targets = [board[i - 1], board[i + 1]].filter((m): m is CombatMinion => !!m && m.health > 0); break; }
      case 'friendly': targets = alive.filter(m => m.id !== owner.id && tribeMatch(m.tribes, effect.tribe)); break;
      case 'random': { const pool = alive.filter(m => m.id !== owner.id && tribeMatch(m.tribes, effect.tribe)); targets = pool.length ? [ctx.rng.pick(pool)] : []; break; }
      default: targets = [];
    }
    for (const target of targets) {
      target.attack = Math.max(0, target.attack + attack);
      target.health = Math.max(1, target.health + health);
      ctx.emit({ kind: 'STATS', sourceId: owner.id, targetId: target.id, attack: target.attack + target.auraAttack, remainingHealth: target.health });
    }
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
