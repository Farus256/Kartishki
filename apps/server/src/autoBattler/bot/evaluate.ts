import {
  AUTO_BATTLER,
  effectParts,
  hasTribe,
  minionTribes,
  type AutoBattlerEffect,
  type AutoBattlerEffectStep,
  type AutoBattlerMinionDef,
  type AutoBattlerSpell,
} from '@kartishki/shared';
import type { TavernRules } from '../effects';

/**
 * Bot evaluation: everything is priced in "stat points" (one point ≈ one Attack or one Health on the board).
 * Gold is worth GOLD_VALUE points, so a 3-gold card must bring more than ~7 points to be a good buy.
 * All estimates are deliberately coarse heuristics — see the bot README in BattlegroundsBot.ts.
 */
export const GOLD_VALUE = 2.4;

/** A minion the bot can see: its own board/hand/tavern cards, discover options. */
export type BotMinion = {
  id: string; baseId: string; cardId: string; kind: string;
  attack: number; health: number; tavernTier: number;
  keywords: readonly string[]; tribes: readonly string[]; golden: boolean;
  tempAttack?: number; tempHealth?: number; cost?: number;
};

export type EvalContext = {
  turn: number;
  /** The bot's own board minions (no spells). */
  board: readonly BotMinion[];
  hand: readonly BotMinion[];
  /** Tribes at this table (public room state). */
  tribes: readonly string[];
  rules: TavernRules;
  defFor: (baseId: string) => AutoBattlerMinionDef | undefined;
  /** Expected number of recruit turns still to be played (drives how much a scaling engine is worth). */
  turnsLeft: number;
};

export const isMinion = (m: { kind: string }) => m.kind !== 'spell';

/** How many turns the match probably still has: long enough for engines to pay off early, short late. */
export function turnsLeftEstimate(turn: number, health: number): number {
  const byTurn = Math.max(2, 14 - turn);
  const byHealth = health <= 10 ? 3 : health <= 20 ? 5 : 10;
  return Math.min(byTurn, byHealth);
}

const KEYWORD_BASE: Record<string, number> = { taunt: 1.2, divineShield: 2.5, poisonous: 4, windfury: 1.5, reborn: 1.8, cleave: 1.5, immune: 4, cannotAttack: 0, humiliate: 3.5, bait: 3.5, deathrattle: 0, battlecry: 0 };

function keywordValue(keyword: string, attack: number, health: number, turn: number): number {
  switch (keyword) {
    case 'divineShield': return 2 + attack * 0.5;
    case 'poisonous': return attack > 0 ? 4 + turn * 0.4 : 0;
    case 'windfury': return attack * 0.8 + 0.5;
    case 'cleave': return attack * 0.6 + 0.5;
    case 'reborn': return 1 + attack * 0.4;
    case 'taunt': return 0.8 + health * 0.08;
    case 'cannotAttack': return -attack;
    default: return KEYWORD_BASE[keyword] ?? 0;
  }
}

/** Plain stats of a definition (tokens summoned by effects and deathrattles). */
function defStats(def: AutoBattlerMinionDef | undefined, golden: boolean): number {
  if (!def) return 2;
  const scale = golden ? 2 : 1;
  let v = (def.attack + def.health * 0.85) * scale;
  for (const k of def.keywords) v += keywordValue(k, def.attack * scale, def.health * scale, 5);
  return v;
}

/** Number of board minions a step targets right now (self excluded for 'friendly'/'random'). */
function targetCount(step: AutoBattlerEffectStep, ctx: EvalContext, ownerId: string, onBoard: boolean): number {
  const others = ctx.board.filter(m => m.id !== ownerId);
  const tribeOk = (m: BotMinion) => !step.tribe || step.tribe === 'all' || hasTribe(m.tribes, step.tribe);
  switch (step.target ?? 'self') {
    case 'self': return 1;
    case 'bought': case 'subject': return 1;
    case 'adjacent': return Math.min(2, onBoard ? others.length : ctx.board.length);
    case 'friendly': return others.filter(tribeOk).length;
    case 'random': return others.some(tribeOk) ? 1 : 0;
    case 'hand': return ctx.hand.filter(m => isMinion(m) && tribeOk(m)).length;
    case 'tavern': return 0.6; // a buffed counter only pays when the bot buys from it
  }
}

/** Menagerie / count scaling as it stands on the board now. */
function multiplierNow(step: AutoBattlerEffectStep, ctx: EvalContext): number {
  if (!step.per) return 1;
  if (step.per === 'tribes') return new Set(ctx.board.flatMap(m => [...m.tribes].filter(t => t !== 'neutral'))).size;
  return ctx.board.filter(m => (!step.perTribe || step.perTribe === 'all' || hasTribe(m.tribes, step.perTribe)) && (!step.perKeyword || m.keywords.includes(step.perKeyword))).length;
}

