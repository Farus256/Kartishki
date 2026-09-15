import test from 'node:test';
import assert from 'node:assert/strict';
import { AutoBattlerPlayerState, initialUpgradeCost, starterAutoBattlerCatalog, validateAutoBattlerMinion } from '@kartishki/shared';
import { SharedMinionPool } from '../src/autoBattler/pool';
import { createRng } from '../src/autoBattler/rng';
import { createDefaultRegistry } from '../src/autoBattler/keywords';
import { createMinionState } from '../src/autoBattler/instantiate';
import { resolveCombat } from '../src/autoBattler/combat';
import { beginRecruitTurn, endRecruitTurn, tryBuy, tryPlayCard, tryReroll, trySell, type RecruitDeps } from '../src/autoBattler/recruit';
import { DEFAULT_RULES } from '../src/autoBattler/effects';

const catalog = starterAutoBattlerCatalog;
const def = (id: string) => catalog.minions.find(item => item.id === id);
const registry = createDefaultRegistry(catalog.minions);

function player(id = 'p', gold = 10): AutoBattlerPlayerState {
  const p = new AutoBattlerPlayerState();
  p.sessionId = id;
  p.gold = gold;
  p.upgradeCost = initialUpgradeCost(1);
  return p;
}

function deps(p: AutoBattlerPlayerState, rules = DEFAULT_RULES): RecruitDeps {
  let n = 0;
  return { player: p, pool: new SharedMinionPool(catalog), rng: createRng(3), nextId: () => `t${++n}`, registry, defFor: def, rules };
}

function offer(p: AutoBattlerPlayerState, id: string): string {
  const m = createMinionState(def(id)!, `o-${id}-${p.tavern.offers.length}`, p.sessionId);
  m.poolCopies = 0;
  p.tavern.offers.push(m);
  return m.id;
}

function onBoard(p: AutoBattlerPlayerState, id: string, golden = false) {
  const m = createMinionState(def(id)!, `b-${id}-${p.board.length}`, p.sessionId, golden);
  p.board.push(m);
  return m;
}

test('battlecry buffs, buy-tribe buffs and end-of-turn buffs are permanent tavern stats', () => {
  const p = player();
  const d = deps(p);
  const cub = onBoard(p, 'ab-cub');
  const deckhand = onBoard(p, 'ab-deckhand');
  const bought = offer(p, 'ab-whelp');
  assert.equal(tryBuy(d, bought).ok, true);
  assert.equal(cub.attack, 2, 'cub grows after buying a beast');
  assert.equal(cub.health, 2);
  assert.equal(cub.bonusAttack, 1);
  const mech = offer(p, 'ab-ward');
  tryBuy(d, mech);
  assert.equal(cub.attack, 2, 'a mech does not feed the cub');
  tryPlayCard(d, mech, 0);
  const seen: string[] = [];
  endRecruitTurn(d, (owner, target) => seen.push(`${owner.cardId}>${target.cardId}`));
  assert.deepEqual(seen, ['ab-deckhand>ab-deckhand'], 'end-of-turn buffs are reported for the combat prelude');
  // Mid-board inserts rewrite the array, so read the board again instead of trusting old refs.
  const live = (id: string) => [...p.board].find(m => m.cardId === id)!;
  assert.equal(live('ab-deckhand').attack, 3, 'deckhand gains attack at the end of the turn');
  const tinker = offer(p, 'ab-tinkerer');
  tryBuy(d, tinker);
  const before = [...p.board].map(m => m.attack + m.health);
  assert.equal(tryPlayCard(d, tinker, 0).ok, true);
  const after = [...p.board].filter(m => m.cardId !== 'ab-tinkerer').map(m => m.attack + m.health);
  assert.equal(after.reduce((a, b) => a + b, 0) - before.reduce((a, b) => a + b, 0), 2, 'exactly one mech got +1/+1');
});

test('triples feed triple-triggered minions and the sold card pays its own bonus', () => {
  const p = player();
  const d = deps(p);
  const collector = onBoard(p, 'ab-collector');
  for (let i = 0; i < 3; i++) tryBuy(d, offer(p, 'ab-whelp'));
  assert.equal(p.tripleSerial, 1);
  assert.equal(collector.attack, 5, 'collector +2 per triple');
  assert.equal(collector.health, 5);
  const gold = p.gold;
  const swab = onBoard(p, 'ab-swab');
  assert.equal(trySell(d, swab.id).ok, true);
  assert.equal(p.gold, gold + 2, 'swab sells for 2');
});

