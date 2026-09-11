import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { starterCards, validateCard, type Catalog, type CardDefinition } from '@kartishki/shared';

export class CatalogStore {
  private catalog: Catalog = { version: 1, cards: structuredClone(starterCards) };
  constructor(private file = resolve('data/catalog.json')) {
    if (existsSync(file)) {
      const data: Catalog = JSON.parse(readFileSync(file, 'utf8'));
      if (!Number.isInteger(data.version) || data.version < 1 || !Array.isArray(data.cards) || !data.cards.length || data.cards.length > 30 || !data.cards.every(validateCard) || new Set(data.cards.map(c=>c.id)).size !== data.cards.length) throw new Error('Invalid persisted catalog');
      this.catalog = data;
    }
  }
  snapshot(): Catalog { return structuredClone(this.catalog); }
  publish(card: CardDefinition, version: number) {
    if (!validateCard(card)) throw new Error('invalidCard');
    if (version !== this.catalog.version) throw new Error('catalogConflict');
    const cards = this.catalog.cards.filter(c => c.id !== card.id);
    if (cards.length >= 30) throw new Error('catalogFull');
    const next = { version: version + 1, cards: [...cards, structuredClone(card)] };
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(next)); renameSync(`${this.file}.tmp`, this.file);
    this.catalog = next; return this.snapshot();
  }
}
export const catalogStore = new CatalogStore(process.env.CATALOG_FILE);
