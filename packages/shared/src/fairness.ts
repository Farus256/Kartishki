import {
  effectParts,
  minionTribes,
  starterAutoBattlerMinions,
  type AutoBattlerEffect,
  type AutoBattlerEffectAction,
  type AutoBattlerEffectStep,
  type AutoBattlerKeyword,
  type AutoBattlerMinionDef,
} from './autoBattler';

/**
 * Deck fairness. Every mechanic carries hidden "fairness points"; a card's value is its printed stats plus those
 * points, and its budget is what the starter tavern spends at that tier. The numbers stay out of the game UI —
 * the editor and the server only show verdicts (fair / strong / broken) and which cards are over the line.
 */

/** Points a keyword is worth on a card (a keyword grant is worth the same to its target). */
export const KEYWORD_POINTS: Record<AutoBattlerKeyword, number> = {
  taunt: 1, divineShield: 2.5, poisonous: 3.5, deathrattle: 0, battlecry: 0, windfury: 2.5, reborn: 2, cleave: 2.5,
  immune: 8, cannotAttack: -2.5, humiliate: 2, bait: 2,
};

/** How often a trigger fires over a game: a battlecry is once, an end-of-turn buff is every turn. */
const TRIGGER_RATE: Record<AutoBattlerEffect['trigger'], number> = {
  battlecry: 1, play: 2, buy: 2.2, sell: 1, endTurn: 2.2, triple: 0.7, startCombat: 1.3, deathrattle: 1, aura: 1.6,
  reroll: 1.8, friendlyDeath: 1.6, shieldPop: 1.4, friendlyAttack: 1.6,
};

/** How many bodies a target usually reaches. */
const TARGET_REACH: Record<NonNullable<AutoBattlerEffectStep['target']>, number> = {
  self: 1, adjacent: 1.8, friendly: 3, random: 1, bought: 1, subject: 1, hand: 1.6, tavern: 1.5,
};

const tribeFilter = (step: AutoBattlerEffectStep) => step.tribe && step.tribe !== 'all' ? 0.7 : 1;
const scaling = (step: AutoBattlerEffectStep) => step.per === 'tribes' ? 1.8 : step.per === 'minions' ? 1.6 : 1;

function actionPoints(action: AutoBattlerEffectAction, defFor: (id: string) => AutoBattlerMinionDef | undefined): number {
  switch (action.kind) {
    case 'buff': return (action.attack + action.health) * 0.9;
    case 'gold': return action.amount * 2.2;
    case 'aura': return action.attack * 1.4;
    case 'keyword': return KEYWORD_POINTS[action.keyword] ?? 1;
    case 'summon': {
      const token = defFor(action.summonId);
      return (token ? bodyPoints(token) * 0.7 : 2) * action.count;
    }
  }
}

function stepPoints(effect: AutoBattlerEffect, step: AutoBattlerEffectStep, defFor: (id: string) => AutoBattlerMinionDef | undefined): number {
  const reach = effect.trigger === 'aura' ? TARGET_REACH.friendly : TARGET_REACH[step.target ?? 'self'];
  return actionPoints(step.action, defFor) * reach * tribeFilter(step) * scaling(step);
}

/** Stats plus keyword points, without effects: what a token or a vanilla body is worth. */
export function bodyPoints(def: AutoBattlerMinionDef): number {
  let points = def.attack + def.health;
  for (const key of def.keywords) points += KEYWORD_POINTS[key] ?? 0;
  if (def.keywords.includes('windfury') || def.keywords.includes('cleave')) points += def.attack * 0.5;
  if (def.keywords.includes('poisonous')) points += Math.max(0, 3 - def.attack) * 0.5;
  if (def.keywords.includes('cannotAttack')) points -= def.attack;
  return points;
}

/** Full hidden value of a card. */
export function cardPoints(def: AutoBattlerMinionDef, defFor: (id: string) => AutoBattlerMinionDef | undefined = id => starterAutoBattlerMinions.find(m => m.id === id)): number {
  if (def.spell) return def.spell.kind === 'discover' ? 6 : (def.spell.amount ?? 1) * 2.2;
  let points = bodyPoints(def);
  if (def.deathrattle) {
    const token = defFor(def.deathrattle.summonId);
    points += (token ? bodyPoints(token) * 0.7 : 2) * def.deathrattle.count;
  }
  if (def.battlecryId === 'ab-bc-gold' && !def.effects?.some(e => e.trigger === 'battlecry' && e.action.kind === 'gold')) points += 2.2;
  for (const effect of def.effects ?? []) {
    const gate = effect.onTribe && effect.onTribe !== 'all' ? 0.75 : effect.onKeyword ? 0.7 : 1;
    const rate = TRIGGER_RATE[effect.trigger] * gate;
    for (const part of effectParts(effect)) points += stepPoints(effect, part, defFor) * rate;
  }
  // Two tribes fit twice as many synergies.
  if (minionTribes(def).length > 1) points += 1;
  return Math.round(points * 10) / 10;
}

