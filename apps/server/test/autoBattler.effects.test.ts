import test from 'node:test';
import assert from 'node:assert/strict';
import { AutoBattlerPlayerState, hasTribe, initialUpgradeCost, starterAutoBattlerCatalog, validateAutoBattlerMinion } from '@kartishki/shared';
import { SharedMinionPool } from '../src/autoBattler/pool';
import { createRng } from '../src/autoBattler/rng';
import { createDefaultRegistry } from '../src/autoBattler/keywords';
import { createMinionState } from '../src/autoBattler/instantiate';
import { resolveCombat } from '../src/autoBattler/combat';
import { beginRecruitTurn, endRecruitTurn, syncPrices, tryBuy, tryPlayCard, tryReroll, trySell, type RecruitDeps } from '../src/autoBattler/recruit';
import { DEFAULT_RULES, runTavernEffects } from '../src/autoBattler/effects';

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

test('tavern spells: own prices, coin, refresh with a buff, tonic, keywords and the spell trigger', () => {
  const p = player('p', 10);
  const d = deps(p);
  const target = onBoard(p, 'ab-bruiser');
  const caster = onBoard(p, 'ab-hedge-apprentice');
  const coin = offer(p, 'ab-spell-coin');
  syncPrices(d);
  assert.equal([...p.tavern.offers][0]!.cost, 1, 'a coin costs its own price, not the table price');
  tryBuy(d, coin);
  assert.equal(p.gold, 9);
  assert.equal([...p.hand][0]?.kind, 'spell');
  assert.equal(tryPlayCard(d, coin).ok, true);
  assert.equal(p.gold, 10, 'paid 1, got 1 back');
  assert.equal(caster.attack, 2, 'the apprentice grows on every spell');
  const refresh = offer(p, 'ab-spell-refresh');
  tryBuy(d, refresh);
  assert.equal(tryPlayCard(d, refresh).ok, true);
  assert.equal(p.gold, 9, 'the refresh itself was part of the spell');
  assert.ok(p.tavern.offers.length >= 3, 'the counter was refilled');
  assert.ok([...p.tavern.offers].filter(m => m.kind !== 'spell').every(m => m.bonusAttack === 1 && m.bonusHealth === 1), 'fresh offers arrive with +1/+1');
  const tonic = offer(p, 'ab-spell-tonic');
  tryBuy(d, tonic);
  assert.equal(tryPlayCard(d, tonic, 0).ok, true);
  assert.equal(target.attack, 5);
  assert.equal(target.health, 5);
  const taunt = offer(p, 'ab-spell-taunt');
  tryBuy(d, taunt);
  assert.equal(tryPlayCard(d, taunt, 0).ok, true);
  assert.ok(target.keywords.includes('taunt'));
  assert.equal(p.board.length, 2, 'spells never land on the board');
  assert.equal(caster.attack, 5, 'four spells, four buffs');
});

test('tavern spells sit in the rightmost slots and this-turn buffs wear off', () => {
  const p = player('p', 10);
  const d = deps(p);
  for (let i = 0; i < 12; i++) { beginRecruitTurn(d, i + 1); const kinds = [...p.tavern.offers].map(m => m.kind); const firstSpell = kinds.indexOf('spell'); if (firstSpell >= 0) assert.ok(kinds.slice(firstSpell).every(k => k === 'spell'), `spells right of minions: ${kinds.join(',')}`); }
  const target = onBoard(p, 'ab-bruiser');
  const ale = offer(p, 'ab-spell-ale');
  p.gold = 10;
  tryBuy(d, ale);
  assert.equal(tryPlayCard(d, ale, 0).ok, true);
  assert.equal(target.attack, 6, 'war ale: +3/+3 now');
  assert.equal(target.tempAttack, 3);
  beginRecruitTurn(d, 13);
  const live = [...p.board].find(m => m.cardId === 'ab-bruiser')!;
  assert.equal(live.attack, 3, 'and gone by the next turn');
  assert.equal(live.tempAttack, 0);
});

