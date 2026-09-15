import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_BATTLER,
  AutoBattlerPlayerState,
  AutoBattlerRoomState,
  goldForTurn,
  initialUpgradeCost,
  starterAutoBattlerCatalog,
  upgradeCostAfterTierUp,
} from '@kartishki/shared';
import { SharedMinionPool } from '../src/autoBattler/pool';
import { createRng, hashSeed } from '../src/autoBattler/rng';
import { createDefaultRegistry } from '../src/autoBattler/keywords';
import { resolveCombat, type CombatMinion } from '../src/autoBattler/combat';
import { recountTriples, resolveTriples } from '../src/autoBattler/triples';
import { createMinionState } from '../src/autoBattler/instantiate';
import { beginRecruitTurn, tryPlayCard, tryBuy, tryHeroPower, tryMoveBoard, trySell, tryTierUp } from '../src/autoBattler/recruit';
import { planPairing } from '../src/autoBattler/pairing';
import { applyPlayerDamage } from '../src/autoBattler/playerDamage';

const catalog = starterAutoBattlerCatalog;
const def = (id: string) => catalog.minions.find(item => item.id === id);
const registry = createDefaultRegistry(catalog.minions);

test('special actions replace damage, preserve snapshots, and work with zero attack', () => {
  for (const keyword of ['humiliate', 'bait']) {
    const source = minion({ id: 'shouter', cardId: 'ab-whelp', attack: 0, health: 30, keywords: [keyword, 'windfury'] });
    const target = minion({ id: 'victim', cardId: 'ab-ward', attack: 5, health: 20, owner: 'b', keywords: ['divineShield'] });
    const a = { playerId: 'a', tavernTier: 1, board: [source, minion({ id: 'idle', cardId: 'ab-ward', attack: 0 })] };
    const b = { playerId: 'b', tavernTier: 1, board: [target] };
    const result = resolveCombat(a, b, 42, registry, def);
    const kind = keyword === 'humiliate' ? 'HUMILIATE' : 'BAIT';
    const actions = result.events.filter(e => e.sourceId === source.id);
    assert.equal(actions[0]?.kind, kind);
    assert.equal(actions[1]?.kind, kind);
    assert.ok(!actions.some(e => ['ATTACK', 'DAMAGE', 'CLEAVE_DAMAGE'].includes(e.kind)));
    assert.equal(keyword === 'humiliate' ? actions[0]?.attack : actions[0]?.remainingHealth, 1);
    assert.equal(target.attack, 5);
    assert.equal(target.health, 20);
    assert.deepEqual(target.keywords, ['divineShield']);
    assert.deepEqual(result, resolveCombat(a, b, 42, registry, def));
  }
});

function minion(partial: Partial<CombatMinion> & Pick<CombatMinion, 'id' | 'cardId'>): CombatMinion {
  return {
    baseId: partial.cardId,
    attack: 1,
    health: 1,
    tavernTier: 1,
    keywords: [],
    tribes: [],
    golden: false,
    owner: 'a',
    auraAttack: 0,
    ...partial,
  };
}

function player(id: string): AutoBattlerPlayerState {
  const p = new AutoBattlerPlayerState();
  p.sessionId = id;
  p.upgradeCost = initialUpgradeCost(1);
  return p;
}

function deps(p: AutoBattlerPlayerState, pool: SharedMinionPool, seed = 1) {
  return {
    player: p,
    pool,
    rng: createRng(seed),
    nextId: (() => { let n = 0; return () => `t${++n}`; })(),
    registry,
    defFor: def,
  };
}

test('gold follows Battlegrounds curve', () => {
  assert.equal(goldForTurn(1), 3);
  assert.equal(goldForTurn(2), 4);
  assert.equal(goldForTurn(8), 10);
  assert.equal(goldForTurn(9), 10);
});

test('first recruit decrement yields T1 upgrade cost 5', () => {
  const cost = initialUpgradeCost(1);
  assert.equal(cost, 6);
  assert.equal(Math.max(0, cost - 1), 5);
  assert.equal(upgradeCostAfterTierUp(2), 7);
});

