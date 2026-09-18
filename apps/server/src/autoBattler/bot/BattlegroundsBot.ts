import { AUTO_BATTLER, hasTribe, type AutoBattlerHeroDef, type AutoBattlerMinionDef, type AutoBattlerPlayerState } from '@kartishki/shared';
import type { TavernRules } from '../effects';
import { compositionFocus, GOLD_VALUE, isMinion, minionValue, spellValue, turnsLeftEstimate, type BotMinion, type EvalContext } from './evaluate';
import { desiredOrder, nextMove } from './positioning';

/**
 * Battlegrounds bot: a rule/utility planner over the same recruit actions a human sends.
 *
 * Each call to planAction looks at the bot's own seat (its board, hand, tavern, gold — the same zones a human sees)
 * plus public table facts (turn, tribes in play, anomaly rules, the next opponent's public health/tier) and returns
 * ONE action. The room executes it through the ordinary tryBuy/trySell/... functions and asks again, so every
 * step is re-evaluated on the real post-action state. Nothing here reads the shared pool, other boards or future rolls.
 *
 * Decision order (first non-empty wins; buys, upgrades and refreshes compete on utility):
 *   discover pick → play minions / spells → sell to make room → tier up vs buy → hero power → refresh → freeze → reorder → end.
 * Utilities are priced in stat points (see evaluate.ts); gold is worth GOLD_VALUE points.
 */
export type BotAction =
  | { kind: 'discoverPick'; optionId: string }
  | { kind: 'play'; cardId: string; boardIndex?: number }
  | { kind: 'sell'; minionId: string }
  | { kind: 'buy'; offerId: string }
  | { kind: 'tierUp' }
  | { kind: 'heroPower'; targetId?: string }
  | { kind: 'reroll' }
  | { kind: 'freeze' }
  | { kind: 'move'; minionId: string; toIndex: number }
  | { kind: 'end' };

export type BotView = {
  me: AutoBattlerPlayerState;
  turn: number;
  rules: TavernRules;
  tribes: readonly string[];
  defFor: (baseId: string) => AutoBattlerMinionDef | undefined;
  /** Public facts about the next opponent (leaderboard data), when paired. */
  opponent?: { health: number; tavernTier: number; mainTribe: string };
};

/** Hard ceiling on actions per recruit turn, so a bot can never spin the tavern forever. */
export const BOT_MAX_ACTIONS = 48;
const MAX_MOVES = 8;

const asBot = (m: AutoBattlerPlayerState['board'][number]): BotMinion => ({
  id: m.id, baseId: m.baseId, cardId: m.cardId, kind: m.kind, attack: m.attack, health: m.health, tavernTier: m.tavernTier,
  keywords: [...m.keywords], tribes: [...m.tribes], golden: m.golden, tempAttack: m.tempAttack, tempHealth: m.tempHealth, cost: m.cost,
});

/** Tier the bot wants to sit at this turn: the standard curve, slowed when bleeding, pushed when healthy and mid-game. */
export function desiredTier(turn: number, health: number, maxHealth: number): number {
  const curve = [3, 6, 9, 12, 15]; // turn at which tier 2..6 becomes the target; index = tier - 2
  const shift = health <= 12 ? 1 : health >= maxHealth * 0.75 && turn >= 6 ? -1 : 0;
  let tier = 1;
  for (const [i, at] of curve.entries()) if (turn >= at + shift) tier = i + 2;
  return Math.min(AUTO_BATTLER.MAX_TIER, tier);
}

export class BattlegroundsBot {
  private turn = -1;
  private actions = 0;
  private rerolls = 0;
  private moves = 0;
  private powerTried = false;

  constructor(readonly sessionId: string) {}

