import {
  AB_WHEEL_BONUSES,
  AUTO_BATTLER,
  goldForTurn,
  type AbWheelBonus,
  hasTribe,
  spellCost,
  tavernSizeForTier,
  upgradeCostAfterTierUp,
  type AutoBattlerMinionDef,
  type AutoBattlerPlayerState,
  type AutoBattlerSpell,
} from '@kartishki/shared';
import { cloneMinionState, createDiscoverSpell, createMinionState, insertAt, isShopMinion, rewriteList } from './instantiate';
import type { SharedMinionPool } from './pool';
import type { SeededRng } from './rng';
import { resolveTriples } from './triples';
import type { EffectRegistry, RecruitContext } from './keywords';
import { fail, ok, type ActionResult } from './errors';
import { buffTavernMinion, DEFAULT_RULES, devourTavern, echoCount, payBlood, runBoardEffects, runTavernEffects, type RecruitEffectDeps, type TavernRules } from './effects';

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
  return { player: deps.player, rng: deps.rng, defFor: deps.defFor, rules: rulesOf(deps), nextId: deps.nextId, pool: deps.pool };
}

/** Prices replicated to the client: anomalies, free refreshes and the first-buy discount. */
export function syncPrices(deps: RecruitDeps): void {
  const { player } = deps;
  const rules = rulesOf(deps);
  player.buyCost = Math.max(0, rules.buyCost - (player.buysThisTurn === 0 ? rules.firstBuyDiscount : 0));
  player.rerollCost = player.freeRerolls > 0 ? 0 : rules.rerollCost;
  player.sellReward = rules.sellReward;
  // Spells carry their own price (anomaly and the Mystic's thrift taken off); minions follow the table price.
  const thrift = player.hero.power.id === 'ab-power-spell-thrift' ? 1 : 0;
  for (const offer of player.tavern.offers) offer.cost = offer.kind === 'spell' ? Math.max(0, spellCost(deps.defFor(offer.baseId)) - rules.spellDiscount - thrift) : player.buyCost;
}

function afterTriples(deps: RecruitDeps): void {
  const { player } = deps;
  resolveTriples(player, deps.nextId, deps.defFor, golden => {
    runBoardEffects(fxOf(deps), 'triple', golden);
    deps.registry.heroPowers.get(player.hero.power.id)?.onTriple?.(ctxOf(deps), golden);
  }, rulesOf(deps).tripleSize);
}

export function returnOffersToPool(player: AutoBattlerPlayerState, pool: SharedMinionPool): void {
  for (const offer of [...player.tavern.offers]) {
    for (let n = 0; n < offer.poolCopies; n++) pool.returnCopy(offer.baseId);
  }
  while (player.tavern.offers.length) player.tavern.offers.pop();
}

export function fillTavern(deps: RecruitDeps): void {
  const rules = rulesOf(deps);
  const { player } = deps;
  const size = tavernSizeForTier(player.tavernTier) + rules.tavernBonus + rules.spellSlots;
  player.tavern.size = size;
  const spells = [...player.tavern.offers].filter(m => m.kind === 'spell').length;
  // The counter always carries exactly one spell (plus the spell-market's extra slots); every other slot is a minion.
  const wantSpells = Math.max(0, Math.min(1 + rules.spellSlots - spells, size - player.tavern.offers.length));
  const rolled = [
    ...deps.pool.roll(player.tavernTier, wantSpells, deps.rng, def => !!def.spell),
  ];
  rolled.push(...deps.pool.roll(player.tavernTier, Math.max(0, size - player.tavern.offers.length - rolled.length), deps.rng, def => !def.spell));
  for (const def of rolled) {
    const offer = createMinionState(def, deps.nextId(), player.sessionId);
    offer.poolCopies = 1;
    player.tavern.offers.push(offer);
  }
  // Spells always sit in the rightmost slots (stable: minions keep their order, so do the spells).
  const items = [...player.tavern.offers];
  const sorted = [...items.filter(m => m.kind !== 'spell'), ...items.filter(m => m.kind === 'spell')];
  if (sorted.some((m, i) => m.id !== items[i]!.id)) rewriteList(player.tavern.offers, sorted);
}

export function beginRecruitTurn(deps: RecruitDeps, turn: number): void {
  const { player, registry } = deps;
  const rules = rulesOf(deps);
  player.gold = Math.min(rules.goldCap, Math.max(0, goldForTurn(turn) + (rules.goldCap - AUTO_BATTLER.GOLD_CAP) + player.bankedGold));
  player.bankedGold = 0;
  player.upgradeCost = Math.max(0, player.upgradeCost - 1 - rules.upgradeDiscount);
  player.hero.power.isExhausted = false;
  player.recruitReady = false;
  player.buysThisTurn = 0;
  player.freeRerolls = 0;
  // This-turn-only buffs (War Ale and friends) wear off with the night.
  for (const m of [...player.board, ...player.hand]) if (m.tempAttack || m.tempHealth) { buffTavernMinion(m, -m.tempAttack, -m.tempHealth); m.tempAttack = 0; m.tempHealth = 0; }
  if (player.tavern.frozen) { player.tavern.frozen = false; fillTavern(deps); }
  else {
    returnOffersToPool(player, deps.pool);
    fillTavern(deps);
  }
  registry.heroPowers.get(player.hero.power.id)?.onRecruitStart?.(ctxOf(deps));
  player.wheelBonus = rules.wheel ? spinWheel(deps) : '';
  syncPrices(deps);
}