test('shared pool roll removes copies and sell returns them', () => {
  const pool = new SharedMinionPool(catalog);
  const before = pool.stocks().reduce((sum, row) => sum + row.remaining, 0);
  const rolled = pool.roll(1, 3, createRng(7));
  assert.equal(rolled.length, 3);
  const afterRoll = pool.stocks().reduce((sum, row) => sum + row.remaining, 0);
  assert.equal(afterRoll, before - 3);
  pool.returnCopy(rolled[0]!.id);
  assert.equal(pool.stocks().reduce((sum, row) => sum + row.remaining, 0), before - 2);
});

test('discover samples tier+1 without removing until take', () => {
  const pool = new SharedMinionPool(catalog);
  const before = pool.count('ab-viper') + pool.count('ab-breeder') + pool.count('ab-bruiser');
  const options = pool.sampleDiscover(2, 3, createRng(11));
  assert.ok(options.length >= 1);
  assert.ok(options.every(item => item.tavernTier === 2 || item.tavernTier <= 2));
  assert.equal(pool.count('ab-viper') + pool.count('ab-breeder') + pool.count('ab-bruiser'), before);
  const picked = options[0]!;
  const remaining = pool.count(picked.id);
  assert.equal(pool.take(picked.id), true);
  assert.equal(pool.count(picked.id), remaining - 1);
});

test('room state and nested hero schemas construct', () => {
  const state = new AutoBattlerRoomState();
  state.players.set('a', player('a'));
  const p = state.players.get('a')!;
  assert.equal(state.phase, 'LOBBY');
  assert.equal(p.hero.health, AUTO_BATTLER.STARTING_HEALTH);
  assert.equal(p.hero.power.targetDomain, 'none');
  assert.equal(p.board.length, 0);
  assert.equal(p.tavern.frozen, false);
});

test('three base copies merge into a golden plus discover', () => {
  const p = player('a');
  const whelp = def('ab-whelp')!;
  p.board.push(createMinionState(whelp, 'm1', 'a'));
  p.board.push(createMinionState(whelp, 'm2', 'a'));
  p.hand.push(createMinionState(whelp, 'm3', 'a'));
  let n = 0;
  assert.equal(resolveTriples(p, () => `x${++n}`, def), true);
  assert.equal([...p.board].filter(m => m.baseId === 'ab-whelp' && !m.golden).length, 0);
  assert.ok([...p.hand].some(m => m.golden && m.baseId === 'ab-whelp'));
  assert.ok([...p.hand].some(m => m.tripleReward));
  recountTriples(p);
  assert.equal(p.tripleCounts.get('ab-whelp') ?? 0, 0);
});

test('combat is deterministic for the same seed', () => {
  const a = { playerId: 'a', tavernTier: 1, board: [minion({ id: 'a1', cardId: 'ab-whelp', attack: 2, health: 2, owner: 'a' })] };
  const b = { playerId: 'b', tavernTier: 1, board: [minion({ id: 'b1', cardId: 'ab-ward', attack: 1, health: 3, owner: 'b' })] };
  const first = resolveCombat(a, b, 42, registry, def);
  const second = resolveCombat(a, b, 42, registry, def);
  assert.deepEqual(first.events, second.events);
  assert.equal(first.seed, 42);
});

test('the side with more minions attacks first', () => {
  const a = {
    playerId: 'a', tavernTier: 1,
    board: [
      minion({ id: 'a1', cardId: 'ab-whelp', attack: 2, health: 1, owner: 'a' }),
      minion({ id: 'a2', cardId: 'ab-whelp', attack: 2, health: 1, owner: 'a' }),
    ],
  };
  const b = { playerId: 'b', tavernTier: 1, board: [minion({ id: 'b1', cardId: 'ab-ward', attack: 1, health: 1, owner: 'b' })] };
  const result = resolveCombat(a, b, 1, registry, def);
  const attack = result.events.find(event => event.kind === 'ATTACK');
  assert.ok(attack?.sourceId === 'a1' || attack?.sourceId === 'a2');
});

