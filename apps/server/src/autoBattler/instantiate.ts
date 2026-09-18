import {
  AUTO_BATTLER,
  AutoBattlerMinionState,
  minionTribes,
  printedStats,
  type AutoBattlerMinionDef,
} from '@kartishki/shared';

export function fillMinion(m: AutoBattlerMinionState, def: AutoBattlerMinionDef, id: string, owner: string, golden = false): AutoBattlerMinionState {
  const printed = printedStats(def, golden);
  m.id = id;
  m.cardId = def.id;
  m.baseId = def.id;
  m.kind = def.spell ? 'spell' : 'minion';
  m.attack = printed.attack;
  m.health = printed.health;
  m.maxHealth = printed.health;
  m.tavernTier = def.tavernTier;
  m.golden = golden;
  m.owner = owner;
  m.bonusAttack = 0;
  m.bonusHealth = 0;
  m.poolCopies = 0;
  m.tripleReward = false;
  m.cost = 0;
  m.tempAttack = 0;
  m.tempHealth = 0;
  while (m.keywords.length) m.keywords.pop();
  for (const keyword of printed.keywords) m.keywords.push(keyword);
  while (m.tribes.length) m.tribes.pop();
  for (const tribe of minionTribes(def)) m.tribes.push(tribe);
  return m;
}

export function createMinionState(def: AutoBattlerMinionDef, id: string, owner: string, golden = false): AutoBattlerMinionState {
  return fillMinion(new AutoBattlerMinionState(), def, id, owner, golden);
}

export function createDiscoverSpell(id: string, owner: string): AutoBattlerMinionState {
  const card = new AutoBattlerMinionState();
  card.id = id;
  card.cardId = AUTO_BATTLER.DISCOVER_SPELL_ID;
  card.baseId = AUTO_BATTLER.DISCOVER_SPELL_ID;
  card.kind = 'spell';
  card.owner = owner;
  return card;
}

export function cloneMinionState(source: AutoBattlerMinionState, id: string): AutoBattlerMinionState {
  const copy = new AutoBattlerMinionState();
  copy.id = id;
  copy.cardId = source.cardId;
  copy.baseId = source.baseId;
  copy.kind = source.kind;
  copy.attack = source.attack;
  copy.health = source.health;
  copy.maxHealth = source.maxHealth;
  copy.tavernTier = source.tavernTier;
  copy.golden = source.golden;
  copy.owner = source.owner;
  copy.bonusAttack = source.bonusAttack;
  copy.bonusHealth = source.bonusHealth;
  copy.poolCopies = source.poolCopies;
  copy.tripleReward = source.tripleReward;
  copy.cost = source.cost;
  copy.tempAttack = source.tempAttack;
  copy.tempHealth = source.tempHealth;
  for (const keyword of source.keywords) copy.keywords.push(keyword);
  for (const tribe of source.tribes) copy.tribes.push(tribe);
  return copy;
}

export function isShopMinion(card: { kind: string; cardId: string }): boolean {
  return card.kind !== 'spell' && card.cardId !== AUTO_BATTLER.DISCOVER_SPELL_ID;
}

type SchemaList<T> = { length: number; pop(): T | undefined; push(item: T): number; [Symbol.iterator](): Iterator<T> };

/**
 * Replace the contents of a replicated array. ArraySchema splice-inserts in the middle decode as
 * appends on a view-filtered client (schema 3.x), so any reorder or mid-insert must be rewritten
 * as pop-all + push in the new order — that round-trips correctly.
 */
export function rewriteList(list: SchemaList<AutoBattlerMinionState>, items: readonly AutoBattlerMinionState[]): void {
  // Fresh instances: re-adding a ref the decoder just released in the same patch is dropped.
  const clones = items.map(item => cloneMinionState(item, item.id));
  while (list.length) list.pop();
  for (const item of clones) list.push(item);
}

export function insertAt(list: SchemaList<AutoBattlerMinionState>, index: number, item: AutoBattlerMinionState): void {
  const at = Math.max(0, Math.min(index, list.length));
  if (at >= list.length) { list.push(item); return; }
  const items = [...list];
  items.splice(at, 0, item);
  rewriteList(list, items);
}
