import {
  AUTO_BATTLER,
  goldForTurn,
  tavernSizeForTier,
  upgradeCostAfterTierUp,
  type AutoBattlerMinionDef,
  type AutoBattlerPlayerState,
} from '@kartishki/shared';
import { cloneMinionState, createDiscoverSpell, createMinionState, insertAt, isShopMinion, rewriteList } from './instantiate';
import type { SharedMinionPool } from './pool';
import type { SeededRng } from './rng';
import { resolveTriples } from './triples';
import type { EffectRegistry, RecruitContext } from './keywords';
import { fail, ok, type ActionResult } from './errors';
import { buffTavernMinion, DEFAULT_RULES, runBoardEffects, runTavernEffects, type RecruitEffectDeps, type TavernRules } from './effects';

export type RecruitDeps = {
  player: AutoBattlerPlayerState;
  pool: SharedMinionPool;
  rng: SeededRng;
  nextId: () => string;
  registry: EffectRegistry;
  defFor: (baseId: string) => AutoBattlerMinionDef | undefined;
  /** Anomaly-adjusted prices; DEFAULT_RULES when the room passes none. */
  rules?: TavernRules;
};

const rulesOf = (deps: RecruitDeps): TavernRules => deps.rules ?? DEFAULT_RULES;

/** Discover of the given tier: options go to pendingDiscover until the player picks. */
function openDiscover(deps: RecruitDeps, tier: number): boolean {
  const { player } = deps;
  if (player.discoverOpen || player.hand.length >= AUTO_BATTLER.HAND_LIMIT) return false;
  const options = deps.pool.sampleDiscover(tier, AUTO_BATTLER.DISCOVER_COUNT, deps.rng);
  for (const def of options) {
    if (!deps.pool.take(def.id)) continue;
    const option = createMinionState(def, deps.nextId(), player.sessionId);
    option.poolCopies = 1;
    player.pendingDiscover.push(option);
  }
  player.discoverOpen = player.pendingDiscover.length > 0;
  return player.discoverOpen;
}

function ctxOf(deps: RecruitDeps): RecruitContext {
  return { player: deps.player, nextId: deps.nextId, rng: deps.rng, defFor: deps.defFor, discover: tier => openDiscover(deps, tier) };
}

function fxOf(deps: RecruitDeps): RecruitEffectDeps {
  return { player: deps.player, rng: deps.rng, defFor: deps.defFor, rules: rulesOf(deps) };
}

/** Prices replicated to the client: anomalies, free refreshes and the first-buy discount. */
export function syncPrices(deps: RecruitDeps): void {
  const { player } = deps;
  const rules = rulesOf(deps);
  player.buyCost = Math.max(0, rules.buyCost - (player.buysThisTurn === 0 ? rules.firstBuyDiscount : 0));
  player.rerollCost = player.freeRerolls > 0 ? 0 : rules.rerollCost;
}

function afterTriples(deps: RecruitDeps): void {
  const { player } = deps;
  resolveTriples(player, deps.nextId, deps.defFor, golden => {
    runBoardEffects(fxOf(deps), 'triple', golden);
    deps.registry.heroPowers.get(player.hero.power.id)?.onTriple?.(ctxOf(deps), golden);
  });
}

export function returnOffersToPool(player: AutoBattlerPlayerState, pool: SharedMinionPool): void {
  for (const offer of [...player.tavern.offers]) {
    for (let n = 0; n < offer.poolCopies; n++) pool.returnCopy(offer.baseId);
  }
  while (player.tavern.offers.length) player.tavern.offers.pop();
}

export function fillTavern(deps: RecruitDeps): void {
  const size = tavernSizeForTier(deps.player.tavernTier) + rulesOf(deps).tavernBonus;
  deps.player.tavern.size = size;
  const rolled = deps.pool.roll(deps.player.tavernTier, Math.max(0, size - deps.player.tavern.offers.length), deps.rng);
  for (const def of rolled) {
    const offer = createMinionState(def, deps.nextId(), deps.player.sessionId);
    offer.poolCopies = 1;
    deps.player.tavern.offers.push(offer);
  }
}

export function beginRecruitTurn(deps: RecruitDeps, turn: number): void {
  const { player, registry } = deps;
  const rules = rulesOf(deps);
  player.gold = Math.min(rules.goldCap, Math.max(0, goldForTurn(turn) + (rules.goldCap - AUTO_BATTLER.GOLD_CAP)));
  player.upgradeCost = Math.max(0, player.upgradeCost - 1);
  player.hero.power.isExhausted = false;
  player.recruitReady = false;
  player.buysThisTurn = 0;
  player.freeRerolls = 0;
  if (player.tavern.frozen) { player.tavern.frozen = false; fillTavern(deps); }
  else {
    returnOffersToPool(player, deps.pool);
    fillTavern(deps);
  }
  registry.heroPowers.get(player.hero.power.id)?.onRecruitStart?.(ctxOf(deps));
  syncPrices(deps);
}

