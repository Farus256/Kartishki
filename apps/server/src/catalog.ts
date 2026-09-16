import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { abTribes, starterCards, validateCard, starterHeroes, validateHero, starterAutoBattlerMinions, starterAutoBattlerHeroes, starterLeveling, validateAutoBattlerMinion, validateAutoBattlerHero, validateAutoBattlerCopy, validatePlayerLeveling, coercePlayerLeveling, validateMenuMusic, emptyMenuMusic, defaultShop, resolveShop, validateShopConfig, validateCardSet, setFairness, cardSetSummary, type HeroDefinition, type Catalog, type CardDefinition, type AutoBattlerMinionDef, type AutoBattlerHeroDef, type AutoBattlerCopy, type PlayerLeveling, type MenuMusic, type ShopConfig, type CardSet, type CardSetSummary } from '@kartishki/shared';
import { catalogFile } from './catalogFile';

export class CatalogStore {
  private catalog: Catalog = { version: 1, cards: structuredClone(starterCards), heroes: structuredClone(starterHeroes), autoBattlerMinions: structuredClone(starterAutoBattlerMinions), autoBattlerHeroes: structuredClone(starterAutoBattlerHeroes), playerLeveling: structuredClone(starterLeveling) };
  constructor(private file = catalogFile()) {
    if (existsSync(file)) {
      const data: Catalog = JSON.parse(readFileSync(file, 'utf8'));
      if (!Number.isInteger(data.version) || data.version < 1 || !Array.isArray(data.cards) || !data.cards.length || data.cards.length > 30 || !data.cards.every(validateCard) || new Set(data.cards.map(c=>c.id)).size !== data.cards.length) throw new Error('Invalid persisted catalog');
      if (data.heroes && (data.heroes.length < 2 || data.heroes.length > 30 || !data.heroes.every(validateHero) || new Set(data.heroes.map(h => h.id)).size !== data.heroes.length)) throw new Error('Invalid heroes');
      if (data.autoBattlerMinions && !validAutoBattlerMinions(data.autoBattlerMinions)) throw new Error('Invalid auto-battler minions');
      if (data.autoBattlerHeroes && !validAutoBattlerHeroes(data.autoBattlerHeroes)) throw new Error('Invalid auto-battler heroes');
      if (data.autoBattlerCopy && !validateAutoBattlerCopy(data.autoBattlerCopy)) throw new Error('Invalid auto-battler copy');
      if (data.playerLeveling) {
        const leveling = coercePlayerLeveling(data.playerLeveling);
        if (!leveling) throw new Error('Invalid player leveling');
        data.playerLeveling = leveling;
      }
      if (data.menuMusic && !validateMenuMusic(data.menuMusic)) throw new Error('Invalid menu music');
      if (data.shop && !validateShopConfig(data.shop)) throw new Error('Invalid shop');
      if (data.cardSets && (!Array.isArray(data.cardSets) || data.cardSets.length > 50 || !data.cardSets.every(validateCardSet) || new Set(data.cardSets.map(s => s.id)).size !== data.cardSets.length)) throw new Error('Invalid card sets');
      this.catalog = { ...data, heroes: data.heroes ?? structuredClone(starterHeroes), autoBattlerMinions: mergeById(starterAutoBattlerMinions, data.autoBattlerMinions), autoBattlerHeroes: mergeById(starterAutoBattlerHeroes, data.autoBattlerHeroes), playerLeveling: data.playerLeveling ?? structuredClone(starterLeveling), menuMusic: data.menuMusic ?? structuredClone(emptyMenuMusic), shop: data.shop ?? structuredClone(defaultShop) };
    }
  }
  snapshot(): Catalog { return structuredClone({ ...this.catalog, autoBattlerMinions: this.catalog.autoBattlerMinions ?? structuredClone(starterAutoBattlerMinions), autoBattlerHeroes: this.catalog.autoBattlerHeroes ?? structuredClone(starterAutoBattlerHeroes), playerLeveling: this.catalog.playerLeveling ?? structuredClone(starterLeveling), menuMusic: this.catalog.menuMusic ?? structuredClone(emptyMenuMusic), shop: resolveShop(this.catalog.shop) }); }
  publishHero(hero: HeroDefinition, version: number) {
    if (!validateHero(hero) || hero.ability.effectId === 'summon' && !this.catalog.cards.some(c => c.id === hero.ability.cardId)) throw new Error('invalidHero');
    if (version !== this.catalog.version) throw new Error('catalogConflict');
    const heroes = (this.catalog.heroes ?? starterHeroes).filter(h => h.id !== hero.id);
    if (heroes.length >= 30) throw new Error('catalogFull');
    const next = { ...this.catalog, version: version + 1, heroes: [...heroes, structuredClone(hero)] };
    mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(`${this.file}.tmp`, JSON.stringify(next)); renameSync(`${this.file}.tmp`, this.file);
    this.catalog = next; return this.snapshot();
  }
  publish(card: CardDefinition, version: number) {
    if (!validateCard(card)) throw new Error('invalidCard');
    if (card.abilities.some(a => a.effectId === 'summon' && a.params.cardId !== card.id && !this.catalog.cards.some(c => c.id === a.params.cardId))) throw new Error('invalidCard');
    if (version !== this.catalog.version) throw new Error('catalogConflict');
    const cards = this.catalog.cards.filter(c => c.id !== card.id);
    if (cards.length >= 30) throw new Error('catalogFull');
    const next = { ...this.catalog, version: version + 1, cards: [...cards, structuredClone(card)] };
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(next)); renameSync(`${this.file}.tmp`, this.file);
    this.catalog = next; return this.snapshot();
  }
  publishAutoBattlerMinion(minion: AutoBattlerMinionDef, version: number) {
    if (!validateAutoBattlerMinion(minion)) throw new Error('invalidCard');
    if (version !== this.catalog.version) throw new Error('catalogConflict');
    const current = this.catalog.autoBattlerMinions ?? starterAutoBattlerMinions;
    const minions = current.filter(m => m.id !== minion.id);
    if (minions.length >= 200) throw new Error('catalogFull');
    const nextList = [...minions, structuredClone(minion)];
    if (minion.deathrattle && !nextList.some(m => m.id === minion.deathrattle!.summonId)) throw new Error('invalidCard');
    // A tribe must be declared (built-in or in the copy block) before minions can carry it.
    const known = abTribes(this.catalog.autoBattlerCopy);
    if (minion.tribes?.some(id => !known.includes(id))) throw new Error('unknownTribe');
    const next = { ...this.catalog, version: version + 1, autoBattlerMinions: nextList };
    mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(`${this.file}.tmp`, JSON.stringify(next)); renameSync(`${this.file}.tmp`, this.file);
    this.catalog = next; return this.snapshot();
  }
  publishAutoBattlerHero(hero: AutoBattlerHeroDef, version: number) {
    if (!validateAutoBattlerHero(hero)) throw new Error('invalidHero');
    if (version !== this.catalog.version) throw new Error('catalogConflict');
    const current = this.catalog.autoBattlerHeroes ?? starterAutoBattlerHeroes;
    const heroes = current.filter(h => h.id !== hero.id);
    if (heroes.length >= 40) throw new Error('catalogFull');
    const nextList = [...heroes, structuredClone(hero)];
    if (nextList.length < 2) throw new Error('invalidHero');
    const next = { ...this.catalog, version: version + 1, autoBattlerHeroes: nextList };
    mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(`${this.file}.tmp`, JSON.stringify(next)); renameSync(`${this.file}.tmp`, this.file);
    this.catalog = next; return this.snapshot();
  }
  publishPlayerLeveling(leveling: PlayerLeveling, version: number) {
    if (!validatePlayerLeveling(leveling)) throw new Error('invalidLeveling');
    if (version !== this.catalog.version) throw new Error('catalogConflict');
    const next = { ...this.catalog, version: version + 1, playerLeveling: structuredClone(leveling) };
    mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(`${this.file}.tmp`, JSON.stringify(next)); renameSync(`${this.file}.tmp`, this.file);
    this.catalog = next; return this.snapshot();
  }
  publishMenuMusic(menuMusic: MenuMusic, version: number) {
    if (!validateMenuMusic(menuMusic)) throw new Error('invalidAudio');
    if (version !== this.catalog.version) throw new Error('catalogConflict');
    const next = { ...this.catalog, version: version + 1, menuMusic: structuredClone(menuMusic) };
    mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(`${this.file}.tmp`, JSON.stringify(next)); renameSync(`${this.file}.tmp`, this.file);
    this.catalog = next; return this.snapshot();
  }
  publishShop(shop: ShopConfig, version: number) {
    if (!validateShopConfig(shop)) throw new Error('invalidShop');
    if (version !== this.catalog.version) throw new Error('catalogConflict');
    const next = { ...this.catalog, version: version + 1, shop: structuredClone(shop) };
    mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(`${this.file}.tmp`, JSON.stringify(next)); renameSync(`${this.file}.tmp`, this.file);
    this.catalog = next; return this.snapshot();
  }
  /** A Workshop set: validated, judged for fairness (a broken set is refused), then stored under its id. */
  publishCardSet(set: CardSet, version: number) {
    if (!validateCardSet(set)) throw new Error('invalidSet');
    if (version !== this.catalog.version) throw new Error('catalogConflict');
    if (setFairness(set.minions).grade === 'broken') throw new Error('unfairSet');
    const sets = (this.catalog.cardSets ?? []).filter(s => s.id !== set.id);
    if (sets.length >= 50) throw new Error('catalogFull');
    const previous = this.catalog.cardSets?.find(s => s.id === set.id);
    const stored: CardSet = { ...structuredClone(set), version: previous ? previous.version + 1 : Math.max(1, set.version) };
    const next = { ...this.catalog, version: version + 1, cardSets: [...sets, stored] };
    mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(`${this.file}.tmp`, JSON.stringify(next)); renameSync(`${this.file}.tmp`, this.file);
    this.catalog = next; return this.snapshot();
  }
  removeCardSet(id: string, version: number) {
    if (version !== this.catalog.version) throw new Error('catalogConflict');
    if (!this.catalog.cardSets?.some(s => s.id === id)) throw new Error('invalidSet');
    const next = { ...this.catalog, version: version + 1, cardSets: this.catalog.cardSets.filter(s => s.id !== id) };
    mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(`${this.file}.tmp`, JSON.stringify(next)); renameSync(`${this.file}.tmp`, this.file);
    this.catalog = next; return this.snapshot();
  }
  /** Lobby list: summaries only, no clone of every set's minions. */
  cardSetSummaries(): CardSetSummary[] {
    return (this.catalog.cardSets ?? []).map(cardSetSummary);
  }
  cardSet(id: string): CardSet | undefined {
    const set = this.catalog.cardSets?.find(s => s.id === id);
    return set ? structuredClone(set) : undefined;
  }
  publishAutoBattlerCopy(copy: AutoBattlerCopy, version: number) {
    if (!validateAutoBattlerCopy(copy)) throw new Error('invalidCard');
    if (version !== this.catalog.version) throw new Error('catalogConflict');
    const next = { ...this.catalog, version: version + 1, autoBattlerCopy: structuredClone(copy) };
    mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(`${this.file}.tmp`, JSON.stringify(next)); renameSync(`${this.file}.tmp`, this.file);
    this.catalog = next; return this.snapshot();
  }
}

