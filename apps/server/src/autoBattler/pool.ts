import {
  DEFAULT_POOL_COPIES,
  PoolStockState,
  type AutoBattlerCatalog,
  type AutoBattlerMinionDef,
  type AutoBattlerRoomState,
} from '@kartishki/shared';
import type { SeededRng } from './rng';

export type PoolStock = { baseId: string; remaining: number; tavernTier: number };

/**
 * Shared shop pool: buy (and tavern rolls) remove copies; sell / player death
 * return them. Discover samples without removing until a pick is confirmed.
 */
export class SharedMinionPool {
  private remaining = new Map<string, number>();
  private capacity = new Map<string, number>();

  constructor(private readonly catalog: AutoBattlerCatalog) {
    this.reset();
  }

  reset(): void {
    this.remaining.clear();
    for (const def of this.catalog.minions) {
      if (def.token || def.generated || def.inTavern === false) continue;
      const copies = def.poolCopies ?? DEFAULT_POOL_COPIES[def.tavernTier] ?? 7;
      this.remaining.set(def.id, copies);
      this.capacity.set(def.id, copies);
    }
  }

  definition(baseId: string): AutoBattlerMinionDef | undefined {
    return this.catalog.minions.find(item => item.id === baseId);
  }

  count(baseId: string): number {
    return this.remaining.get(baseId) ?? 0;
  }

  take(baseId: string): boolean {
    const n = this.remaining.get(baseId) ?? 0;
    if (n <= 0) return false;
    this.remaining.set(baseId, n - 1);
    return true;
  }

  returnCopy(baseId: string): void {
    const def = this.definition(baseId);
    if (!def || def.token || def.generated || def.inTavern === false) return;
    const next = this.count(baseId) + 1;
    if (next > (this.capacity.get(baseId) ?? 0)) throw new Error(`Pool over-return: ${baseId}`);
    this.remaining.set(baseId, next);
  }

  stocks(): PoolStock[] {
    return this.catalog.minions
      .filter(def => !def.token && !def.generated && def.inTavern !== false)
      .map(def => ({ baseId: def.id, remaining: this.count(def.id), tavernTier: def.tavernTier }));
  }

  /** Weighted bag: one entry per remaining copy matching `pred`. */
  private bag(pred: (def: AutoBattlerMinionDef) => boolean, mode: 'shop' | 'discover' = 'shop'): AutoBattlerMinionDef[] {
    const items: AutoBattlerMinionDef[] = [];
    for (const def of this.catalog.minions) {
      if (def.token || def.generated) continue;
      if (mode === 'shop' && def.inTavern === false) continue;
      if (mode === 'discover' && def.inDiscover === false) continue;
      if (!pred(def)) continue;
      const copies = this.count(def.id);
      for (let i = 0; i < copies; i++) items.push(def);
    }
    return items;
  }

  /** Roll N shop offers of tavernTier <= maxTier and remove them from the pool; `only` narrows the bag (spell-only slots). */
  roll(maxTier: number, count: number, rng: SeededRng, only?: (def: AutoBattlerMinionDef) => boolean): AutoBattlerMinionDef[] {
    const rolled: AutoBattlerMinionDef[] = [];
    for (let i = 0; i < count; i++) {
      const bag = this.bag(def => def.tavernTier <= maxTier && (!only || only(def)));
      if (!bag.length) break;
      const pick = rng.pick(bag);
      this.take(pick.id);
      rolled.push(pick);
    }
    return rolled;
  }

  /**
   * Sample unique Discover options from (tier) without removing copies.
   * Prefers the exact tier, then falls back to <= tier if the bag is thin.
   */
  sampleDiscover(tier: number, count: number, rng: SeededRng): AutoBattlerMinionDef[] {
    const target = Math.min(6, Math.max(1, tier));
    const unique = (pred: (def: AutoBattlerMinionDef) => boolean) => {
      const seen = new Set<string>();
      const options: AutoBattlerMinionDef[] = [];
      const bag = this.bag(pred, 'discover');
      const order = [...bag];
      for (let i = order.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
      for (const def of order) {
        if (seen.has(def.id)) continue;
        seen.add(def.id);
        options.push(def);
        if (options.length >= count) break;
      }
      return options;
    };
    const exact = unique(def => def.tavernTier === target);
    if (exact.length >= count) return exact;
    const fallback = unique(def => def.tavernTier < target);
    return [...exact, ...fallback].slice(0, count);
  }

  syncToState(state: AutoBattlerRoomState): void {
    const stocks = this.stocks();
    // A lobby that switches to a smaller set leaves no stale rows behind.
    while (state.pool.length > stocks.length) state.pool.pop();
    for (const [index, stock] of stocks.entries()) {
      const row = state.pool[index] ?? new PoolStockState();
      row.baseId = stock.baseId;
      row.remaining = stock.remaining;
      row.tavernTier = stock.tavernTier;
      if (!state.pool[index]) state.pool.push(row);
    }
  }
}