/** Wheel of fate: one seeded wedge per player per turn, paid out through the tavern's ordinary levers. */
function spinWheel(deps: RecruitDeps): AbWheelBonus {
  const { player } = deps;
  const bonus = deps.rng.pick(AB_WHEEL_BONUSES);
  const board = [...player.board].filter(m => m.kind !== 'spell');
  switch (bonus) {
    case 'gold': player.gold += 2; break;
    case 'bank': player.bankedGold += 3; break;
    case 'tonic': if (board.length) buffTavernMinion(deps.rng.pick(board), 2, 2); break;
    case 'hand': for (const m of player.hand) if (m.kind !== 'spell') buffTavernMinion(m, 1, 1); break;
    case 'reroll': player.freeRerolls += 2; break;
    case 'upgrade': player.upgradeCost = Math.max(0, player.upgradeCost - 2); break;
    case 'shield': { const pool = board.filter(m => !m.keywords.includes('divineShield')); if (pool.length) deps.rng.pick(pool).keywords.push('divineShield'); break; }
    case 'taunt': { const pool = board.filter(m => !m.keywords.includes('taunt')); if (pool.length) deps.rng.pick(pool).keywords.push('taunt'); break; }
    case 'token': { const token = deps.defFor('ab-token-1-1'); if (token && player.hand.length < AUTO_BATTLER.HAND_LIMIT) player.hand.push(createMinionState(token, deps.nextId(), player.sessionId)); break; }
    // At full Health the wedge is a coin for next turn instead of a blank (same rule as the Captain's power).
    case 'heal': if (player.hero.health >= player.hero.maxHealth) player.bankedGold += 1; else player.hero.health = Math.min(player.hero.maxHealth, player.hero.health + 3); break;
  }
  return bonus;
}

/** End of the recruit phase: end-of-turn minion effects and passive hero hooks, before boards are snapshotted. */
export function endRecruitTurn(deps: RecruitDeps, onBuff?: RecruitEffectDeps['onBuff']): void {
  const rules = rulesOf(deps);
  for (let n = 0; n < Math.max(1, rules.endTurnTimes); n++) runBoardEffects({ ...fxOf(deps), onBuff }, 'endTurn');
  if (rules.handGrowth) for (const m of deps.player.hand) if (m.kind !== 'spell') buffTavernMinion(m, rules.handGrowth, rules.handGrowth);
  deps.registry.heroPowers.get(deps.player.hero.power.id)?.onTurnEnd?.(ctxOf(deps));
}