test('echoes: the herald doubles battlecries, grave echo doubles deathrattles, the anomaly doubles battlecries too', () => {
  const p = player('p', 10);
  const d = deps(p);
  onBoard(p, 'ab-herald-echo');
  const whelp = onBoard(p, 'ab-whelp');
  const master = createMinionState(def('ab-houndmaster')!, 'h-master', p.sessionId); p.hand.push(master);
  assert.equal(tryPlayCard(d, master.id).ok, true);
  assert.equal([...p.board].find(m => m.id === whelp.id)!.attack, 7 + 4, 'houndmaster rang twice');
  const twice = deps(p, { ...DEFAULT_RULES, battlecryEcho: 1 });
  const trader = createMinionState(def('ab-trader')!, 'h-trader', p.sessionId); p.hand.push(trader);
  const gold = p.gold;
  tryPlayCard(twice, trader.id);
  assert.equal(p.gold, gold + 2 * 3, 'herald + double-trouble: three rings of +$2');
  const side = (owner: string, ids: string[]) => ({ playerId: owner, tavernTier: 3, board: ids.map((id, i) => { const m = createMinionState(def(id)!, `${owner}${i}`, owner); return { id: m.id, cardId: m.cardId, baseId: m.baseId, attack: m.attack, health: m.health, tavernTier: m.tavernTier, keywords: [...m.keywords], tribes: [...m.tribes], golden: false, owner, auraAttack: 0 }; }) });
  const result = resolveCombat(side('a', ['ab-rat-pack', 'ab-grave-echo']), side('b', ['ab-golem', 'ab-golem']), 3, registry, def);
  // RECONSTRUCTED (recovery): the exact pre-loss assertions for this block were not preserved; the checks below cover the same behaviour.
  assert.equal(result.events.filter(e => e.kind === 'DEATHRATTLE' && e.sourceId === 'a0').length, 2, 'grave echo rings the rattle twice');
  assert.equal(result.events.filter(e => e.kind === 'SUMMON' && e.cardId === 'ab-token-rat').length, 2, 'two pups from one rat pack');
  const echoed = resolveCombat(side('a', ['ab-nest', 'ab-breeder', 'ab-warren']), side('b', ['ab-golem', 'ab-golem', 'ab-golem']), 7, registry, def);
  const stats = echoed.events.filter(e => e.kind === 'STATS');
  assert.ok(stats.some(e => e.sourceId === 'a1' && e.targetId === 'a1' && e.attack === 3), 'breeder grows when a pup arrives');
  const pups = echoed.events.filter(e => e.kind === 'SUMMON' && e.cardId === 'ab-token-rat').map(e => e.minionId);
  assert.ok(pups.length >= 1 && pups.every(id => stats.some(e => e.sourceId === 'a2' && e.targetId === id && e.attack === 3)), 'warren buffs every pup');
});

test('golden age merges pairs; three Petroviches merge but mint no Discover', () => {
  const p = player('p', 10);
  const d = deps(p, { ...DEFAULT_RULES, tripleSize: 2 });
  tryBuy(d, offer(p, 'ab-whelp'));
  tryBuy(d, offer(p, 'ab-whelp'));
  assert.equal(p.tripleSerial, 1, 'two copies made a golden');
  assert.ok([...p.hand].some(m => m.golden && m.baseId === 'ab-whelp'));
  const t = player('t', 10);
  const dt = deps(t);
  for (let i = 0; i < 3; i++) t.hand.push(createMinionState(def('ab-token-1-1')!, `tok${i}`, t.sessionId));
  tryBuy(dt, offer(t, 'ab-ward'));
  assert.equal(t.tripleSerial, 1, 'three Petroviches became a golden Petrovich');
  const golden = [...t.hand].find(m => m.golden && m.baseId === 'ab-token-1-1');
  assert.ok(golden && golden.attack === 2 && !golden.tripleReward, 'a 2/2 with no Discover attached');
  assert.equal([...t.hand].filter(m => m.baseId === 'ab-token-1-1').length, 1);
});

test('anomaly rules: spell market, overtime and the long night', () => {
  const market = player('m', 10);
  const dm = deps(market, { ...DEFAULT_RULES, spellSlots: 2, spellDiscount: 1 });
  beginRecruitTurn(dm, 5);
  const offers = [...market.tavern.offers];
  assert.equal(offers.length, 5, 'tier-1 counter plus two spell slots');
  assert.ok(offers.filter(m => m.kind === 'spell').length >= 2, 'the extra slots hold spells');
  assert.ok(offers.filter(m => m.kind === 'spell').every(m => m.cost === Math.max(0, (def(m.baseId)!.spell!.cost ?? 3) - 1)), 'every spell is $1 off');
  const ot = player('o', 10);
  const deck = onBoard(ot, 'ab-deckhand');
  const card = createMinionState(def('ab-ward')!, 'hand-ward', ot.sessionId); ot.hand.push(card);
  endRecruitTurn(deps(ot, { ...DEFAULT_RULES, endTurnTimes: 2, handGrowth: 1 }));
  assert.equal(deck.attack, 4, 'deckhand grew twice');
  // RECONSTRUCTED (recovery): the closing assertions of this test were not preserved verbatim.
  assert.equal([...ot.hand][0]!.attack, 2, 'the long night grew the card in hand');
  assert.equal([...ot.hand][0]!.health, 4);
});

