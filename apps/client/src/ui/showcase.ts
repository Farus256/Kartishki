import { starterCards, type CardDefinition } from '@kartishki/shared';
import type { Rarity } from './rarity';

/**
 * Promo cards for the landing page. Real catalog entries are preferred; when a tier has no card
 * yet, a relabelled clone stands in so the rarity showcase always has all three frames.
 */
export function showcaseCards(catalog: CardDefinition[], tiers: Rarity[]): CardDefinition[] {
  const pool = catalog.length ? catalog : starterCards;
  return tiers.map((rarity, index) => {
    const real = pool.find(card => card.rarity === rarity);
    if (real) return real;
    const stand = pool[index % pool.length];
    return { ...structuredClone(stand), id: `${stand.id}-${rarity}-promo`, rarity };
  });
}
