import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultShop, resolveShop, validateShopConfig, type Catalog, type ShopConfig, type ShopPrize, type ShopProduct } from '@kartishki/shared';

const endpoint = import.meta.env.VITE_SERVER_URL ?? 'http://127.0.0.1:2567';
const KINDS: ShopProduct['kind'][] = ['wheel', 'slots', 'pack', 'chest'];

function list(values: number[]) { return values.join(', '); }
function numbers(text: string, n: number) {
  const values = text.split(/[\s,;]+/).map(Number);
  return values.length === n && values.every(Number.isFinite) ? values : undefined;
}
function prizesText(prizes: ShopPrize[]) { return prizes.map(p => `${p.kind} ${p.amount} ${p.weight}`).join('\n'); }
function parsePrizes(text: string): ShopPrize[] {
  return text.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const [kind, amount, weight] = line.split(/[\s,;]+/);
    return { kind: kind as ShopPrize['kind'], amount: Number(amount), weight: Number(weight) };
  });
}

export function ShopEditor({ nav }: { nav: ReactNode }) {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<Catalog>({ version: 0, cards: [] });
  const [shop, setShop] = useState<ShopConfig>(defaultShop);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try {
      const result = await fetch(`${endpoint}/api/catalog`);
      if (!result.ok) throw new Error();
      const data: Catalog = await result.json();
      setCatalog(data);
      setShop(structuredClone(resolveShop(data.shop)));
      setMessage('catalogLoaded');
    } catch { setMessage('connectionError'); } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  function patchProduct(index: number, patch: Partial<ShopProduct>) {
    setShop(current => ({ ...current, products: current.products.map((p, i) => i === index ? { ...p, ...patch } : p) }));
  }
  async function publish() {
    if (!validateShopConfig(shop)) { setMessage('invalidShop'); return; }
    setBusy(true);
    try {
      const response = await fetch(`${endpoint}/api/shop`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shop, version: catalog.version }) });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error ?? 'publishError'); return; }
      setCatalog(data);
      setShop(structuredClone(resolveShop(data.shop)));
      setMessage('published');
    } catch { setMessage('publishError'); } finally { setBusy(false); }
  }
  return <main className="editor">
    <header><h1>{t('shopEditor')}</h1><div className="editor-nav">{nav}</div></header>
    <p>{t('shopEditorNote')}</p>
    <div className="toolbar">
      <button disabled={busy} onClick={() => void load()}>{t('reloadCatalog')}</button>
      <button type="button" disabled={shop.products.length >= 24} onClick={() => setShop(current => ({ ...current, products: [...current.products, { id: `pack-${Date.now()}`, name: t('shopNewPack'), kind: 'pack', cost: 100, draws: 5, weights: [70, 22, 6, 1.8, .2], prizes: [{ kind: 'cards', amount: 1, weight: 100 }] }] }))}>{t('shopAddProduct')}</button>
    </div>
    <section className="shop-editor">
      {shop.products.map((product, index) => <article className="shop-product" key={index}>
        <label>{t('cardId')}<input value={product.id} maxLength={60} onChange={e => patchProduct(index, { id: e.target.value })} /></label>
        <label>{t('name')}<input value={product.name} maxLength={60} onChange={e => patchProduct(index, { name: e.target.value })} /></label>
        <label>{t('shopKind')}<select value={product.kind} onChange={e => patchProduct(index, { kind: e.target.value as ShopProduct['kind'] })}>{KINDS.map(kind => <option key={kind} value={kind}>{t(`shopKind_${kind}`)}</option>)}</select></label>
        <label>{t('shopCost')}<input type="number" min={1} max={100000} value={product.cost} onChange={e => patchProduct(index, { cost: Number(e.target.value) })} /></label>
        <label>{t('shopDraws')}<input type="number" min={1} max={5} value={product.draws} onChange={e => patchProduct(index, { draws: Number(e.target.value) })} /></label>
        <button type="button" onClick={() => setShop(current => ({ ...current, products: current.products.filter((_, i) => i !== index) }))}>{t('remove')}</button>
        <label>{t('shopRarityOdds')}<input value={list(product.weights)} onChange={e => { const weights = numbers(e.target.value, 5); if (weights) patchProduct(index, { weights }); }} /></label>
        <label>{t('shopPrizes')}<textarea value={prizesText(product.prizes)} onChange={e => patchProduct(index, { prizes: parsePrizes(e.target.value) })} /></label>
      </article>)}
      <article className="shop-product">
        <label>{t('shopSlotWeights')}<input value={list(shop.slots.weights)} onChange={e => { const weights = numbers(e.target.value, 8); if (weights) setShop(current => ({ ...current, slots: { ...current.slots, weights } })); }} /></label>
        <label>{t('shopSlotPair')}<input value={list(shop.slots.pair)} onChange={e => { const pair = numbers(e.target.value, 8); if (pair) setShop(current => ({ ...current, slots: { ...current.slots, pair } })); }} /></label>
        <label>{t('shopSlotTriple')}<input value={list(shop.slots.triple)} onChange={e => { const triple = numbers(e.target.value, 8); if (triple) setShop(current => ({ ...current, slots: { ...current.slots, triple } })); }} /></label>
        <label>{t('shopDuplicatePayouts')}<input value={list(shop.sellPrices)} onChange={e => { const sellPrices = numbers(e.target.value, 5); if (sellPrices) setShop(current => ({ ...current, sellPrices })); }} /></label>
      </article>
    </section>
    <section className="publish">
      <button disabled={busy || !catalog.version || !validateShopConfig(shop)} onClick={() => void publish()}>{t('publish')}</button>
      <p role="status">{message && t(message)}</p>
    </section>
  </main>;
}