test('tavern spells: coin, free refresh and tonic', () => {
  const p = player('p', 10);
  const d = deps(p);
  const target = onBoard(p, 'ab-bruiser');
  const coin = offer(p, 'ab-spell-coin');
  tryBuy(d, coin);
  assert.equal([...p.hand][0]?.kind, 'spell');
  assert.equal(tryPlayCard(d, coin).ok, true);
  assert.equal(p.gold, 8, 'paid 3, got 1 back');
  const refresh = offer(p, 'ab-spell-refresh');
  tryBuy(d, refresh);
  tryPlayCard(d, refresh);
  assert.equal(p.rerollCost, 0);
  assert.equal(tryReroll(d).ok, true);
  assert.equal(p.gold, 5, 'refresh was free');
  assert.equal(p.rerollCost, 1);
  const tonic = offer(p, 'ab-spell-tonic');
  tryBuy(d, tonic);
  assert.equal(tryPlayCard(d, tonic, 0).ok, true);
  assert.equal(target.attack, 5);
  assert.equal(target.health, 5);
  assert.equal(p.board.length, 1, 'spells never land on the board');
});

test('anomaly rules: prices, gold cap and first-buy discount reach the player state', () => {
  const p = player('p', 0);
  const d = deps(p, { ...DEFAULT_RULES, goldCap: 12, rerollCost: 0, firstBuyDiscount: 1, tavernBonus: 1 });
  beginRecruitTurn(d, 10);
  assert.equal(p.gold, 12);
  assert.equal(p.tavern.offers.length, 4, 'tier 1 tavern plus one');
  assert.equal(p.buyCost, 2);
  assert.equal(p.rerollCost, 0);
  tryBuy(d, [...p.tavern.offers][0]!.id);
  assert.equal(p.gold, 10);
  assert.equal(p.buyCost, 3, 'discount is once per turn');
});

test('passive hero hooks: innkeeper free roll, tycoon gold, collector triples', () => {
  const inn = player('inn', 0);
  inn.hero.power.id = 'ab-power-free-roll';
  beginRecruitTurn(deps(inn), 1);
  assert.equal(inn.rerollCost, 0);
  const rich = player('rich', 0);
  rich.hero.power.id = 'ab-power-rich';
  beginRecruitTurn(deps(rich), 1);
  assert.equal(rich.gold, 4);
  const col = player('col', 10);
  col.hero.power.id = 'ab-power-triple-buff';
  const d = deps(col);
  for (let i = 0; i < 3; i++) tryBuy(d, offer(col, 'ab-whelp'));
  const golden = [...col.hand].find(m => m.golden)!;
  assert.equal(golden.attack, 6, '2×2 golden whelp +2');
  assert.equal(golden.health, 4);
});

test('combat: start-of-combat buffs, data auras and deathrattle buffs are deterministic', () => {
  const side = (owner: string, ids: string[]) => ({ playerId: owner, tavernTier: 3, board: ids.map((id, i) => { const m = createMinionState(def(id)!, `${owner}${i}`, owner); return { id: m.id, cardId: m.cardId, baseId: m.baseId, attack: m.attack, health: m.health, tavernTier: m.tavernTier, keywords: [...m.keywords], tribes: [...m.tribes], golden: false, owner, auraAttack: 0 }; }) });
  const a = side('a', ['ab-cannoneer', 'ab-alpha', 'ab-whelp', 'ab-gravedigger', 'ab-skeleton']);
  const b = side('b', ['ab-golem', 'ab-golem', 'ab-golem']);
  const result = resolveCombat(a, b, 9, registry, def);
  const stats = result.events.filter(e => e.kind === 'STATS');
  assert.ok(stats.some(e => e.targetId === 'a0' && e.attack === 8), 'cannoneer +3 at start');
  assert.ok(stats.some(e => e.targetId === 'a2' && e.attack === 4), 'whelp gets the alpha aura');
  assert.ok(result.events.some(e => e.kind === 'DEATHRATTLE' && e.sourceId === 'a3'), 'gravedigger deathrattle fires');
  assert.deepEqual(result.events, resolveCombat(a, b, 9, registry, def).events);
});

test('expansion catalog: every minion validates and every summon token exists', () => {
  const ids = new Set(catalog.minions.map(m => m.id));
  for (const m of catalog.minions) {
    assert.ok(validateAutoBattlerMinion(m), `invalid def ${m.id}`);
    if (m.deathrattle) assert.ok(ids.has(m.deathrattle.summonId), `${m.id} summons unknown ${m.deathrattle.summonId}`);
    for (const e of m.effects ?? []) if (e.action.kind === 'summon') assert.ok(ids.has(e.action.summonId), `${m.id} summons unknown ${e.action.summonId}`);
  }
  assert.ok(catalog.minions.filter(m => !m.token && !m.spell && !m.generated).length >= 140);
});