/** End of the recruit phase: end-of-turn minion effects and passive hero hooks, before boards are snapshotted. */
export function endRecruitTurn(deps: RecruitDeps): void {
  runBoardEffects(fxOf(deps), 'endTurn');
  deps.registry.heroPowers.get(deps.player.hero.power.id)?.onTurnEnd?.(ctxOf(deps));
}

export function tryBuy(deps: RecruitDeps, offerId: string, boardIndex?: number): ActionResult {
  const { player } = deps;
  syncPrices(deps);
  const cost = player.buyCost;
  if (player.gold < cost) return fail('NOT_ENOUGH_GOLD');
  if (player.hand.length >= AUTO_BATTLER.HAND_LIMIT) return fail('HAND_FULL');
  const index = [...player.tavern.offers].findIndex(offer => offer.id === offerId);
  if (index < 0) return fail('SHOP_SLOT_NOT_FOUND');
  player.gold -= cost;
  player.buysThisTurn += 1;
  const [minion] = player.tavern.offers.splice(index, 1);
  if (!minion) return fail('SHOP_SLOT_NOT_FOUND');
  minion.owner = player.sessionId;
  const bought = cloneMinionState(minion, minion.id);
  player.hand.push(bought);
  if (bought.kind !== 'spell') {
    runBoardEffects(fxOf(deps), 'buy', bought);
    deps.registry.heroPowers.get(player.hero.power.id)?.onBuy?.(ctxOf(deps), bought);
  }
  afterTriples(deps);
  syncPrices(deps);
  return ok();
}

export function trySell(deps: RecruitDeps, minionId: string): ActionResult {
  const { player, pool } = deps;
  let index = [...player.board].findIndex(minion => minion.id === minionId);
  let from: 'board' | 'hand' = 'board';
  if (index < 0) {
    index = [...player.hand].findIndex(card => card.id === minionId);
    from = 'hand';
  }
  if (index < 0) return fail('INVALID_TARGET');
  const pile = from === 'board' ? player.board : player.hand;
  const [card] = pile.splice(index, 1);
  if (!card || !isShopMinion(card)) {
    if (card) pile.splice(index, 0, card);
    return fail('INVALID_TARGET');
  }
  // GOLD_CAP limits turn income. Sale proceeds must not erase the Merchant's
  // extra dollar when the player starts a sale at 9 or 10.
  player.gold += AUTO_BATTLER.SELL_REWARD;
  for (let n = 0; n < card.poolCopies; n++) pool.returnCopy(card.baseId);
  // The sold card's own "sells for more" first, then the board reacts to the sale.
  runTavernEffects(fxOf(deps), 'sell', card, card);
  runBoardEffects(fxOf(deps), 'sell', card);
  deps.registry.heroPowers.get(player.hero.power.id)?.onSell?.(ctxOf(deps));
  afterTriples(deps);
  return ok();
}

export function tryReroll(deps: RecruitDeps): ActionResult {
  const { player } = deps;
  syncPrices(deps);
  const cost = player.rerollCost;
  if (player.gold < cost) return fail('NOT_ENOUGH_GOLD');
  player.gold -= cost;
  if (player.freeRerolls > 0 && cost === 0) player.freeRerolls -= 1;
  player.tavern.frozen = false;
  returnOffersToPool(player, deps.pool);
  fillTavern(deps);
  syncPrices(deps);
  return ok();
}

export function tryFreeze(player: AutoBattlerPlayerState): ActionResult {
  player.tavern.frozen = !player.tavern.frozen;
  return ok();
}

export function tryTierUp(player: AutoBattlerPlayerState): ActionResult {
  if (player.tavernTier >= AUTO_BATTLER.MAX_TIER) return fail('TAVERN_MAX_TIER');
  if (player.gold < player.upgradeCost) return fail('NOT_ENOUGH_GOLD');
  player.gold -= player.upgradeCost;
  player.tavernTier += 1;
  player.upgradeCost = upgradeCostAfterTierUp(player.tavernTier);
  player.tavern.size = tavernSizeForTier(player.tavernTier);
  return ok();
}

