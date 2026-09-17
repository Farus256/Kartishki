import { CosmeticBrowser } from '../cosmetics/CosmeticBrowser';

/** Shop tab: every cosmetic with a live preview. Prices come from the shared COSMETICS table; the server charges. */
export function CosmeticsStall() {
  return <CosmeticBrowser mode="shop" />;
}