test('end-of-turn gold is banked and paid on top of the next turn income', () => {
  const p = player('p', 3);
  const d = deps(p);
  onBoard(p, 'ab-smuggler');
  endRecruitTurn(d);
  assert.equal(p.gold, 3, 'the coin is not spendable this turn');
  assert.equal(p.bankedGold, 1);
  beginRecruitTurn(d, 2);
  assert.equal(p.gold, 5, 'turn 2 income (4) plus the banked coin');
  assert.equal(p.bankedGold, 0);
});

test('scenario steps run in order on the board the previous step left', () => {
  const p = player();
  const d = deps(p);
  const stepper = { ...def('ab-bruiser')!, id: 'stepper', keywords: ['battlecry' as const], effects: [{
    trigger: 'battlecry' as const, target: 'adjacent' as const, action: { kind: 'buff' as const, attack: 1, health: 1 },
    steps: [
      { action: { kind: 'summon' as const, summonId: 'ab-token-1-1', count: 1 } },
      { target: 'friendly' as const, action: { kind: 'buff' as const, attack: 2, health: 0 } },
    ],
  }] };
  const withStepper = { ...d, defFor: (id: string) => id === 'stepper' ? stepper : def(id) };
  onBoard(p, 'ab-ward');
  const card = createMinionState(stepper, 'h-stepper', p.sessionId);
  p.hand.push(card);
  const trace: number[] = [];
  tryPlayCard(withStepper, card.id, 1);
  const live = (id: string) => [...p.board].find(m => m.cardId === id)!;
  assert.equal(live('ab-ward').attack, 1 + 1 + 2, 'step 1 buffs the neighbour, step 3 buffs every friendly minion');
  assert.equal(live('ab-token-1-1').attack, 1 + 2, 'the token summoned by step 2 is on the board for step 3');
  runTavernEffects({ player: p, rng: withStepper.rng, defFor: withStepper.defFor, rules: DEFAULT_RULES, nextId: withStepper.nextId, trace: line => trace.push(line.step) }, 'battlecry', live('stepper'));
  assert.deepEqual(trace, [0, 1, 2]);
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
  assert.equal(golden.attack, 17, '14/12 golden whelp +3');
  assert.equal(golden.health, 15);
});

