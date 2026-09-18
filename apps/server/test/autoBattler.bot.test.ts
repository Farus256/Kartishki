import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_BATTLER,
  AutoBattlerPlayerState,
  HeroState,
  initialUpgradeCost,
  starterAutoBattlerCatalog,
  starterAutoBattlerHeroes,
  tavernSizeForTier,
  type AutoBattlerCatalog,
} from '@kartishki/shared';
import { SharedMinionPool } from '../src/autoBattler/pool';
import { createRng, hashSeed } from '../src/autoBattler/rng';
import { createDefaultRegistry } from '../src/autoBattler/keywords';
import { createMinionState } from '../src/autoBattler/instantiate';
import { beginRecruitTurn, endRecruitTurn, type RecruitDeps } from '../src/autoBattler/recruit';
import { DEFAULT_RULES, type TavernRules } from '../src/autoBattler/effects';
import { BattlegroundsBot, BOT_MAX_ACTIONS, desiredTier, executeBotAction, type BotAction, type BotView } from '../src/autoBattler/bot';
import { desiredOrder, nextMove } from '../src/autoBattler/bot/positioning';
import { minionValue } from '../src/autoBattler/bot/evaluate';

const catalog: AutoBattlerCatalog = starterAutoBattlerCatalog;
const defFor = (id: string) => catalog.minions.find(m => m.id === id);
const registry = createDefaultRegistry(catalog.minions);
const TRIBES = ['beast', 'mech', 'pirate', 'undead', 'dragon', 'demon'];

function seat(id: string, heroId = 'ab-hero-captain', rules: TavernRules = DEFAULT_RULES) {
  const pool = new SharedMinionPool(catalog);
  const player = new AutoBattlerPlayerState();
  player.sessionId = id;
  player.hero = new HeroState();
  const hero = starterAutoBattlerHeroes.find(h => h.id === heroId)!;
  player.hero.heroId = hero.id; player.hero.health = player.hero.maxHealth = hero.health;
  Object.assign(player.hero.power, hero.power);
  player.upgradeCost = initialUpgradeCost(1);
  player.tavern.size = tavernSizeForTier(1);
  let serial = 0;
  const deps = (turn: number): RecruitDeps => ({ player, pool, rng: createRng(hashSeed([id, turn, serial])), nextId: () => `${id}-${++serial}`, registry, defFor, rules });
  const bot = new BattlegroundsBot(id);
  const view = (turn: number): BotView => ({ me: player, turn, rules, tribes: TRIBES, defFor });
  /** One full recruit turn: begin, let the bot act until it ends, run end-of-turn effects. Returns the actions taken. */
  const playTurn = (turn: number) => {
    beginRecruitTurn(deps(turn), turn);
    const taken: BotAction[] = [];
    for (let n = 0; n < BOT_MAX_ACTIONS + 5; n++) {
      const action = bot.planAction(view(turn));
      taken.push(action);
      if (action.kind === 'end') break;
      const result = executeBotAction(deps(turn), action);
      assert.ok(result.ok, `${action.kind} rejected: ${!result.ok && result.code} on turn ${turn}`);
    }
    endRecruitTurn(deps(turn));
    return taken;
  };
  return { player, pool, deps, bot, view, playTurn };
}

test('bot buys and plays useful minions from turn one and never spends gold it does not have', () => {
  const s = seat('b1');
  const actions = s.playTurn(1);
  assert.ok(actions.some(a => a.kind === 'buy'), 'turn 1 buys a minion');
  assert.ok(actions.some(a => a.kind === 'play'), 'and plays it');
  assert.equal(s.player.board.length, 1);
  assert.ok(s.player.gold >= 0);
  assert.equal(actions.at(-1)!.kind, 'end');
});

test('bot upgrades the tavern on a sane curve and respects the gold cap', () => {
  const s = seat('b2');
  const tiers: number[] = [];
  for (let turn = 1; turn <= 12; turn++) { s.playTurn(turn); tiers.push(s.player.tavernTier); assert.ok(s.player.gold >= 0); }
  assert.ok(tiers[2]! >= 2, `tier 2 by turn 3 (got ${tiers.join(',')})`);
  assert.ok(tiers[7]! >= 3, `tier 3 by turn 8 (got ${tiers.join(',')})`);
  assert.ok(tiers[11]! >= 4, `tier 4 by turn 12 (got ${tiers.join(',')})`);
  assert.ok(s.player.board.length >= 5, `board fills up over twelve turns (got ${s.player.board.length})`);
  assert.equal(desiredTier(1, 40, 40), 1);
  assert.ok(desiredTier(12, 40, 40) >= 4);
  assert.ok(desiredTier(12, 8, 40) < desiredTier(12, 40, 40), 'a bleeding hero levels slower');
});