export function tryPlayCard(deps: RecruitDeps, cardId: string, boardIndex?: number): ActionResult {
  const { player } = deps;
  const index = [...player.hand].findIndex(card => card.id === cardId);
  if (index < 0) return fail('INVALID_TARGET');
  const source = player.hand[index]!;
  const card = cloneMinionState(source,source.id);
  if (card.kind === 'spell') {
    const spell = card.cardId === AUTO_BATTLER.DISCOVER_SPELL_ID ? { kind: 'discover' as const, amount: undefined } : deps.defFor(card.baseId)?.spell;
    if (!spell) return fail('INVALID_TARGET');
    if (spell.kind === 'discover') {
      if (player.discoverOpen) return fail('DISCOVER_NOT_ACTIVE');
      player.hand.splice(index, 1);
      if (!openDiscover(deps, card.tavernTier)) { player.hand.splice(index, 0, source); return fail('INVALID_DISCOVER_OPTION'); }
      for (let n = 0; n < source.poolCopies; n++) deps.pool.returnCopy(source.baseId);
      return ok({ discover: true });
    }
    if (spell.kind === 'tonic') {
      const pile = [...player.board].filter(m => m.kind !== 'spell');
      if (!pile.length) return fail('INVALID_TARGET');
      const target = pile[Math.max(0, Math.min(pile.length - 1, boardIndex ?? pile.length - 1))]!;
      buffTavernMinion(target, spell.amount ?? 2, spell.amount ?? 2);
    } else if (spell.kind === 'coin') {
      player.gold += spell.amount ?? 1;
    } else if (spell.kind === 'freeReroll') {
      player.freeRerolls += spell.amount ?? 1;
    }
    player.hand.splice(index, 1);
    for (let n = 0; n < source.poolCopies; n++) deps.pool.returnCopy(source.baseId);
    syncPrices(deps);
    return ok();
  }
  if (player.board.length >= AUTO_BATTLER.BOARD_LIMIT) return fail('BOARD_FULL');
  if (boardIndex !== undefined && (!Number.isInteger(boardIndex) || boardIndex < 0 || boardIndex > player.board.length)) return fail('INVALID_MOVE');
  player.hand.splice(index, 1);
  card.owner = player.sessionId;
  insertAt(player.board, boardIndex ?? player.board.length, card);
  // A mid-board insert rewrites the array with fresh instances: work on the placed one, not the stale clone.
  const placed = [...player.board].find(m => m.id === card.id) ?? card;
  // Battlecry of the played card, then the rest of the board reacting to the play.
  runTavernEffects(fxOf(deps), 'battlecry', placed, placed);
  for (const other of [...player.board]) if (other.id !== placed.id) runTavernEffects(fxOf(deps), 'play', other, placed);
  if (placed.tripleReward) {
    placed.tripleReward = false;
    const reward = createDiscoverSpell(deps.nextId(), player.sessionId);
    reward.tavernTier = Math.min(AUTO_BATTLER.MAX_TIER, player.tavernTier + 1);
    player.hand.push(reward);
  }
  afterTriples(deps);
  return ok();
}

export function tryMoveBoard(player: AutoBattlerPlayerState, minionId: string, toIndex: number): ActionResult {
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= player.board.length) return fail('INVALID_MOVE');
  const from = [...player.board].findIndex(minion => minion.id === minionId);
  if (from < 0) return fail('INVALID_MOVE');
  const dest = Math.max(0, Math.min(Math.floor(toIndex), player.board.length - 1));
  if (from === dest) return ok();
  const items = [...player.board];
  const [card] = items.splice(from, 1);
  if (!card) return fail('INVALID_MOVE');
  items.splice(dest, 0, card);
  rewriteList(player.board, items);
  return ok();
}

export function tryDiscoverPick(deps: RecruitDeps, optionId: string): ActionResult {
  const { player, pool } = deps;
  if (!player.discoverOpen) return fail('DISCOVER_NOT_ACTIVE');
  const option = [...player.pendingDiscover].find(card => card.id === optionId);
  if (!option) return fail('INVALID_DISCOVER_OPTION');
  if (player.hand.length >= AUTO_BATTLER.HAND_LIMIT) return fail('HAND_FULL');
  for (const unused of player.pendingDiscover) {
    if (unused.id !== optionId) for (let n = 0; n < unused.poolCopies; n++) pool.returnCopy(unused.baseId);
  }
  while (player.pendingDiscover.length) player.pendingDiscover.pop();
  player.hand.push(cloneMinionState(option,option.id));
  player.discoverOpen = false;
  afterTriples(deps);
  return ok();
}

export function tryHeroPower(deps: RecruitDeps, targetId?: string): ActionResult {
  const { player } = deps;
  const power = player.hero.power;
  if (power.isPassive) return fail('REJECTED');
  if (power.isExhausted) return fail('HERO_POWER_EXHAUSTED');
  if (player.gold < power.goldCost) return fail('HERO_POWER_UNAFFORDABLE');
  const domain = power.targetDomain;
  if (power.targeted && (domain === 'tavern' || domain === 'board')) {
    if (!targetId) return fail('INVALID_TARGET');
    const zone = domain === 'tavern' ? player.tavern.offers : player.board;
    if (![...zone].some(m => m.id === targetId)) return fail('INVALID_TARGET');
  } else if (targetId) {
    return fail('INVALID_TARGET');
  }
  player.gold -= power.goldCost;
  power.isExhausted = true;
  deps.registry.heroPowers.get(power.id)?.activate?.(ctxOf(deps), targetId);
  return ok();
}

export function returnOwnedMinionsToPool(player: AutoBattlerPlayerState, pool: SharedMinionPool): void {
  for (const minion of [...player.board, ...player.hand, ...player.tavern.offers, ...player.pendingDiscover]) {
    for (let n = 0; n < minion.poolCopies; n++) pool.returnCopy(minion.baseId);
  }
  while (player.board.length) player.board.pop();
  while (player.hand.length) player.hand.pop();
  while (player.tavern.offers.length) player.tavern.offers.pop();
  while (player.pendingDiscover.length) player.pendingDiscover.pop();
  player.discoverOpen = false;
}