test('taunt is the only legal target', () => {
  const a = { playerId: 'a', tavernTier: 1, board: [minion({ id: 'a1', cardId: 'ab-whelp', attack: 1, health: 10, owner: 'a' })] };
  const b = {
    playerId: 'b', tavernTier: 1,
    board: [
      minion({ id: 'b1', cardId: 'ab-whelp', attack: 0, health: 1, owner: 'b' }),
      minion({ id: 'b2', cardId: 'ab-ward', attack: 0, health: 1, owner: 'b', keywords: ['taunt'] }),
    ],
  };
  const result = resolveCombat(a, b, 5, registry, def);
  const attacks = result.events.filter(event => event.kind === 'ATTACK');
  assert.ok(attacks.length >= 1);
  assert.equal(attacks[0]?.targetId, 'b2');
});

test('divine shield ignores the first hit', () => {
  const a = { playerId: 'a', tavernTier: 1, board: [minion({ id: 'a1', cardId: 'ab-whelp', attack: 2, health: 5, owner: 'a' })] };
  const b = { playerId: 'b', tavernTier: 1, board: [minion({ id: 'b1', cardId: 'ab-aegis', attack: 0, health: 2, owner: 'b', keywords: ['divineShield'] })] };
  const result = resolveCombat(a, b, 3, registry, def);
  const pop = result.events.findIndex(event => event.kind === 'DIVINE_SHIELD_POP' && event.targetId === 'b1');
  assert.ok(pop >= 0);
  assert.equal(result.events.slice(0, pop).some(event => event.kind === 'DAMAGE' && event.targetId === 'b1'), false);
});

test('poisonous kills after a shield is gone', () => {
  const a = { playerId: 'a', tavernTier: 2, board: [minion({ id: 'a1', cardId: 'ab-viper', attack: 1, health: 5, owner: 'a', keywords: ['poisonous'] })] };
  const b = { playerId: 'b', tavernTier: 1, board: [minion({ id: 'b1', cardId: 'ab-ward', attack: 0, health: 20, owner: 'b' })] };
  const result = resolveCombat(a, b, 2, registry, def);
  assert.ok(result.events.some(event => event.kind === 'DEATH' && event.targetId === 'b1'));
  assert.equal(result.winnerId, 'a');
});

test('deathrattle summons a token at the death index and respects the board cap', () => {
  const a = { playerId: 'a', tavernTier: 2, board: [minion({ id: 'a1', cardId: 'ab-whelp', attack: 3, health: 1, owner: 'a' })] };
  const b = {
    playerId: 'b', tavernTier: 2,
    board: [
      minion({ id: 'left', cardId: 'ab-ward', attack: 0, health: 1, owner: 'b' }),
      minion({ id: 'rattler', cardId: 'ab-breeder', attack: 0, health: 1, owner: 'b', keywords: ['deathrattle', 'taunt'] }),
      minion({ id: 'right', cardId: 'ab-ward', attack: 0, health: 1, owner: 'b' }),
    ],
  };
  const result = resolveCombat(a, b, 8, registry, def);
  assert.ok(result.events.some(event => event.kind === 'SUMMON' && event.cardId === 'ab-token-1-1'));
  const summon = result.events.find(event => event.kind === 'SUMMON');
  assert.equal(summon?.index, 1);

  const full: CombatMinion[] = Array.from({ length: 7 }, (_, i) => minion({
    id: `f${i}`, cardId: 'ab-hydra', attack: 0, health: 1, owner: 'b', tavernTier: 5,
    keywords: i === 0 ? ['deathrattle', 'taunt'] : [],
  }));
  const capped = resolveCombat(
    { playerId: 'a', tavernTier: 1, board: [minion({ id: 'killer', cardId: 'ab-whelp', attack: 1, health: 10, owner: 'a' })] },
    { playerId: 'b', tavernTier: 2, board: full },
    4,
    registry,
    def,
  );
  const summons = capped.events.filter(event => event.kind === 'SUMMON');
  assert.equal(summons.length, 1);
  assert.ok(capped.survivorsB.length <= AUTO_BATTLER.BOARD_LIMIT);
});

test('winner damage is tavern tier plus surviving minion tiers', () => {
  const a = {
    playerId: 'a', tavernTier: 3,
    board: [minion({ id: 'a1', cardId: 'ab-bruiser', attack: 5, health: 5, tavernTier: 2, owner: 'a' })],
  };
  const b = { playerId: 'b', tavernTier: 1, board: [minion({ id: 'b1', cardId: 'ab-whelp', attack: 1, health: 1, owner: 'b' })] };
  const result = resolveCombat(a, b, 1, registry, def);
  assert.equal(result.winnerId, 'a');
  assert.equal(result.damage, 3 + 2);
});