  /** Hero pick: economy and passive engines first, tribe powers only when their tribe plays. */
  chooseHero(offers: readonly AutoBattlerHeroDef[], tribes: readonly string[], anomalyId: string): AutoBattlerHeroDef | undefined {
    const score = (hero: AutoBattlerHeroDef) => {
      const base: Record<string, number> = {
        'ab-power-rich': 9, 'ab-power-bounty': 8, 'ab-power-free-roll': 7, 'ab-power-heal': 6.5, 'ab-power-hand-token': 6.5,
        'ab-power-sell-gold': 6, 'ab-power-triple-buff': 6, 'ab-power-buff-board': 5.5, 'ab-power-buff-tavern': 5.5, 'ab-power-discover': 5.5,
        'ab-power-shield': 5, 'ab-power-swap': 4,
        'ab-power-beast-buy': tribes.includes('beast') ? 7 : 2, 'ab-power-undead-end': tribes.includes('undead') ? 6.5 : 2,
        'ab-power-spell-thrift': anomalyId === 'ab-anomaly-spell-market' ? 8 : 5,
      };
      const cheap = anomalyId === 'ab-anomaly-cheap-powers' && !hero.power.isPassive ? 1.5 : 0;
      return (base[hero.power.id] ?? 4) + cheap + (hero.health - 38) * 0.3;
    };
    return [...offers].sort((a, b) => score(b) - score(a))[0];
  }

  private beginTurn(turn: number): void {
    if (this.turn === turn) return;
    this.turn = turn;
    this.actions = 0; this.rerolls = 0; this.moves = 0; this.powerTried = false;
  }

  private context(view: BotView): EvalContext {
    const { me } = view;
    return {
      turn: view.turn,
      board: [...me.board].filter(isMinion).map(asBot),
      hand: [...me.hand].map(asBot),
      tribes: view.tribes,
      rules: view.rules,
      defFor: view.defFor,
      turnsLeft: turnsLeftEstimate(view.turn, me.hero.health),
    };
  }

  /** Copies of `baseId` the bot holds (board + hand, non-golden): pair and triple pressure. */
  private copiesHeld(me: AutoBattlerPlayerState, baseId: string): number {
    return [...me.board, ...me.hand].filter(m => isMinion(m) && !m.golden && m.baseId === baseId).length;
  }

  private pairBonus(view: BotView, baseId: string): number {
    const held = this.copiesHeld(view.me, baseId);
    const need = view.rules.tripleSize;
    if (held + 1 >= need) return 8 + view.me.tavernTier * 0.8; // a golden plus a discover one tier up
    if (held > 0) return 2.5;
    return 0;
  }

  /** Value of a tavern minion offer for buying: worth minus its price, with pair pressure and early tempo. */
  private buyUtility(view: BotView, ctx: EvalContext, offer: BotMinion): number {
    const { me } = view;
    const value = minionValue(offer, ctx, false) + this.pairBonus(view, offer.baseId);
    const developing = ctx.board.length < AUTO_BATTLER.BOARD_LIMIT;
    const priceWeight = developing ? 0.55 : 1;
    let utility = value - (offer.cost ?? me.buyCost) * GOLD_VALUE * priceWeight;
    if (!ctx.board.length && !ctx.hand.some(isMinion)) utility += 3; // an empty table needs a body more than a saving
    if (!developing) {
      // Full board: only worth it when it replaces the weakest body by a margin (the sale refunds a coin).
      const weakest = Math.min(...ctx.board.map(m => minionValue(m, ctx, true)));
      utility = Math.min(utility, value - weakest - 2.5);
    }
    return utility;
  }

  private tierUpUtility(view: BotView, ctx: EvalContext): number {
    const { me } = view;
    if (me.tavernTier >= AUTO_BATTLER.MAX_TIER || me.gold < me.upgradeCost) return -Infinity;
    const want = desiredTier(view.turn, me.hero.health, me.hero.maxHealth);
    let utility = (want - me.tavernTier) * 6;
    if (me.upgradeCost <= 2 && view.turn >= 3) utility += 4; // nearly free
    if (ctx.board.length < 2 && view.turn >= 3) utility -= 6; // bodies first when the table is bare
    if (view.opponent && view.opponent.tavernTier > me.tavernTier + 1) utility += 2;
    return utility;
  }

  private bestOffer(view: BotView, ctx: EvalContext): { offer: BotMinion; utility: number } | undefined {
    let best: { offer: BotMinion; utility: number } | undefined;
    for (const raw of view.me.tavern.offers) {
      const offer = asBot(raw);
      const utility = isMinion(offer)
        ? this.buyUtility(view, ctx, offer)
        : spellValue(view.defFor(offer.baseId)?.spell, ctx, view.me.gold) - (offer.cost ?? 0) * GOLD_VALUE * 0.9;
      if (!best || utility > best.utility) best = { offer, utility };
    }
    return best;
  }