/**
 * Starters merged with what the editor published: a published entry overrides the starter's
 * fields (art, stats, copy) but inherits the fields the editor never wrote (effects, spells);
 * starters the editor never touched are appended.
 */
function mergeById<T extends { id: string }>(starters: T[], published: T[] | undefined): T[] {
  if (!published?.length) return structuredClone(starters);
  const base = new Map(structuredClone(starters).map(item => [item.id, item]));
  const merged = published.map(item => ({ ...base.get(item.id), ...structuredClone(item) }));
  const seen = new Set(published.map(item => item.id));
  return [...merged, ...[...base.values()].filter(item => !seen.has(item.id))];
}

function validAutoBattlerMinions(list: AutoBattlerMinionDef[]) {
  if (list.length < 1 || list.length > 200 || !list.every(validateAutoBattlerMinion) || new Set(list.map(m => m.id)).size !== list.length) return false;
  const ids = new Set(list.map(m => m.id));
  return list.every(m => !m.deathrattle || ids.has(m.deathrattle.summonId));
}

function validAutoBattlerHeroes(list: AutoBattlerHeroDef[]) {
  return list.length >= 2 && list.length <= 40 && list.every(validateAutoBattlerHero) && new Set(list.map(h => h.id)).size === list.length;
}
export const catalogStore = new CatalogStore();