test('recruit economy: buy removes from tavern, sell returns to pool', () => {
  const pool = new SharedMinionPool(catalog);
  const p = player('a');
  const d = deps(p, pool, 21);
  beginRecruitTurn(d, 1);
  assert.equal(p.gold, 3);
  assert.equal(p.upgradeCost, 5);
  assert.ok(p.tavern.offers.length >= 1);
  const offer = p.tavern.offers[0]!;
  const remaining = pool.count(offer.baseId);
  assert.equal(tryBuy(d, offer.id).ok, true);
  assert.equal(p.gold, 0);
  assert.equal(p.hand.length, 1);
  tryPlayCard(d, p.hand[0]!.id);
  assert.equal(p.board.length, 1);
  assert.equal(pool.count(offer.baseId), remaining);
  assert.equal(trySell(d, p.board[0]!.id).ok, true);
  assert.equal(p.gold, 1);
  assert.equal(pool.count(offer.baseId), remaining + 1);
  p.gold = 10;
  p.upgradeCost = 5;
  assert.equal(tryTierUp(p).ok, true);
  assert.equal(p.tavernTier, 2);
  assert.equal(p.upgradeCost, 7);
});

test('hashSeed is stable', () => {
  assert.equal(hashSeed(['pair', 1, 2]), hashSeed(['pair', 1, 2]));
  assert.notEqual(hashSeed(['pair', 1, 2]), hashSeed(['pair', 1, 3]));
});

test('targeted hero power rejects missing or wrong-zone targets and accepts a tavern minion', () => {
  const pool = new SharedMinionPool(catalog);
  const p = player('a');
  p.hero.power.id = 'ab-power-buff-tavern';
  p.hero.power.isPassive = false;
  p.hero.power.targeted = true;
  p.hero.power.targetDomain = 'tavern';
  p.hero.power.goldCost = 1;
  p.hero.power.isExhausted = false;
  const d = deps(p, pool, 3);
  beginRecruitTurn(d, 1);
  p.gold = 5;
  const offer = p.tavern.offers[0]!;
  assert.equal(tryHeroPower(d).ok, false);
  assert.equal(tryHeroPower(d, 'missing').ok, false);
  if (p.board.length === 0) {
    p.gold = 5;
    tryBuy(d, offer.id);
    tryPlayCard(d, p.hand[0]!.id);
    const boardId = p.board[0]!.id;
    p.gold = 5;
    p.hero.power.isExhausted = false;
    assert.equal(tryHeroPower(d, boardId).ok, false);
  }
  p.gold = 5;
  p.hero.power.isExhausted = false;
  const tavernId = p.tavern.offers[0]!.id;
  const before = p.tavern.offers[0]!.attack;
  assert.equal(tryHeroPower(d, tavernId).ok, true);
  assert.equal(p.hero.power.isExhausted, true);
  assert.equal(p.gold, 4);
  assert.equal(p.tavern.offers[0]!.attack, before + 2);
});

test('untargeted hero power fires without a target', () => {
  const pool = new SharedMinionPool(catalog);
  const p = player('a');
  p.hero.health = 35;
  p.hero.power.id = 'ab-power-heal';
  p.hero.power.isPassive = false;
  p.hero.power.targeted = false;
  p.hero.power.targetDomain = 'none';
  p.hero.power.goldCost = 1;
  const d = deps(p, pool, 4);
  beginRecruitTurn(d, 1);
  p.gold = 3;
  assert.equal(tryHeroPower(d).ok, true);
  assert.equal(p.hero.health, 38);
  assert.equal(p.hero.power.isExhausted, true);
  assert.equal(tryHeroPower(d).ok, false);
  p.hero.health = p.hero.maxHealth;
  p.hero.power.isExhausted = false;
  assert.equal(tryHeroPower(d).ok, true);
  assert.equal(p.hero.health, p.hero.maxHealth);
});