test('bot avoids refresh spam: bounded rerolls per turn and none while saving for the tavern', () => {
  const s = seat('b3');
  for (let turn = 1; turn <= 8; turn++) {
    const actions = s.playTurn(turn);
    const rerolls = actions.filter(a => a.kind === 'reroll').length;
    assert.ok(rerolls <= 3, `turn ${turn}: ${rerolls} rerolls`);
    assert.ok(actions.length <= BOT_MAX_ACTIONS + 1);
  }
});

test('bot sells the weakest body when the board is full and a better card is in hand', () => {
  const s = seat('b4');
  const d = s.deps(9);
  beginRecruitTurn(d, 9);
  // Seven different tokens: identical ones would merge into a golden and free the board on their own.
  const fillers = ['ab-token-rat', 'ab-token-skel', 'ab-token-microbot', 'ab-token-hound', 'ab-token-sailor', 'ab-token-imp', 'ab-token-drake'];
  for (const [i, id] of fillers.entries()) s.player.board.push(createMinionState(defFor(id)!, `w${i}`, 'b4'));
  const big = createMinionState(defFor('ab-token-bouncer')!, 'big', 'b4');
  big.attack = 12; big.health = 12; big.maxHealth = 12;
  s.player.hand.push(big);
  s.player.gold = 0;
  while (s.player.tavern.offers.length) s.player.tavern.offers.pop();
  const first = s.bot.planAction(s.view(9));
  assert.equal(first.kind, 'sell');
  assert.ok(executeBotAction(d, first).ok);
  const second = s.bot.planAction(s.view(9));
  assert.deepEqual(second, { kind: 'play', cardId: 'big', boardIndex: 6 });
  assert.ok(executeBotAction(d, second).ok);
  assert.ok(s.player.board.some(m => m.id === 'big'));
  assert.equal(s.player.board.length, AUTO_BATTLER.BOARD_LIMIT);
});

test('bot uses an active hero power where it helps and skips it where it does not', () => {
  // Brute: +3 Attack to a board minion for $1 — used once there is a body and spare gold.
  const brute = seat('b5', 'ab-hero-brute');
  const d = brute.deps(4);
  beginRecruitTurn(d, 4);
  brute.player.board.push(createMinionState(defFor('ab-ward')!, 'ward', 'b5'));
  while (brute.player.tavern.offers.length) brute.player.tavern.offers.pop();
  brute.player.gold = 1;
  const action = brute.bot.planAction(brute.view(4));
  assert.deepEqual(action, { kind: 'heroPower', targetId: 'ward' });
  assert.ok(executeBotAction(d, action).ok);
  assert.equal(brute.player.board[0]!.attack, 4);
  // Tinker: Divine Shield for $2 — not worth it on a 1-attack body, and never twice.
  const tinker = seat('b6', 'ab-hero-tinker');
  const t = tinker.deps(4);
  beginRecruitTurn(t, 4);
  tinker.player.board.push(createMinionState(defFor('ab-ward')!, 'ward2', 'b6'));
  while (tinker.player.tavern.offers.length) tinker.player.tavern.offers.pop();
  tinker.player.gold = 2;
  assert.equal(tinker.bot.planAction(tinker.view(4)).kind, 'end');
});

