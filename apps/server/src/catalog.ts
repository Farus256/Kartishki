import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { starterCards, validateCard, starterHeroes, validateHero, starterAutoBattlerMinions, starterAutoBattlerHeroes, starterLeveling, validateAutoBattlerMinion, validateAutoBattlerHero, validateAutoBattlerCopy, validatePlayerLeveling, validateMenuMusic, emptyMenuMusic, type HeroDefinition, type Catalog, type CardDefinition, type AutoBattlerMinionDef, type AutoBattlerHeroDef, type AutoBattlerCopy, type PlayerLeveling, type MenuMusic } from '@kartishki/shared';

export class CatalogStore {
  private catalog: Catalog = { version: 1, cards: structuredClone(starterCards), heroes: structuredClone(starterHeroes), autoBattlerMinions: structuredClone(starterAutoBattlerMinions), autoBattlerHeroes: structuredClone(starterAutoBattlerHeroes), playerLeveling: structuredClone(starterLeveling) };
  constructor(private file = resolve('data/catalog.json')) {
    if (existsSync(file)) {
      const data: Catalog = JSON.parse(readFileSync(file, 'utf8'));
      if (!Number.isInteger(data.version) || data.version < 1 || !Array.isArray(data.cards) || !data.cards.length || data.cards.length > 30 || !data.cards.every(validateCard) || new Set(data.cards.map(c=>c.id)).size !== data.cards.length) throw new Error('Invalid persisted catalog');
      if (data.heroes && (data.heroes.length < 2 || data.heroes.length > 30 || !data.heroes.every(validateHero) || new Set(data.heroes.map(h => h.id)).size !== data.heroes.length)) throw new Error('Invalid heroes');
      if (data.autoBattlerMinions && !validAutoBattlerMinions(data.autoBattlerMinions)) throw new Error('Invalid auto-battler minions');
      if (data.autoBattlerHeroes && !validAutoBattlerHeroes(data.autoBattlerHeroes)) throw new Error('Invalid auto-battler heroes');
      if (data.autoBattlerCopy && !validateAutoBattlerCopy(data.autoBattlerCopy)) throw new Error('Invalid auto-battler copy');
      if (data.playerLeveling && !validatePlayerLeveling(data.playerLeveling)) throw new Error('Invalid player leveling');
      if (data.menuMusic && !validateMenuMusic(data.menuMusic)) throw new Error('Invalid menu music');
      this.catalog = { ...data, heroes: data.heroes ?? structuredClone(starterHeroes), autoBattlerMinions: data.autoBattlerMinions ?? structuredClone(starterAutoBattlerMinions), autoBattlerHeroes: data.autoBattlerHeroes ?? structuredClone(starterAutoBattlerHeroes), playerLeveling: data.playerLeveling ?? structuredClone(starterLeveling), menuMusic: data.menuMusic ?? structuredClone(emptyMenuMusic) };
    }
  }
  snapshot(): Catalog { return structuredClone({ ...this.catalog, autoBattlerMinions: this.catalog.autoBattlerMinions ?? structuredClone(starterAutoBattlerMinions), autoBattlerHeroes: this.catalog.autoBattlerHeroes ?? structuredClone(starterAutoBattlerHeroes), playerLeveling: this.catalog.playerLeveling ?? structuredClone(starterLeveling), menuMusic: this.catalog.menuMusic ?? structuredClone(emptyMenuMusic) }); }
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
    if (minions.length >= 40) throw new Error('catalogFull');
    const nextList = [...minions, structuredClone(minion)];
    if (minion.deathrattle && !nextList.some(m => m.id === minion.deathrattle!.summonId)) throw new Error('invalidCard');
    const next = { ...this.catalog, version: version + 1, autoBattlerMinions: nextList };
    mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(`${this.file}.tmp`, JSON.stringify(next)); renameSync(`${this.file}.tmp`, this.file);
    this.catalog = next; return this.snapshot();
  }
  publishAutoBattlerHero(hero: AutoBattlerHeroDef, version: number) {
    if (!validateAutoBattlerHero(hero)) throw new Error('invalidHero');
    if (version !== this.catalog.version) throw new Error('catalogConflict');
    const current = this.catalog.autoBattlerHeroes ?? starterAutoBattlerHeroes;
    const heroes = current.filter(h => h.id !== hero.id);
    if (heroes.length >= 16) throw new Error('catalogFull');
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
  publishAutoBattlerCopy(copy: AutoBattlerCopy, version: number) {
    if (!validateAutoBattlerCopy(copy)) throw new Error('invalidCard');
    if (version !== this.catalog.version) throw new Error('catalogConflict');
    const next = { ...this.catalog, version: version + 1, autoBattlerCopy: structuredClone(copy) };
    mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(`${this.file}.tmp`, JSON.stringify(next)); renameSync(`${this.file}.tmp`, this.file);
    this.catalog = next; return this.snapshot();
  }
}

function validAutoBattlerMinions(list: AutoBattlerMinionDef[]) {
  if (list.length < 1 || list.length > 40 || !list.every(validateAutoBattlerMinion) || new Set(list.map(m => m.id)).size !== list.length) return false;
  const ids = new Set(list.map(m => m.id));
  return list.every(m => !m.deathrattle || ids.has(m.deathrattle.summonId));
}

function validAutoBattlerHeroes(list: AutoBattlerHeroDef[]) {
  return list.length >= 2 && list.length <= 16 && list.every(validateAutoBattlerHero) && new Set(list.map(h => h.id)).size === list.length;
}
export const catalogStore = new CatalogStore(process.env.CATALOG_FILE);