/** Share of the bot's board+hand that carries `tribe`: how likely the subject-filtered triggers fire. */
function tribeShare(tribe: string | undefined, ctx: EvalContext): number {
  if (!tribe || tribe === 'all') return 1;
  const all = [...ctx.board, ...ctx.hand].filter(isMinion);
  if (!all.length) return ctx.tribes.includes(tribe) ? 0.35 : 0;
  const n = all.filter(m => hasTribe(m.tribes, tribe)).length;
  return Math.max(ctx.tribes.includes(tribe) ? 0.2 : 0, n / all.length);
}

/** Expected fires per recruit turn of a tavern trigger. */
function triggersPerTurn(effect: AutoBattlerEffect, ctx: EvalContext): number {
  const share = tribeShare(effect.onTribe, ctx);
  switch (effect.trigger) {
    case 'endTurn': return ctx.rules.endTurnTimes;
    case 'buy': return 1.6 * share;
    case 'play': return 1.4 * share;
    case 'sell': return 0.5;
    case 'reroll': return ctx.rules.rerollCost === 0 ? 3 : 0.8;
    case 'spell': return ctx.rules.spellSlots ? 1.2 : 0.4;
    case 'triple': return 0.15;
    case 'selfDamage': return ctx.board.some(m => hasTribe(m.tribes, 'demon')) ? 0.6 : 0.1;
    case 'devour': return ctx.board.some(m => hasTribe(m.tribes, 'demon')) ? 0.5 : 0.1;
    default: return 0;
  }
}

/** Expected fires per fight of a combat trigger, from the friends that can cause it. */
function combatTriggers(effect: AutoBattlerEffect, ctx: EvalContext, ownerId: string): number {
  const others = ctx.board.filter(m => m.id !== ownerId);
  const match = others.filter(m => (!effect.onTribe || effect.onTribe === 'all' || hasTribe(m.tribes, effect.onTribe)) && (!effect.onKeyword || m.keywords.includes(effect.onKeyword)));
  switch (effect.trigger) {
    case 'startCombat': return 1;
    case 'deathrattle': return 0.7;
    case 'friendlyDeath': return match.length * 0.6;
    case 'friendlySummon': return others.filter(m => m.keywords.includes('deathrattle') || m.keywords.includes('reborn')).length * 0.8 + match.filter(m => m.keywords.includes('reborn')).length * 0.5;
    case 'shieldPop': return match.filter(m => m.keywords.includes('divineShield')).length * 0.9 + (ctx.rules.combatKeyword === 'divineShield' ? others.length * 0.8 : 0);
    case 'friendlyAttack': return match.length * 0.9;
    default: return 0;
  }
}

/** Value of one step's action applied once to one target. */
function actionValue(step: AutoBattlerEffectStep, golden: boolean, ctx: EvalContext): number {
  const scale = golden ? 2 : 1;
  const a = step.action;
  switch (a.kind) {
    case 'buff': return (a.attack + a.health * 0.85) * scale;
    case 'gold': return a.amount * scale * GOLD_VALUE;
    case 'keyword': return KEYWORD_BASE[a.keyword] ?? 1;
    case 'summon': return defStats(ctx.defFor(a.summonId), golden) * a.count * (golden ? 2 : 1) * 0.8;
    case 'selfDamage': return -a.amount * 0.5 + ctx.board.filter(m => (ctx.defFor(m.baseId)?.effects ?? []).some(e => e.trigger === 'selfDamage')).length * 2.5;
    case 'devour': return a.count * scale * (2 + ctx.turn * 0.6);
    case 'aura': case 'echo': case 'guard': return 0; // static: priced in staticValue
  }
}

/** Static ('aura' trigger) effects: attack auras, echoes, the demon guard. */
function staticValue(effect: AutoBattlerEffect, owner: BotMinion, ctx: EvalContext): number {
  const a = effect.action;
  const others = ctx.board.filter(m => m.id !== owner.id);
  const scale = owner.golden ? 2 : 1;
  if (a.kind === 'aura') return a.attack * scale * others.filter(m => !effect.tribe || effect.tribe === 'all' || hasTribe(m.tribes, effect.tribe)).length + 1;
  if (a.kind === 'echo') return 2 + others.filter(m => m.keywords.includes(a.echo)).length * 2 * scale + (a.echo === 'battlecry' ? ctx.turnsLeft * 0.4 : 0);
  if (a.kind === 'guard') return 1.5 + others.filter(m => hasTribe(m.tribes, 'demon')).length * 1.2;
  return 0;
}

/**
 * Worth of a minion's printed effects for this bot, given its board and how long the match probably lasts.
 * `onBoard` = the minion is already on the board (a Battlecry has fired; only repeating triggers count).
 */