test('bot plays discover and picks the strongest option, staying inside the shared pool', () => {
  const s = seat('b7', 'ab-hero-gambler');
  const d = s.deps(5);
  beginRecruitTurn(d, 5);
  s.player.tavernTier = 3;
  s.player.gold = 2;
  while (s.player.tavern.offers.length) s.player.tavern.offers.pop();
  const power = s.bot.planAction(s.view(5));
  assert.equal(power.kind, 'heroPower');
  assert.ok(executeBotAction(d, power).ok);
  assert.ok(s.player.discoverOpen);
  const pick = s.bot.planAction(s.view(5));
  assert.equal(pick.kind, 'discoverPick');
  const chosen = [...s.player.pendingDiscover].find(m => m.id === (pick as { optionId: string }).optionId)!;
  const ctx = { turn: 5, board: [], hand: [], tribes: TRIBES, rules: DEFAULT_RULES, defFor, turnsLeft: 8 };
  const best = Math.max(...[...s.player.pendingDiscover].map(m => minionValue({ ...m, keywords: [...m.keywords], tribes: [...m.tribes] }, ctx, false)));
  assert.equal(minionValue({ ...chosen, keywords: [...chosen.keywords], tribes: [...chosen.tribes] }, ctx, false), best);
  assert.ok(executeBotAction(d, pick).ok);
  // Every copy the bot holds is accounted for in the pool.
  for (const m of [...s.player.hand, ...s.player.board, ...s.player.tavern.offers]) {
    const def = defFor(m.baseId)!;
    assert.ok(s.pool.count(m.baseId) + m.poolCopies <= (def.poolCopies ?? [0, 16, 15, 13, 11, 9, 7][def.tavernTier]!));
  }
});

test('bot positions the board: disruptors and cleavers left, engines and walls right', () => {
  const board = [
    { id: 'aura', baseId: 'ab-token-1-1', cardId: 'x', kind: 'minion', attack: 2, health: 2, tavernTier: 1, keywords: [], tribes: ['beast'], golden: false },
    { id: 'bait', baseId: 'ab-token-1-1', cardId: 'x', kind: 'minion', attack: 1, health: 3, tavernTier: 1, keywords: ['bait'], tribes: [], golden: false },
    { id: 'cleave', baseId: 'ab-token-1-1', cardId: 'x', kind: 'minion', attack: 6, health: 4, tavernTier: 1, keywords: ['cleave'], tribes: [], golden: false },
    { id: 'egg', baseId: 'ab-egg', cardId: 'ab-egg', kind: 'minion', attack: 0, health: 3, tavernTier: 1, keywords: ['cannotAttack', 'deathrattle'], tribes: ['beast'], golden: false },
  ];
  const defs = (id: string) => id === 'aura' ? undefined : defFor(id);
  const withAura = (id: string) => id === 'ab-token-1-1' ? { ...defFor('ab-token-1-1')!, effects: [{ trigger: 'aura' as const, action: { kind: 'aura' as const, attack: 1 } }] } : defs(id);
  // Only the first minion is an aura source: give it its own definition through baseId.
  const order = desiredOrder(board.map(m => m.id === 'aura' ? { ...m, baseId: 'aura-src' } : m), id => id === 'aura-src' ? withAura('ab-token-1-1') : defFor(id));
  assert.equal(order[0], 'bait');
  assert.equal(order[1], 'cleave');
  assert.equal(order.at(-1), 'aura');
  assert.deepEqual(nextMove(['aura', 'bait', 'cleave', 'egg'], order), { minionId: 'bait', toIndex: 0 });
  assert.equal(nextMove(order, order), undefined);
});

test('bot only ever acts on its own zones and legal actions', () => {
  const s = seat('b8');
  for (let turn = 1; turn <= 6; turn++) {
    const actions = s.playTurn(turn);
    for (const a of actions) {
      if (a.kind === 'buy') assert.ok([...s.player.tavern.offers].every(o => o.owner === 'b8' || o.owner === ''));
      if (a.kind === 'sell' || a.kind === 'move') assert.ok(!('minionId' in a) || a.minionId.startsWith('b8-'));
      if (a.kind === 'play') assert.ok(a.cardId.startsWith('b8-'));
    }
  }
  // The planner never touches the opponent's state: the view carries only public opponent facts.
  const view = s.view(7);
  assert.deepEqual(Object.keys(view).sort(), ['defFor', 'me', 'rules', 'tribes', 'turn']);
});

test('bot chooses economy heroes and tribe powers only when the tribe plays', () => {
  const bot = new BattlegroundsBot('h');
  const pick = (ids: string[], tribes: string[]) => bot.chooseHero(ids.map(id => starterAutoBattlerHeroes.find(h => h.id === id)!), tribes, '')!.id;
  assert.equal(pick(['ab-hero-tycoon', 'ab-hero-alchemist'], TRIBES), 'ab-hero-tycoon');
  assert.equal(pick(['ab-hero-beastmaster', 'ab-hero-alchemist'], ['mech', 'pirate']), 'ab-hero-alchemist');
  assert.equal(pick(['ab-hero-beastmaster', 'ab-hero-alchemist'], ['beast', 'pirate']), 'ab-hero-beastmaster');
});
