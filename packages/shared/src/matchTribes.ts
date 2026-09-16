import { abTribes, type AutoBattlerCatalog, type AutoBattlerMinionDef, type AutoBattlerTribe } from './autoBattler';

/** Hearthstone rule: one table plays with a handful of the tavern's tribes; minions of the others sit out. */
export const AB_MATCH_TRIBES = 5;

const inTavern = (m: AutoBattlerMinionDef) => !m.token && !m.generated && m.inTavern !== false;
const tribesOf = (m: AutoBattlerMinionDef): AutoBattlerTribe[] => m.tribes?.length ? m.tribes : ['neutral'];

/** Tribes that actually have tavern minions (neutral excluded: it always plays). */
export function tavernTribes(catalog: Pick<AutoBattlerCatalog, 'minions' | 'copy'>): AutoBattlerTribe[] {
  const used = new Set(catalog.minions.filter(inTavern).flatMap(tribesOf));
  return abTribes(catalog.copy).filter(id => id !== 'neutral' && used.has(id));
}

/** Pick the table's tribes with a seeded `int(n)` in [0, n). Fewer than the limit available → all of them. */
export function pickMatchTribes(catalog: Pick<AutoBattlerCatalog, 'minions' | 'copy'>, int: (n: number) => number, limit = AB_MATCH_TRIBES): AutoBattlerTribe[] {
  const pool = tavernTribes(catalog);
  for (let i = pool.length - 1; i > 0; i--) { const j = int(i + 1); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
  return pool.slice(0, limit).sort();
}

/** The same catalog with minions outside the picked tribes taken out of the tavern and Discover. Summons still resolve. */
export function restrictCatalogToTribes(catalog: AutoBattlerCatalog, tribes: readonly AutoBattlerTribe[]): AutoBattlerCatalog {
  const allowed = new Set([...tribes, 'neutral']);
  return {
    ...catalog,
    minions: catalog.minions.map(m => inTavern(m) && !tribesOf(m).some(t => allowed.has(t)) ? { ...m, inTavern: false, inDiscover: false } : m),
  };
}