export function effectsValue(minion: BotMinion, ctx: EvalContext, onBoard: boolean): number {
  const def = ctx.defFor(minion.baseId);
  let total = 0;
  if (def?.deathrattle) total += defStats(ctx.defFor(def.deathrattle.summonId), minion.golden) * def.deathrattle.count * 0.8;
  for (const effect of def?.effects ?? []) {
    if (effect.trigger === 'aura') { total += staticValue(effect, minion, ctx); continue; }
    if (effect.trigger === 'battlecry') {
      if (onBoard) continue;
      const echoes = 1 + ctx.rules.battlecryEcho + ctx.board.filter(m => (ctx.defFor(m.baseId)?.effects ?? []).some(e => e.trigger === 'aura' && e.action.kind === 'echo' && e.action.echo === 'battlecry')).length;
      for (const step of effectParts(effect)) total += actionValue(step, minion.golden, ctx) * targetCount(step, ctx, minion.id, false) * multiplierNow(step, ctx) * echoes;
      continue;
    }
    const perTurn = triggersPerTurn(effect, ctx);
    if (perTurn > 0) {
      for (const step of effectParts(effect)) {
        const per = actionValue(step, minion.golden, ctx) * targetCount(step, ctx, minion.id, onBoard) * multiplierNow(step, ctx);
        // A self-buff engine compounds over the remaining turns; end-of-turn gold is just gold.
        total += per * perTurn * ctx.turnsLeft * (step.action.kind === 'gold' ? 0.9 : 0.7);
      }
      continue;
    }
    const perFight = combatTriggers(effect, ctx, minion.id);
    if (perFight > 0) for (const step of effectParts(effect)) total += actionValue(step, minion.golden, ctx) * Math.max(1, targetCount(step, ctx, minion.id, true)) * multiplierNow(step, ctx) * perFight * 0.8;
  }
  return total;
}

/** Full value of a minion for the bot: stats, keywords, effects, tribe fit. */
export function minionValue(minion: BotMinion, ctx: EvalContext, onBoard: boolean): number {
  if (!isMinion(minion)) return 0;
  const attack = minion.attack - (minion.tempAttack ?? 0), health = minion.health - (minion.tempHealth ?? 0);
  let v = attack + health * 0.85;
  if (minion.keywords.includes('cannotAttack')) v = health * 0.5;
  for (const k of minion.keywords) v += keywordValue(k, attack, health, ctx.turn);
  v += effectsValue(minion, ctx, onBoard);
  // A body that fits the tribe the bot leans on is worth a little more (future buffs/auras land on it).
  const focus = compositionFocus(ctx);
  if (focus && hasTribe(minion.tribes, focus)) v *= 1.08;
  return v;
}

/** The tribe the bot is building around, or '' while it is still open (early, or nothing leads). */
export function compositionFocus(ctx: EvalContext): string {
  const counts = new Map<string, number>();
  for (const m of [...ctx.board, ...ctx.hand]) {
    if (!isMinion(m)) continue;
    for (const tribe of m.tribes) if (tribe !== 'neutral') counts.set(tribe, (counts.get(tribe) ?? 0) + 1 + (m.golden ? 1 : 0));
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  if (!top || top[1] < 2) return '';
  if (sorted[1] && sorted[1][1] === top[1]) return '';
  return top[0];
}

/** Value of a tavern spell right now (before buying it). */
export function spellValue(spell: AutoBattlerSpell | undefined, ctx: EvalContext, gold: number): number {
  if (!spell) return 0;
  const board = ctx.board;
  const a = spell.attack ?? 0, h = spell.health ?? 0, buff = a + h * 0.85;
  switch (spell.kind) {
    case 'discover': return 6 + ctx.turn * 0.4;
    case 'coin': return (spell.amount ?? 1) * GOLD_VALUE;
    case 'bank': return (spell.amount ?? 1) * GOLD_VALUE * 0.9;
    case 'freeReroll': return ctx.rules.rerollCost * GOLD_VALUE * 0.8;
    case 'refresh': return (gold >= 3 ? 1.5 : 0) + buff * 0.6;
    case 'tonic': return board.length ? buff : 0;
    case 'temp': return board.length ? buff * 0.35 : 0;
    case 'keyword': return board.length && spell.keyword ? (KEYWORD_BASE[spell.keyword] ?? 1) + 0.5 : 0;
    case 'tribeBuff': return buff * board.filter(m => hasTribe(m.tribes, spell.tribe ?? 'all')).length;
    case 'handBuff': return buff * ctx.hand.filter(isMinion).length;
    case 'tavernBuff': return buff * 0.4;
    case 'upgrade': return (spell.amount ?? 1) * GOLD_VALUE * 0.5;
    case 'summon': return board.length < AUTO_BATTLER.BOARD_LIMIT ? defStats(ctx.defFor(spell.summonId ?? ''), false) * (spell.count ?? 1) : 0;
    case 'selfDamage': return buff * board.filter(m => hasTribe(m.tribes, spell.tribe ?? 'all')).length - (spell.amount ?? 1) * 0.6;
    case 'devour': return board.length ? (spell.count ?? 1) * (2 + ctx.turn * 0.6) : 0;
    default: return 0;
  }
}

export function tribesOf(def: AutoBattlerMinionDef | undefined): string[] {
  return def ? [...minionTribes(def)] : [];
}