export function tryBuy(deps: RecruitDeps, offerId: string, boardIndex?: number): ActionResult {
  const { player } = deps;
  syncPrices(deps);
  if (player.hand.length >= AUTO_BATTLER.HAND_LIMIT) return fail('HAND_FULL');
  const index = [...player.tavern.offers].findIndex(offer => offer.id === offerId);
  if (index < 0) return fail('SHOP_SLOT_NOT_FOUND');
  const cost = player.tavern.offers[index]!.cost;
  if (player.gold < cost) return fail('NOT_ENOUGH_GOLD');
  player.gold -= cost;
  player.buysThisTurn += 1;
  const [minion] = player.tavern.offers.splice(index, 1);
  if (!minion) return fail('SHOP_SLOT_NOT_FOUND');
  minion.owner = player.sessionId;
  const bought = cloneMinionState(minion, minion.id);
  bought.cost = 0;
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
  player.gold += rulesOf(deps).sellReward;
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
  runBoardEffects(fxOf(deps), 'reroll');
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

/** Resolves a non-discover tavern spell. Targeted kinds take the board slot the card was dropped on, else the rightmost minion. */
function castSpell(deps: RecruitDeps, spell: AutoBattlerSpell, boardIndex?: number): ActionResult {
  const { player } = deps;
  const board = [...player.board].filter(m => m.kind !== 'spell');
  const pickTarget = () => board[Math.max(0, Math.min(board.length - 1, boardIndex ?? board.length - 1))];
  const a = spell.attack ?? 0, h = spell.health ?? 0;
  switch (spell.kind) {
    case 'coin': player.gold += spell.amount ?? 1; return ok();
    case 'bank': player.bankedGold += spell.amount ?? 1; return ok();
    case 'freeReroll': player.freeRerolls += spell.amount ?? 1; return ok();
    case 'refresh': {
      player.tavern.frozen = false;
      returnOffersToPool(player, deps.pool);
      fillTavern(deps);
      if (a || h) for (const offer of player.tavern.offers) if (offer.kind !== 'spell') buffTavernMinion(offer, a, h);
      runBoardEffects(fxOf(deps), 'reroll');
      return ok();
    }
    case 'tonic': { const target = pickTarget(); if (!target) return fail('INVALID_TARGET'); buffTavernMinion(target, a, h); return ok(); }
    case 'temp': { const target = pickTarget(); if (!target) return fail('INVALID_TARGET'); buffTavernMinion(target, a, h); target.tempAttack += a; target.tempHealth += h; return ok(); }
    case 'keyword': {
      const target = pickTarget();
      if (!target || !spell.keyword) return fail('INVALID_TARGET');
      if (!target.keywords.includes(spell.keyword)) target.keywords.push(spell.keyword);
      return ok();
    }
    case 'tribeBuff': for (const m of board) if (hasTribe(m.tribes, spell.tribe ?? 'all')) buffTavernMinion(m, a, h); return ok();
    case 'handBuff': for (const m of player.hand) if (m.kind !== 'spell') buffTavernMinion(m, a, h); return ok();
    case 'tavernBuff': for (const m of player.tavern.offers) if (m.kind !== 'spell') buffTavernMinion(m, a, h); return ok();
    case 'upgrade': player.upgradeCost = Math.max(0, player.upgradeCost - (spell.amount ?? 1)); return ok();
    case 'selfDamage': {
      // Blood pact: the price first (guards and selfDamage engines react), then the tribe grows.
      payBlood(fxOf(deps), spell.amount ?? 1);
      for (const m of board) if (hasTribe(m.tribes, spell.tribe ?? 'all')) buffTavernMinion(m, a, h);
      return ok();
    }
    case 'devour': {
      const target = pickTarget();
      if (!target || ![...player.tavern.offers].some(m => m.kind !== 'spell')) return fail('INVALID_TARGET');
      devourTavern(fxOf(deps), target, spell.count ?? 1);
      return ok();
    }
    case 'summon': {
      const token = spell.summonId ? deps.defFor(spell.summonId) : undefined;
      if (!token) return fail('INVALID_TARGET');
      if (player.board.length >= AUTO_BATTLER.BOARD_LIMIT) return fail('BOARD_FULL');
      for (let n = 0; n < (spell.count ?? 1) && player.board.length < AUTO_BATTLER.BOARD_LIMIT; n++) player.board.push(createMinionState(token, deps.nextId(), player.sessionId));
      return ok();
    }
    default: return fail('INVALID_TARGET');
  }
}

export function tryPlayCard(deps: RecruitDeps, cardId: string, boardIndex?: number): ActionResult {
  const { player } = deps;
  const index = [...player.hand].findIndex(card => card.id === cardId);
  if (index < 0) return fail('INVALID_TARGET');
  const source = player.hand[index]!;
  const card = cloneMinionState(source,source.id);
  if (card.kind === 'spell') {
    const reward = card.cardId === AUTO_BATTLER.DISCOVER_SPELL_ID;
    const spell: AutoBattlerSpell | undefined = reward ? { kind: 'discover' } : deps.defFor(card.baseId)?.spell;
    if (!spell) return fail('INVALID_TARGET');
    if (spell.kind === 'discover') {
      if (player.discoverOpen) return fail('DISCOVER_NOT_ACTIVE');
      player.hand.splice(index, 1);
      // A triple reward discovers one tier up (stamped on the card); a bought Choice discovers the player's own tier.
      if (!openDiscover(deps, reward ? card.tavernTier : player.tavernTier)) { player.hand.splice(index, 0, source); return fail('INVALID_DISCOVER_OPTION'); }
      for (let n = 0; n < source.poolCopies; n++) deps.pool.returnCopy(source.baseId);
      runBoardEffects(fxOf(deps), 'spell');
      afterTriples(deps);
      return ok({ discover: true });
    }
    const cast = castSpell(deps, spell, boardIndex);
    if (!cast.ok) return cast;
    player.hand.splice(index, 1);
    for (let n = 0; n < source.poolCopies; n++) deps.pool.returnCopy(source.baseId);
    runBoardEffects(fxOf(deps), 'spell');
    afterTriples(deps);
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
  // Battlecry of the played card (echo minions and the double-trouble anomaly make it ring again), then the rest of the board reacting to the play.
  const echoes = rulesOf(deps).battlecryEcho + echoCount([...player.board], placed.id, 'battlecry', deps.defFor);
  for (let n = 0; n <= echoes; n++) runTavernEffects(fxOf(deps), 'battlecry', placed, placed);
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
    if (![...zone].some(m => m.id === targetId && m.kind !== 'spell')) return fail('INVALID_TARGET');
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