test('board reorder is index-stable', () => {
  const p = player('a');
  const whelp = def('ab-whelp')!;
  p.board.push(createMinionState(whelp, 'm1', 'a'));
  p.board.push(createMinionState(whelp, 'm2', 'a'));
  p.board.push(createMinionState(def('ab-ward')!, 'm3', 'a'));
  assert.equal(tryMoveBoard(p, 'm1', 2).ok, true);
  assert.deepEqual([...p.board].map(m => m.id), ['m2', 'm3', 'm1']);
});

test('windfury attacks twice before the other side', () => {
  const a = { playerId: 'a', tavernTier: 3, board: [minion({ id: 'a1', cardId: 'ab-dervish', attack: 1, health: 10, owner: 'a', keywords: ['windfury'] })] };
  const b = {
    playerId: 'b', tavernTier: 1,
    board: [
      minion({ id: 'b1', cardId: 'ab-ward', attack: 0, health: 1, owner: 'b' }),
      minion({ id: 'b2', cardId: 'ab-ward', attack: 0, health: 1, owner: 'b' }),
    ],
  };
  const result = resolveCombat(a, b, 9, registry, def);
  const attacks = result.events.filter(event => event.kind === 'ATTACK');
  assert.ok(attacks.length >= 2);
  assert.equal(attacks[0]?.sourceId, 'a1');
  assert.equal(attacks[1]?.sourceId, 'a1');
});

test('reborn leaves a 1-health copy without the keyword', () => {
  const a = { playerId: 'a', tavernTier: 5, board: [minion({ id: 'a1', cardId: 'ab-whelp', attack: 4, health: 4, owner: 'a' })] };
  const b = { playerId: 'b', tavernTier: 5, board: [minion({ id: 'b1', cardId: 'ab-ashes', attack: 0, health: 1, owner: 'b', keywords: ['reborn'] })] };
  const result = resolveCombat(a, b, 3, registry, def);
  assert.ok(result.events.some(event => event.kind === 'REBORN'));
  assert.ok(result.events.some(event => event.kind === 'SUMMON'));
});

test('cleave damages neighbors', () => {
  const a = { playerId: 'a', tavernTier: 4, board: [minion({ id: 'a1', cardId: 'ab-butcher', attack: 3, health: 5, owner: 'a', keywords: ['cleave'] })] };
  const b = {
    playerId: 'b', tavernTier: 1,
    board: [
      minion({ id: 'l', cardId: 'ab-ward', attack: 0, health: 3, owner: 'b' }),
      minion({ id: 't', cardId: 'ab-ward', attack: 0, health: 3, owner: 'b', keywords: ['taunt'] }),
      minion({ id: 'r', cardId: 'ab-ward', attack: 0, health: 3, owner: 'b' }),
    ],
  };
  const result = resolveCombat(a, b, 2, registry, def);
  assert.ok(result.events.some(event => event.kind === 'CLEAVE_DAMAGE'));
});

test('player damage applies directly to health and respects cap', () => {
  const p = player('a');
  p.hero.health = 40;
  const hit = applyPlayerDamage(p, 10, { enabled: true, value: 15 });
  assert.equal(hit.healthDamage, 10);
  assert.equal(p.hero.health, 30);
  const capped = applyPlayerDamage(p, 40, { enabled: true, value: 5 });
  assert.equal(capped.applied, 5);
  assert.equal(p.hero.health, 25);
  assert.equal(applyPlayerDamage(p, 25, { enabled: false, value: 5 }).lethal, true);
  assert.equal(p.hero.health, 0);
});

test('pairing of two players is always A vs B', () => {
  const pairs = planPairing(['p1', 'p2'], new Map(), createRng(1));
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0]!.ghost, false);
  assert.ok(new Set([pairs[0]!.playerA, pairs[0]!.playerB]).size === 2);
});

test('triple keeps permanent extras on the golden', () => {
  const p = player('a');
  const whelp = def('ab-whelp')!;
  const a = createMinionState(whelp, 'm1', 'a');
  const b = createMinionState(whelp, 'm2', 'a');
  const c = createMinionState(whelp, 'm3', 'a');
  a.attack += 2;
  p.board.push(a, b);
  p.hand.push(c);
  let n = 0;
  assert.equal(resolveTriples(p, () => `g${++n}`, def), true);
  const golden = [...p.hand].find(m => m.golden && m.baseId === 'ab-whelp');
  assert.ok(golden);
  assert.equal(golden!.attack, whelp.attack * 2 + 2);
});