test('expansion tavern triggers: refresh, menagerie scaling, in-hand buffs, keyword grants and battlecry summons', () => {
  const p = player();
  const d = deps(p);
  const sword = onBoard(p, 'ab-sellsword');
  const hoarder = onBoard(p, 'ab-gear-hoarder');
  const ward = createMinionState(def('ab-ward')!, 'hand-ward', p.sessionId); p.hand.push(ward);
  assert.equal(tryReroll(d).ok, true);
  assert.equal(sword.attack, 2, 'sellsword grows on refresh');
  assert.equal(p.hand[0]!.attack, 2, 'mech in hand grows on refresh');
  assert.equal(hoarder.attack, 2, 'hoarder itself is not a hand card');
  onBoard(p, 'ab-whelp'); onBoard(p, 'ab-broker');
  const keeper = createMinionState(def('ab-zookeeper')!, 'hand-keeper', p.sessionId); p.hand.push(keeper);
  assert.equal(tryPlayCard(d, keeper.id).ok, true);
  const placed = [...p.board].find(m => m.cardId === 'ab-zookeeper')!;
  assert.equal(placed.attack, 5, 'zookeeper: +1 per tribe (mech, beast, pirate)');
  const soldier = createMinionState(def('ab-tin-soldier')!, 'hand-tin', p.sessionId); p.hand.push(soldier);
  tryPlayCard(d, soldier.id);
  assert.ok([...p.board].some(m => m.cardId !== 'ab-tin-soldier' && m.tribes.includes('mech') && m.keywords.includes('divineShield')), 'a mech gained Divine Shield');
  const scribe = onBoard(p, 'ab-scribe');
  const rat = createMinionState(def('ab-rat-pack')!, 'hand-rat', p.sessionId); p.hand.push(rat);
  endRecruitTurn(d);
  assert.equal(p.hand[p.hand.length - 1]!.attack, 2, 'scribe buffs the hand at end of turn');
  assert.equal(scribe.attack, 1);
});

test('expansion combat triggers: shield pops, friendly deaths, friendly attacks, keyword grants and summons', () => {
  const side = (owner: string, ids: string[]) => ({ playerId: owner, tavernTier: 3, board: ids.map((id, i) => { const m = createMinionState(def(id)!, `${owner}${i}`, owner); return { id: m.id, cardId: m.cardId, baseId: m.baseId, attack: m.attack, health: m.health, tavernTier: m.tavernTier, keywords: [...m.keywords], tribes: [...m.tribes], golden: false, owner, auraAttack: 0 }; }) });
  const a = side('a', ['ab-shield-mite', 'ab-aegis', 'ab-hyena', 'ab-rat-pack', 'ab-grave-titan', 'ab-holy-mech']);
  const b = side('b', ['ab-golem', 'ab-golem', 'ab-golem', 'ab-golem']);
  const result = resolveCombat(a, b, 5, registry, def);
  const stats = result.events.filter(e => e.kind === 'STATS');
  const holy = resolveCombat(side('h', ['ab-holy-mech', 'ab-ward']), side('g', ['ab-golem']), 1, registry, def);
  assert.ok(holy.events.some(e => e.kind === 'STATS' && e.targetId === 'h1' && e.keywords?.includes('divineShield')), 'holy mech grants a shield at start of combat');
  assert.ok(result.events.some(e => e.kind === 'DIVINE_SHIELD_POP'), 'a shield popped');
  assert.ok(stats.some(e => e.targetId === 'a0' && e.sourceId === 'a0' && (e.attack ?? 0) >= 2), 'shield mite grows on a pop');
  const pack = resolveCombat(side('k', ['ab-kennel', 'ab-hyena']), side('g', ['ab-golem']), 1, registry, def);
  assert.ok(pack.events.some(e => e.kind === 'STATS' && e.targetId === 'k1' && e.sourceId === 'k1' && e.attack === 4), 'hyena grows when a beast dies');
  assert.ok(result.events.some(e => e.kind === 'SUMMON' && e.cardId === 'ab-token-skel' && e.sourceId === 'a4'), 'grave titan summons on a friendly death');
  const c = side('c', ['ab-glyph-guardian', 'ab-hangry-dragon']);
  const drakes = resolveCombat(c, side('d', ['ab-ward', 'ab-ward', 'ab-ward']), 2, registry, def);
  assert.ok(drakes.events.some(e => e.kind === 'STATS' && e.targetId === 'c1' && e.sourceId === 'c1'), 'hangry dragon grows after another dragon attacks');
  assert.ok(drakes.events.some(e => e.kind === 'STATS' && e.sourceId === 'c0' && e.targetId === 'c1'), 'glyph guardian buffs the attacking dragon');
  assert.deepEqual(result.events, resolveCombat(a, b, 5, registry, def).events);
});