  /** Board minion that gains the most from a targeted buff (keyword spells skip minions that already carry it). */
  private bestBoardTarget(ctx: EvalContext, keyword?: string): BotMinion | undefined {
    const pool = ctx.board.filter(m => !keyword || !m.keywords.includes(keyword)).filter(m => !m.keywords.includes('cannotAttack'));
    return [...pool].sort((a, b) => minionValue(b, ctx, true) - minionValue(a, ctx, true))[0];
  }

  private playAction(view: BotView, ctx: EvalContext): BotAction | undefined {
    const { me } = view;
    const hand = [...me.hand].map(asBot);
    const boardFull = ctx.board.length >= AUTO_BATTLER.BOARD_LIMIT;
    // Minions: best first; a full board only takes one that beats the weakest body (sold first).
    const minions = hand.filter(isMinion).map(m => ({ m, value: minionValue(m, ctx, false) + (m.golden ? 2 : 0) })).sort((a, b) => b.value - a.value);
    const top = minions[0];
    if (top) {
      if (!boardFull) return { kind: 'play', cardId: top.m.id, boardIndex: ctx.board.length };
      const weakest = ctx.board.map(m => ({ m, value: minionValue(m, ctx, true) })).sort((a, b) => a.value - b.value)[0];
      if (weakest && top.value > weakest.value + 2.5) return { kind: 'sell', minionId: weakest.m.id };
    }
    // Spells in hand were bought for a reason: cast the ones that do something now.
    for (const card of hand.filter(m => !isMinion(m))) {
      const spell = card.cardId === AUTO_BATTLER.DISCOVER_SPELL_ID ? { kind: 'discover' as const } : view.defFor(card.baseId)?.spell;
      if (!spell) continue;
      if (spell.kind === 'discover') { if (!me.discoverOpen && me.hand.length < AUTO_BATTLER.HAND_LIMIT) return { kind: 'play', cardId: card.id }; continue; }
      if (spell.kind === 'upgrade') { if (me.tavernTier < desiredTier(view.turn, me.hero.health, me.hero.maxHealth) && me.gold + (spell.amount ?? 1) >= me.upgradeCost) return { kind: 'play', cardId: card.id }; continue; }
      if (spell.kind === 'refresh') { const best = this.bestOffer(view, ctx); if (!best || best.utility <= 0) return { kind: 'play', cardId: card.id }; continue; }
      if (spellValue(spell, ctx, me.gold) <= 0) continue;
      if (['tonic', 'temp', 'keyword', 'devour'].includes(spell.kind)) {
        const target = this.bestBoardTarget(ctx, spell.kind === 'keyword' ? spell.keyword : undefined);
        if (!target) continue;
        if (spell.kind === 'devour' && ![...me.tavern.offers].some(isMinion)) continue;
        return { kind: 'play', cardId: card.id, boardIndex: ctx.board.findIndex(m => m.id === target.id) };
      }
      if (spell.kind === 'summon' && boardFull) continue;
      if (spell.kind === 'selfDamage' && me.hero.health <= (spell.amount ?? 1) + 6) continue;
      return { kind: 'play', cardId: card.id };
    }
    return undefined;
  }