export type CardFairness = { id: string; tier: number; points: number; budget: number; delta: number; verdict: 'under' | 'fair' | 'over' | 'broken' };
export type SetFairness = {
  grade: 'fair' | 'strong' | 'broken';
  cards: CardFairness[];
  /** Mean signed delta per tier: a whole tier tuned up reads as 'strong'. */
  tiers: { tier: number; count: number; mean: number }[];
  problems: string[];
};

/** What the starter tavern spends per tier (mean points) and how far its own cards stray (standard deviation). */
const STARTER_NORM = (() => {
  const sums = new Map<number, number[]>();
  const defFor = (id: string) => starterAutoBattlerMinions.find(m => m.id === id);
  for (const def of starterAutoBattlerMinions) {
    if (def.token || def.spell || def.inTavern === false) continue;
    sums.set(def.tavernTier, [...(sums.get(def.tavernTier) ?? []), cardPoints(def, defFor)]);
  }
  const budget = [0, 1, 2, 3, 4, 5, 6].map(tier => { const rows = sums.get(tier); return rows?.length ? Math.round(rows.reduce((a, b) => a + b, 0) / rows.length * 10) / 10 : tier * 3.5; });
  const deltas = [...sums].flatMap(([tier, rows]) => rows.map(p => p - budget[tier]!));
  const sd = deltas.length ? Math.sqrt(deltas.reduce((a, d) => a + d * d, 0) / deltas.length) : 3;
  return { budget, sd };
})();
export const TIER_BUDGET: number[] = STARTER_NORM.budget;
/** Tolerance in points before a card is called out (2 sigma of the starter spread) and before the set is refused (3.5 sigma). */
export const FAIRNESS_OVER = Math.max(5, Math.round(STARTER_NORM.sd * 2 * 10) / 10);
export const FAIRNESS_BROKEN = Math.max(10, Math.round(STARTER_NORM.sd * 3.5 * 10) / 10);

export function cardFairness(def: AutoBattlerMinionDef, defFor?: (id: string) => AutoBattlerMinionDef | undefined): CardFairness {
  const points = cardPoints(def, defFor);
  const budget = TIER_BUDGET[def.tavernTier] ?? def.tavernTier * 3.5;
  const delta = Math.round((points - budget) * 10) / 10;
  const verdict = delta > FAIRNESS_BROKEN ? 'broken' : delta > FAIRNESS_OVER ? 'over' : delta < -FAIRNESS_OVER ? 'under' : 'fair';
  return { id: def.id, tier: def.tavernTier, points, budget, delta, verdict };
}

/** Verdict for a whole set: tokens and spells are not judged, cards out of the tavern are not judged. */
export function setFairness(minions: AutoBattlerMinionDef[]): SetFairness {
  const defFor = (id: string) => minions.find(m => m.id === id) ?? starterAutoBattlerMinions.find(m => m.id === id);
  const judged = minions.filter(m => !m.token && !m.spell && m.inTavern !== false);
  const cards = judged.map(def => cardFairness(def, defFor));
  const tiers = [1, 2, 3, 4, 5, 6].map(tier => {
    const rows = cards.filter(c => c.tier === tier);
    return { tier, count: rows.length, mean: rows.length ? Math.round(rows.reduce((sum, c) => sum + c.delta, 0) / rows.length * 10) / 10 : 0 };
  });
  const problems: string[] = [];
  for (const card of cards) if (card.verdict === 'broken') problems.push(`${card.id}: +${card.delta}`);
  for (const row of tiers) if (row.count && Math.abs(row.mean) > FAIRNESS_OVER) problems.push(`tier ${row.tier}: ${row.mean > 0 ? '+' : ''}${row.mean}`);
  const broken = cards.some(c => c.verdict === 'broken') || tiers.some(t => t.count && t.mean > FAIRNESS_BROKEN);
  const strong = cards.some(c => c.verdict === 'over') || tiers.some(t => t.count && Math.abs(t.mean) > FAIRNESS_OVER);
  return { grade: broken ? 'broken' : strong ? 'strong' : 'fair', cards, tiers, problems };
}