test('combat: start-of-combat buffs, data auras and deathrattle buffs are deterministic', () => {
  const side = (owner: string, ids: string[]) => ({ playerId: owner, tavernTier: 3, board: ids.map((id, i) => { const m = createMinionState(def(id)!, `${owner}${i}`, owner); return { id: m.id, cardId: m.cardId, baseId: m.baseId, attack: m.attack, health: m.health, tavernTier: m.tavernTier, keywords: [...m.keywords], tribes: [...m.tribes], golden: false, owner, auraAttack: 0 }; }) });
  const a = side('a', ['ab-cannoneer', 'ab-alpha', 'ab-whelp', 'ab-gravedigger', 'ab-skeleton']);
  const b = side('b', ['ab-golem', 'ab-golem', 'ab-golem']);
  const result = resolveCombat(a, b, 9, registry, def);
  const stats = result.events.filter(e => e.kind === 'STATS');
  assert.ok(stats.some(e => e.targetId === 'a0' && e.attack === 8), 'cannoneer +3 at start');
  assert.ok(stats.some(e => e.targetId === 'a2' && e.attack === 9), 'whelp gets the alpha aura');
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
  assert.equal(p.hand[p.hand.length - 1]!.attack, 3, 'scribe buffs the hand at end of turn'); // RECONSTRUCTED (recovery): the Rat Pack is 2/2 since the balance pass
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

test('demons: blood price and guard, devour with tavern scaling, the Gargoyle feeds the board, demon spells', () => {
  const p = player('d', 10);
  const d = deps(p);
  const fiend = onBoard(p, 'ab-pain-fiend');
  const imp = createMinionState(def('ab-blood-imp')!, 'h-imp', p.sessionId); p.hand.push(imp);
  assert.equal(tryPlayCard(d, imp.id).ok, true);
  assert.equal(p.hero.health, 38, 'the blood imp took 2 Health');
  assert.equal(fiend.attack, 3, 'the pain fiend grew on the blood price, then on the imp');
  assert.equal(fiend.health, 5, 'blood imp +1/+1 on top');
  onBoard(p, 'ab-soul-warden');
  const priest = createMinionState(def('ab-pain-priest')!, 'h-priest', p.sessionId); p.hand.push(priest);
  assert.equal(tryPlayCard(d, priest.id).ok, true);
  assert.equal(p.hero.health, 38, 'guarded: no Health paid');
  assert.equal([...p.board].find(m => m.id === fiend.id)!.attack, 3 + 1 + 3, 'selfDamage effects still fire when guarded');
  p.hero.health = 2;
  const pact = offer(p, 'ab-spell-blood-pact');
  tryBuy(d, pact);
  assert.equal(tryPlayCard(d, pact).ok, true);
  assert.equal(p.hero.health, 2, 'a guarded blood pact costs nothing');
  assert.ok([...p.board].filter(m => hasTribe(m.tribes, 'demon')).every(m => m.bonusAttack >= 2), 'and the pact still buffs every demon');

  const g = player('g', 10);
  const dg = deps(g);
  beginRecruitTurn(dg, 3);
  const offers = [...g.tavern.offers];
  assert.equal(offers.filter(m => m.kind === 'spell').length, 1, 'the counter carries exactly one spell');
  const feeder = onBoard(g, 'ab-feeder');
  const butcher = onBoard(g, 'ab-glutton-butcher');
  const gobbler = createMinionState(def('ab-gobbler')!, 'h-gob', g.sessionId); g.hand.push(gobbler);
  const food = offers.filter(m => m.kind !== 'spell');
  const bag = food.reduce((n, m) => n + m.attack + m.health, 0);
  assert.equal(tryPlayCard(dg, gobbler.id).ok, true);
  const eater = [...g.board].find(m => m.id === gobbler.id)!;
  assert.equal(g.tavern.offers.length, offers.length - 1, 'one offer was eaten');
  const left = [...g.tavern.offers].filter(m => m.kind !== 'spell');
  const eaten = bag - left.reduce((n, m) => n + m.attack + m.health - 2, 0);
  assert.equal(eater.attack + eater.health, 2 + eaten, 'the gobbler grew by the meal');
  assert.ok(left.every(m => m.bonusAttack === 1 && m.bonusHealth === 1), 'the feeder fattened the rest of the counter');
  assert.equal([...g.board].find(m => m.id === butcher.id)!.attack, 5, 'the butcher reacts to the meal');
  const before = g.tavern.offers.length;
  onBoard(g, 'ab-gargoyle');
  endRecruitTurn(dg);
  assert.equal(g.tavern.offers.length, Math.max(1, before - 3), 'feeder, butcher and gobbler each ate at end of turn');
  assert.ok([...g.board].find(m => m.id === feeder.id)!.attack > 2, 'the feeder ate too');
  // Gluttony targets the dropped slot; an empty counter refuses the spell.
  const glut = offer(g, 'ab-spell-gluttony');
  g.gold = 10; tryBuy(dg, glut);
  const spare = offer(g, 'ab-drunk');
  const hp = [...g.board][0]!.health;
  assert.equal(tryPlayCard(dg, glut, 0).ok, true);
  assert.equal([...g.board][0]!.health, hp + 3, 'the leftmost minion ate the drunk');
  assert.ok(![...g.tavern.offers].some(m => m.id === spare));
});

test('wheel of fate spins once per turn and every wedge pays out through a tavern lever', () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 40; seed++) {
    const p = player(`w${seed}`, 10);
    onBoard(p, 'ab-bruiser');
    p.hand.push(createMinionState(def('ab-ward')!, `h${seed}`, p.sessionId));
    const d = { ...deps(p, { ...DEFAULT_RULES, wheel: true }), rng: createRng(seed) };
    const before = { gold: p.gold, hp: p.hero.health, up: p.upgradeCost };
    beginRecruitTurn(d, 4);
    assert.ok(p.wheelBonus, 'a wedge was recorded');
    seen.add(p.wheelBonus);
    const board = [...p.board][0]!;
    const changed = p.gold !== 6 || p.bankedGold > 0 || board.bonusAttack > 0 || [...p.hand].some(m => m.bonusAttack > 0) || p.freeRerolls > 0 || p.upgradeCost < before.up - 1 || board.keywords.length > 0 || p.hand.length > 1 || p.hero.health !== before.hp;
    assert.ok(changed, `wedge ${p.wheelBonus} did something`);
  }
  assert.ok(seen.size >= 6, 'the wheel is not stuck on one wedge');
  const plain = player('plain', 10);
  beginRecruitTurn(deps(plain), 4);
  assert.equal(plain.wheelBonus, '', 'no wheel outside the anomaly');
});