  private heroPowerAction(view: BotView, ctx: EvalContext, spareGold: number): BotAction | undefined {
    const { me } = view;
    const power = me.hero.power;
    if (power.isPassive || power.isExhausted || me.gold < power.goldCost || this.powerTried) return undefined;
    const cost = power.goldCost * GOLD_VALUE;
    const pick = (action: BotAction) => { this.powerTried = true; return action; };
    switch (power.id) {
      case 'ab-power-heal': return spareGold >= power.goldCost ? pick({ kind: 'heroPower' }) : undefined; // free: heal, or bank a coin at full health
      case 'ab-power-buff-tavern': {
        // Buff the offer the bot is about to buy (must still afford it afterwards).
        const best = this.bestOffer(view, ctx);
        if (best && isMinion(best.offer) && best.utility > -1 && me.gold >= power.goldCost + (best.offer.cost ?? me.buyCost) && me.hand.length < AUTO_BATTLER.HAND_LIMIT) return pick({ kind: 'heroPower', targetId: best.offer.id });
        return undefined;
      }
      case 'ab-power-buff-board': { const t = this.bestBoardTarget(ctx); return t && spareGold >= power.goldCost && 3 > cost ? pick({ kind: 'heroPower', targetId: t.id }) : undefined; }
      case 'ab-power-shield': { const t = this.bestBoardTarget(ctx, 'divineShield'); return t && spareGold >= power.goldCost && 2 + t.attack * 0.5 > cost ? pick({ kind: 'heroPower', targetId: t.id }) : undefined; }
      case 'ab-power-discover': return spareGold >= power.goldCost && me.hand.length < AUTO_BATTLER.HAND_LIMIT && !me.discoverOpen && 6 + view.turn * 0.4 > cost ? pick({ kind: 'heroPower' }) : undefined;
      case 'ab-power-swap': {
        // Free: turn a tall non-taunt body into a hitter when its Health clearly outweighs its Attack.
        const t = ctx.board.filter(m => !m.keywords.includes('taunt') && !m.keywords.includes('cannotAttack') && m.health - m.attack >= 3).sort((a, b) => (b.health - b.attack) - (a.health - a.attack))[0];
        return t ? pick({ kind: 'heroPower', targetId: t.id }) : undefined;
      }
      default: return undefined;
    }
  }

  planAction(view: BotView): BotAction {
    this.beginTurn(view.turn);
    if (this.actions >= BOT_MAX_ACTIONS) return { kind: 'end' };
    this.actions++;
    const { me } = view;
    const ctx = this.context(view);

    if (me.discoverOpen) {
      const options = [...me.pendingDiscover].map(asBot).map(m => ({ m, value: minionValue(m, ctx, false) + this.pairBonus(view, m.baseId) })).sort((a, b) => b.value - a.value);
      if (options[0]) return { kind: 'discoverPick', optionId: options[0].m.id };
    }

    const play = this.playAction(view, ctx);
    if (play) return play;

    // Tier up vs buy: the better utility goes first; both may happen in one turn.
    const tierUp = this.tierUpUtility(view, ctx);
    const best = this.bestOffer(view, ctx);
    const canBuy = !!best && best.utility > 0 && me.gold >= (best.offer.cost ?? me.buyCost) && me.hand.length < AUTO_BATTLER.HAND_LIMIT;
    if (tierUp > 0 && (!canBuy || tierUp >= best!.utility)) return { kind: 'tierUp' };
    if (canBuy) {
      // Warden buffs the offer first when affordable.
      if (me.hero.power.id === 'ab-power-buff-tavern') { const p = this.heroPowerAction(view, ctx, me.gold); if (p) return p; }
      return { kind: 'buy', offerId: best!.offer.id };
    }

    // Nothing worth buying: refresh while gold still allows a purchase afterwards, within a per-turn budget.
    // Gold does not carry over (beginRecruitTurn resets it), so there is nothing to save for — spend or lose it.
    const rerollCost = me.rerollCost;
    const maxRerolls = rerollCost === 0 ? 4 : view.turn <= 3 ? 1 : view.turn <= 6 ? 2 : 3;
    if (this.rerolls < maxRerolls && me.gold >= rerollCost + me.buyCost && me.hand.length < AUTO_BATTLER.HAND_LIMIT) { this.rerolls++; return { kind: 'reroll' }; }

    // Leftover gold: hero power.
    const power = this.heroPowerAction(view, ctx, me.gold);
    if (power) return power;

    // Freeze a counter with a good but unaffordable offer (a pair, a strong body); unfreeze a stale one.
    const worthFreezing = !!best && best.utility > 2.5 && me.gold < (best.offer.cost ?? me.buyCost);
    if (worthFreezing !== me.tavern.frozen && me.tavern.offers.length) return { kind: 'freeze' };

    // Positioning: one move at a time towards the desired order.
    const current = [...me.board].filter(isMinion).map(m => m.id);
    const move = nextMove(current, desiredOrder(ctx.board, view.defFor));
    if (move && this.moves < MAX_MOVES) { this.moves++; return { kind: 'move', minionId: move.minionId, toIndex: move.toIndex }; }

    return { kind: 'end' };
  }

  /** Composition the bot leans on (for tests and the debug log). */
  focus(view: BotView): string {
    return compositionFocus(this.context(view));
  }
}

export { desiredOrder, nextMove, hasTribe };
