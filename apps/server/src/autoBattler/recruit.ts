import {
  AUTO_BATTLER,
  goldForTurn,
  tavernSizeForTier,
  upgradeCostAfterTierUp,
  type AutoBattlerMinionDef,
  type AutoBattlerPlayerState,
} from '@kartishki/shared';
import { cloneMinionState, createDiscoverSpell, createMinionState, insertAt, isShopMinion } from './instantiate';
import type { SharedMinionPool } from './pool';
import type { SeededRng } from './rng';
import { resolveTriples } from './triples';
import type { EffectRegistry, RecruitContext } from './keywords';
import { fail, ok, type ActionResult } from './errors';

export type RecruitDeps = {
  player: AutoBattlerPlayerState;
  pool: SharedMinionPool;
  rng: SeededRng;
  nextId: () => string;
  registry: EffectRegistry;
  defFor: (baseId: string) => AutoBattlerMinionDef | undefined;
};

function ctxOf(deps: RecruitDeps): RecruitContext {
  return { player: deps.player, nextId: deps.nextId };
}

export function returnOffersToPool(player: AutoBattlerPlayerState, pool: SharedMinionPool): void {
  for (const offer of [...player.tavern.offers]) {
    for (let n = 0; n < offer.poolCopies; n++) pool.returnCopy(offer.baseId);
  }
  while (player.tavern.offers.length) player.tavern.offers.pop();
}

export function fillTavern(deps: RecruitDeps): void {
  const size = tavernSizeForTier(deps.player.tavernTier);
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
  player.gold = goldForTurn(turn);
  player.upgradeCost = Math.max(0, player.upgradeCost - 1);
  player.hero.power.isExhausted = false;
  player.recruitReady = false;
  if (player.tavern.frozen) { player.tavern.frozen = false; fillTavern(deps); }
  else {
    returnOffersToPool(player, deps.pool);
    fillTavern(deps);
  }
  registry.heroPowers.get(player.hero.power.id)?.onRecruitStart?.(ctxOf(deps));
}

export function tryBuy(deps: RecruitDeps, offerId: string, boardIndex?: number): ActionResult {
  const { player } = deps;
  if (player.gold < AUTO_BATTLER.BUY_COST) return fail('NOT_ENOUGH_GOLD');
  if (player.hand.length >= AUTO_BATTLER.HAND_LIMIT) return fail('HAND_FULL');
  const index = [...player.tavern.offers].findIndex(offer => offer.id === offerId);
  if (index < 0) return fail('SHOP_SLOT_NOT_FOUND');
  player.gold -= AUTO_BATTLER.BUY_COST;
  const [minion] = player.tavern.offers.splice(index, 1);
  if (!minion) return fail('SHOP_SLOT_NOT_FOUND');
  minion.owner = player.sessionId;
  player.hand.push(cloneMinionState(minion,minion.id));
  resolveTriples(player, deps.nextId, deps.defFor);
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
  player.gold = Math.min(AUTO_BATTLER.GOLD_CAP, player.gold + AUTO_BATTLER.SELL_REWARD);
  for (let n = 0; n < card.poolCopies; n++) pool.returnCopy(card.baseId);
  deps.registry.heroPowers.get(player.hero.power.id)?.onSell?.(ctxOf(deps));
  resolveTriples(player, deps.nextId, deps.defFor);
  return ok();
}

export function tryReroll(deps: RecruitDeps): ActionResult {
  const { player } = deps;
  if (player.gold < AUTO_BATTLER.REROLL_COST) return fail('NOT_ENOUGH_GOLD');
  player.gold -= AUTO_BATTLER.REROLL_COST;
  player.tavern.frozen = false;
  returnOffersToPool(player, deps.pool);
  fillTavern(deps);
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
  if (card.kind === 'spell' && card.cardId === AUTO_BATTLER.DISCOVER_SPELL_ID) {
    if (player.discoverOpen) return fail('DISCOVER_NOT_ACTIVE');
    const options = deps.pool.sampleDiscover(
      card.tavernTier,
      AUTO_BATTLER.DISCOVER_COUNT,
      deps.rng,
    );
    if (!options.length) return fail('INVALID_DISCOVER_OPTION');
    player.hand.splice(index, 1);
    for (const def of options) {
      if (!deps.pool.take(def.id)) continue;
      const option = createMinionState(def, deps.nextId(), player.sessionId);
      option.poolCopies = 1;
      player.pendingDiscover.push(option);
    }
    player.discoverOpen = player.pendingDiscover.length > 0;
    return player.discoverOpen ? ok({ discover: true }) : ok();
  }
  if (player.board.length >= AUTO_BATTLER.BOARD_LIMIT) return fail('BOARD_FULL');
  if (boardIndex !== undefined && (!Number.isInteger(boardIndex) || boardIndex < 0 || boardIndex > player.board.length)) return fail('INVALID_MOVE');
  player.hand.splice(index, 1);
  card.owner = player.sessionId;
  insertAt(player.board, boardIndex ?? player.board.length, card);
  const battlecry = deps.defFor(card.baseId)?.battlecryId;
  if (battlecry) deps.registry.effects.get(battlecry)?.battlecry?.(ctxOf(deps), card);
  if (card.tripleReward) {
    card.tripleReward = false;
    const reward = createDiscoverSpell(deps.nextId(), player.sessionId);
    reward.tavernTier = Math.min(AUTO_BATTLER.MAX_TIER, player.tavernTier + 1);
    player.hand.push(reward);
  }
  resolveTriples(player, deps.nextId, deps.defFor);
  return ok();
}

export function tryMoveBoard(player: AutoBattlerPlayerState, minionId: string, toIndex: number): ActionResult {
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= player.board.length) return fail('INVALID_MOVE');
  const from = [...player.board].findIndex(minion => minion.id === minionId);
  if (from < 0) return fail('INVALID_MOVE');
  const dest = Math.max(0, Math.min(Math.floor(toIndex), player.board.length - 1));
  if (from === dest) return ok();
  const [card] = player.board.splice(from, 1);
  if (!card) return fail('INVALID_MOVE');
  insertAt(player.board, dest, cloneMinionState(card,card.id));
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
  resolveTriples(player, deps.nextId, deps.defFor);
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
