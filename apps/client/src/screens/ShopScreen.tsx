import { CasinoGames } from './CasinoGames';
import { CosmeticsStall } from './CosmeticsStall';
import { audioManager } from '../AudioManager';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cosmeticById, pickLoc, shopMixed, shopPrizeLabel, shopProducts, type CardDefinition, type ShopProduct, type ShopResult, type ShopReward } from '@kartishki/shared';
import { CosmeticStage, cosmeticItems } from '../ui/CosmeticCard';
import { useEconomy, type ChestTile } from '../EconomyContext';
import { PortraitPlaceholder } from '../ui/PortraitPlaceholder';
import { Backdrop } from '../ui/Backdrop';
import { CardBack, GameCard } from '../ui/GameCard';
import { InkButton, spring } from '../ui/InkButton';
import { TopBar } from '../ui/TopBar';
import { rarityOrder, rarityStyle } from '../ui/rarity';
import { useCardArt } from '../ui/cardArt';
import { chime, tick } from '../ui/sfx';
import { VfxLayer, rand, pick } from '../cosmetics/vfx';
import '../shop.css';

// Skins open first: they are what the shop is about now; the casino and loot sit behind.
const tabs = ['cosmetics', 'casino', 'packs', 'chests'] as const;
type Tab = typeof tabs[number];
function shopTab(kind?: string): Tab {
  if (kind === 'packs') return 'packs';
  if (kind === 'chests') return 'chests';
  if (kind === 'slots' || kind === 'casino') return 'casino';
  return 'cosmetics';
}

/* ---------------------------------------------------------------------------------------------------------
   Containers as objects. Every product gets a material and a silhouette of its own instead of one recoloured
   tile: packs are a kraft bag, a black foil booster, a gold-foil wrap, a stringed envelope and a garment box;
   chests are a nailed crate, an iron safe, an army ammo box and a hatbox. Unknown ids (shop config edited in the
   Workshop) fall back on their prize table: skins → garment/hatbox, mixed → envelope/ammo, cards → by position.
   --------------------------------------------------------------------------------------------------------- */
export type PackLook = 'kraft' | 'foil' | 'gold' | 'envelope' | 'garment';
export type CaseLook = 'crate' | 'safe' | 'ammo' | 'hatbox';
const PACK_LOOKS: Record<string, PackLook> = { basement: 'kraft', elite: 'foil', ultimate: 'gold', 'mixed-pack': 'envelope', 'wardrobe-pack': 'garment' };
const CASE_LOOKS: Record<string, CaseLook> = { yard: 'crate', vault: 'safe', 'mixed-chest': 'ammo', atelier: 'hatbox' };
export function packLook(product: ShopProduct, index = 0): PackLook {
  return PACK_LOOKS[product.id] ?? (product.prizes.some(p => p.kind === 'cosmetic') ? 'garment' : shopMixed(product) ? 'envelope' : (['kraft', 'foil', 'gold'] as const)[index % 3]!);
}
export function caseLook(product: ShopProduct, index = 0): CaseLook {
  return CASE_LOOKS[product.id] ?? (product.prizes.some(p => p.kind === 'cosmetic') ? 'hatbox' : shopMixed(product) ? 'ammo' : (['crate', 'safe'] as const)[index % 2]!);
}
/** Debris each material sheds when it opens (colour + shape), so a kraft bag spits paper and a foil pack glitter. */
const DEBRIS: Record<PackLook | CaseLook, { colors: string[]; shape: 'shard' | 'star' | 'glow' | 'drop' | 'spark' | 'pixel'; flash: string }> = {
  kraft: { colors: ['#b98352', '#8a5a34', '#e6d6b0'], shape: 'shard', flash: '#ffe9a8' },
  foil: { colors: ['#ffffff', '#c9c2b3', '#62d8ff', '#ff7de9'], shape: 'star', flash: '#dff4ff' },
  gold: { colors: ['#fff3b0', '#ffd66b', '#e0a32a'], shape: 'glow', flash: '#fff3b0' },
  envelope: { colors: ['#e9dfc9', '#c3a45e', '#245037'], shape: 'pixel', flash: '#ffe9a8' },
  garment: { colors: ['#ffb3d9', '#e6c3ff', '#fff0f6'], shape: 'star', flash: '#ffe1ee' },
  crate: { colors: ['#8a5a34', '#5a3a1c', '#c9b58a'], shape: 'shard', flash: '#ffe9a8' },
  safe: { colors: ['#c9c2b3', '#ffd66b', '#ffffff'], shape: 'spark', flash: '#fff3b0' },
  ammo: { colors: ['#6c9a3a', '#c9a04a', '#e9dfc9'], shape: 'pixel', flash: '#eaffb0' },
  hatbox: { colors: ['#ffb3d9', '#fff0f6', '#c9a04a'], shape: 'star', flash: '#ffe1ee' },
};

/** One burst of debris and a light pop from `host`'s centre-top; cleans itself up. */
function openBurst(host: HTMLElement | null, look: PackLook | CaseLook, strength = 1) {
  if (!host || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = new VfxLayer(host, { inset: 140, zIndex: 40, className: 'open-burst' });
  layer.max = 120;
  const w = host.offsetWidth, h = host.offsetHeight, d = DEBRIS[look];
  const n = Math.round(34 * strength);
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + rand(-1.3, 1.3), sp = rand(180, 420) * strength; layer.spawn({ x: w / 2 + rand(-w * .3, w * .3), y: h * .22, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 760, drag: .5, life: rand(.7, 1.2), size: rand(3, 7), size1: rand(2, 5), rot: rand(0, 6.3), spin: rand(-9, 9), shape: d.shape, blend: d.shape === 'glow' || d.shape === 'spark' ? 'lighter' : 'source-over', color: pick(d.colors), alpha: 1, fadeIn: .03, fadeOut: .35 }); }
  for (let i = 0; i < 14; i++) { const a = rand(0, 6.3), sp = rand(120, 260); layer.spawn({ x: w / 2, y: h * .25, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2.2, life: rand(.25, .45), size: rand(1.6, 2.6), size1: .6, shape: 'spark', color: d.flash, alpha: 1, fadeIn: .02, fadeOut: .5 }); }
  layer.spawn({ x: w / 2, y: h * .25, life: .55, size: 40, size1: 140 * strength, color: d.flash, alpha: .9, fadeIn: .05, fadeOut: .8 });
  window.setTimeout(() => layer.destroy(), 1600);
}

/** Openings in this session: the first is played in full, later ones run quicker and offer "open all". */
let openingsThisSession = 0;

export function ShopScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const e = useEconomy();
  const packs = shopProducts(e.shop, 'pack');
  const chests = shopProducts(e.shop, 'chest');
  const [tab, setTab] = useState<Tab>(shopTab(e.opening?.kind));
  const [packId, setPackId] = useState(packs[0]?.id ?? '');
  const [chestId, setChestId] = useState(chests[0]?.id ?? '');
  const pack = packs.find(p => p.id === packId) ?? packs[0];
  const crate = chests.find(p => p.id === chestId) ?? chests[0];
  return <div className="absolute inset-0 overflow-clip">
    <Backdrop />
    <TopBar right={<InkButton size="sm" onClick={onBack}>{t('backToMenu')}</InkButton>} />
    <nav className="shop-tabs" aria-label={t('shopMode')}>
      {tabs.map(key => { const on = tab === key; const locked = !!e.opening && shopTab(e.opening.kind) !== key; return <motion.button key={key} aria-pressed={on} disabled={locked} onClick={() => { setTab(key); e.clearMessage(); }}
        whileHover={locked ? undefined : { y: -3, rotate: on ? -1 : -1.5 }} whileTap={locked ? undefined : { y: 2, scale: .97, rotate: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 26 }}>
        <span>{t(`shopTab_${key}`)}</span>
        {on && <motion.i className="shop-tab-ink" layoutId="shop-tab-ink" aria-hidden transition={{ type: 'spring', stiffness: 560, damping: 36 }} />}
      </motion.button>; })}
    </nav>
    <p role="status" className="absolute right-12 top-[124px] max-w-[620px] text-right font-mono text-[13px] text-blood">{e.message}</p>
    <main className="absolute inset-x-[55px] top-[186px] bottom-[24px]">
      <AnimatePresence mode="wait">
        <motion.div key={tab} className="shop-tab-panel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .16, ease: [.2, .8, .3, 1] }}>
          {tab === 'casino' && <CasinoGames />}
          {tab === 'cosmetics' && <CosmeticsStall />}
          {tab === 'packs' && pack && (e.opening?.kind === 'packs' ? <PackOpening key={e.opening.name} result={e.opening.result} name={e.opening.name} look={packLook(e.opening.result.product ?? pack, packs.findIndex(p => p.id === e.opening?.result.product?.id))} onDone={e.finish} /> : <div className="catalog-layout">
            <div className="catalog-shelf">{packs.map((p, i) => <motion.button key={p.id} className={`product-choice ${p.id === pack.id ? 'chosen' : ''}`} onClick={() => setPackId(p.id)} aria-pressed={p.id === pack.id}
              whileHover={{ y: -8, rotate: -1.2 }} whileTap={{ y: -2, scale: .98 }} transition={{ type: 'spring', stiffness: 420, damping: 24 }}>
              <PackObject product={p} look={packLook(p, i)} compact />
              <strong>{p.name}</strong><span>$ {p.cost} · {t(shopMixed(p) ? 'shopPrizesN' : 'shopCardsN', { count: p.draws })}</span>{(e.inventory[p.id] ?? 0) > 0 && <b className="bonus-label">{t('shopInStock', { count: e.inventory[p.id] })}</b>}
            </motion.button>)}</div>
            <div className="shop-receipt"><span className="eyebrow">{t(shopMixed(pack) ? 'shopEyebrowMixed' : 'shopEyebrowFresh')}</span><h2>{pack.name}</h2>
              <p>{t(shopMixed(pack) ? 'shopPackMixedText' : 'shopPackText')}</p>
              <Odds product={pack} /><PrizeOdds product={pack} />
              <InkButton tone="gold" size="lg" disabled={e.dollars < pack.cost && !(e.inventory[pack.id] > 0)} onClick={() => e.openPack(pack.id)}>{e.inventory[pack.id] > 0 ? t('shopOpenBonusPack') : t('shopBuyPack', { cost: pack.cost })}</InkButton>
            </div>
          </div>)}
          {tab === 'chests' && crate && (e.opening?.kind === 'chests' ? <CaseOpening reel={e.opening.reel} landing={e.opening.landing} result={e.opening.result} look={caseLook(e.opening.result.product ?? crate, chests.findIndex(p => p.id === e.opening?.result.product?.id))} onDone={e.finish} /> : <div className="catalog-layout">
            <div className="catalog-shelf crates">{chests.map((p, i) => <motion.button key={p.id} className={`product-choice ${p.id === crate.id ? 'chosen' : ''}`} onClick={() => setChestId(p.id)} aria-pressed={p.id === crate.id}
              whileHover={{ y: -8, rotate: 1 }} whileTap={{ y: -2, scale: .98 }} transition={{ type: 'spring', stiffness: 420, damping: 24 }}>
              <CaseObject product={p} look={caseLook(p, i)} compact />
              <strong>{p.name}</strong><span>$ {p.cost} · {t(shopMixed(p) ? 'shopOnePrize' : 'shopOneCard')}</span>
            </motion.button>)}</div>
            <div className="shop-receipt"><span className="eyebrow">{t(shopMixed(crate) ? 'crateEyebrowMixed' : 'crateEyebrow')}</span><h2>{crate.name}</h2>
              <p>{t(shopMixed(crate) ? 'crateMixedText' : 'crateText')}</p>
              <Odds product={crate} /><PrizeOdds product={crate} /><DropPreview product={crate} />
              <InkButton tone="gold" size="lg" disabled={e.dollars < crate.cost} onClick={() => e.openCase(crate.id)}>{t('openChest', { cost: crate.cost })}</InkButton>
            </div>
          </div>)}
        </motion.div>
      </AnimatePresence>
    </main>
  </div>;
}
function Odds({ product }: { product: ShopProduct }) {
  const { t } = useTranslation();
  if (shopMixed(product) && product.prizes.every(p => p.kind !== 'cards')) return null;
  return <div className="odds" aria-label={t('dropOdds')}>{rarityOrder.map((r, i) => <span key={r}><i style={{ background: rarityStyle[r].frame }} />{t(r)}<b>{product.weights[i]}%</b></span>)}</div>;
}
function PrizeOdds({ product }: { product: ShopProduct }) {
  if (!shopMixed(product)) return null;
  return <ul className="prize-odds">{product.prizes.map((prize, i) => <li key={i}><span>{shopPrizeLabel(prize)}</span><b>{prize.weight}%</b></li>)}</ul>;
}
function DropPreview({ product }: { product: ShopProduct }) {
  const { catalog } = useEconomy();
  const { t, i18n } = useTranslation();
  if (shopMixed(product)) return null;
  return <details className="drop-preview"><summary>{t('dropPreview')}</summary><div>{catalog.filter(c => product.weights[rarityOrder.indexOf(c.rarity)] > 0).map(c => <p key={c.id}><span style={{ color: rarityStyle[c.rarity].frame }}>{c.name[i18n.language] || c.name.ru} · {t(c.rarity)}</span><b>{(product.weights[rarityOrder.indexOf(c.rarity)] / catalog.filter(d => d.rarity === c.rarity).length).toFixed(2)}%</b></p>)}</div></details>;
}

/**
 * A pack as a thing on the shelf. `.foil-brand` / `.foil-emblem` keep their names (the browser tests and the sealed
 * opening read them), the rest is per-material decoration: crimps, a wax seal, a string button, a ribbon.
 */
export function PackObject({ product, look, compact = false, torn = false }: { product: Pick<ShopProduct, 'name' | 'prizes'> & Partial<ShopProduct>; look: PackLook; compact?: boolean; torn?: boolean }) {
  const { t } = useTranslation();
  const mixed = product.prizes.some(p => p.kind !== 'cards');
  const cosmetic = product.prizes.some(p => p.kind === 'cosmetic');
  return <div className={`pack-obj is-${look} ${compact ? 'compact' : ''} ${torn ? 'is-torn' : ''}`} data-look={look}>
    <div className="pack-lid" aria-hidden><i className="foil-crimp" /><span className="pack-lid-brand">{t(mixed ? 'foilBrandMixed' : 'foilBrand')}</span></div>
    <div className="pack-body">
      <span className="foil-brand">{t(mixed ? 'foilBrandMixed' : 'foilBrand')}</span>
      <div className="foil-emblem"><b>{mixed ? '$' : '◆'}</b></div>
      <strong>{product.name}</strong>
      <small>{t(cosmetic ? 'foilWardrobeSub' : mixed ? 'foilMixedSub' : 'foilSub')}</small>
      <i className="foil-crimp bottom" aria-hidden />
      {look === 'gold' && <i className="pack-seal" aria-hidden />}
      {look === 'envelope' && <i className="pack-string" aria-hidden />}
      {look === 'garment' && <i className="pack-ribbon" aria-hidden />}
      {look === 'kraft' && <i className="pack-stamp" aria-hidden>{t('packStampKraft')}</i>}
      {look === 'foil' && <i className="pack-holo" aria-hidden />}
    </div>
  </div>;
}

/** A chest as a thing on the shelf: crate, safe, ammo box or hatbox; `open` swings/lifts the lid per material. */
export function CaseObject({ product, look, compact = false, open = false, rattle = false }: { product: Pick<ShopProduct, 'name' | 'prizes'>; look: CaseLook; compact?: boolean; open?: boolean; rattle?: boolean }) {
  const { t } = useTranslation();
  const mixed = product.prizes.some(p => p.kind !== 'cards');
  return <div className={`case-obj is-${look} ${compact ? 'compact' : ''} ${open ? 'is-open' : ''} ${rattle ? 'is-rattle' : ''}`} data-look={look}>
    <div className="case-lid" aria-hidden>{look === 'safe' && <i className="case-dial" />}{look === 'safe' && <i className="case-handle" />}{look === 'crate' && <><i className="case-nail" /><i className="case-nail" /><i className="case-nail" /></>}{look === 'ammo' && <i className="case-latch" />}{look === 'hatbox' && <i className="case-bow" />}</div>
    <div className="case-box">
      <span className="case-mark">{look === 'safe' ? '◉' : mixed ? '$' : '◆'}</span>
      <small className="case-stencil">{t(look === 'ammo' ? 'crateContraband' : look === 'safe' ? 'crateSecret' : look === 'hatbox' ? 'crateAtelier' : 'crateFragile')}</small>
      {look === 'crate' && <><i className="case-plank" /><i className="case-plank" /></>}
      {look === 'ammo' && <><i className="case-rope" /><i className="case-rope right" /></>}
      {look === 'hatbox' && <i className="case-stripe" />}
    </div>
    <i className="case-mouth" aria-hidden />
  </div>;
}

function RewardChip({ reward }: { reward: ShopReward }) {
  const { catalog } = useEconomy();
  if (reward.kind === 'card') {
    const card = catalog.find(item => item.id === reward.cardId);
    return card ? <GameCard card={card} scale={.62} hoverable={false} /> : null;
  }
  if (reward.kind === 'duplicate') {
    const card = catalog.find(item => item.id === reward.cardId);
    return <div className="reward-chip is-duplicate">{card?.name.ru ?? 'Карта'} уже в альбоме → ${reward.amount}</div>;
  }
  if (reward.kind === 'cosmetic' || reward.kind === 'cosmeticDuplicate') return <CosmeticChip reward={reward} />;
  return <div className={`reward-chip is-${reward.kind}`}>{reward.kind === 'currency' ? `$${reward.amount}` : `+${reward.amount} XP`}</div>;
}
/** A skin from a pack: its live preview on the stage, or the refund note when it was already owned. */
function CosmeticChip({ reward }: { reward: Extract<ShopReward, { kind: 'cosmetic' | 'cosmeticDuplicate' }> }) {
  const { t, i18n } = useTranslation();
  const cosmetic = cosmeticById(reward.itemId);
  const item = cosmetic && cosmeticItems(cosmetic.kind).find(c => c.shopId === cosmetic.id);
  const name = cosmetic ? pickLoc(cosmetic.name, i18n.language) : reward.itemId;
  if (reward.kind === 'cosmeticDuplicate') return <div className="reward-chip is-duplicate">{t('cosmeticAlready', { name, amount: reward.amount })}</div>;
  return <div className="reward-cosmetic">{item && <CosmeticStage item={item} name={t('guest')} still />}<strong>{name}</strong><small>{t('rewardCosmetic')}</small></div>;
}

/**
 * Pack opening, staged: the sealed pack idles and shivers under the hand (anticipation) → the lid tears off,
 * the body jolts, a flash and a spray of its own material (opening / release) → the cards slide out of the
 * mouth one after another (reveal) → each flip bursts in its rarity colour (secondary). Later openings in the
 * session run the tear faster and offer "open all".
 */
export function PackOpening({ result, name, look, onDone }: { result: ShopResult; name: string; look: PackLook; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const { catalog } = useEconomy();
  const items: { reward: ShopReward; card?: CardDefinition; duplicate?: number }[] = [];
  for (const reward of result.rewards) {
    if (reward.kind === 'card' || reward.kind === 'duplicate') {
      const card = catalog.find(item => item.id === reward.cardId);
      if (card) items.push({ reward, card, duplicate: reward.kind === 'duplicate' ? reward.amount : undefined });
    } else items.push({ reward });
  }
  const [stage, setStage] = useState<'sealed' | 'tearing' | 'open'>('sealed');
  const [flipped, setFlipped] = useState<number[]>([]);
  const [flat, setFlat] = useState<number[]>([]);
  const start = useRef(0);
  const packRef = useRef<HTMLDivElement>(null);
  const quick = useRef(openingsThisSession > 0);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const ripped = stage !== 'sealed';
  const done = stage === 'open' && flipped.length === items.length;
  const dust = items.reduce((sum, item) => sum + (item.duplicate ?? 0), 0);
  const dupes = items.filter(item => item.duplicate != null).length;
  const product = result.product ?? { name, prizes: result.rewards.some(r => r.kind !== 'card' && r.kind !== 'duplicate') ? [{ kind: 'currency' as const, amount: 1, weight: 1 }] : [{ kind: 'cards' as const, amount: 1, weight: 1 }] };
  const tearMs = quick.current ? 420 : 720;
  const rip = () => {
    if (stage !== 'sealed') return;
    setStage('tearing');
    audioManager.play('pack_rip');
    openingsThisSession++;
    timers.current.push(window.setTimeout(() => openBurst(packRef.current, look, quick.current ? .8 : 1), tearMs * .45));
    timers.current.push(window.setTimeout(() => setStage('open'), tearMs));
  };
  const flip = (i: number) => { if (!flipped.includes(i)) { setFlipped(prev => [...prev, i]); chime(); } };
  const flipAll = () => items.forEach((_, i) => timers.current.push(window.setTimeout(() => flip(i), i * 110)));
  const cardStagger = quick.current ? .07 : .12;
  return <div className={`pack-opening is-${look} is-${stage}`} data-testid="pack-opening">
    <h2>{ripped ? t('yourCatch') : name}</h2>
    <AnimatePresence>{stage !== 'open' && <motion.div ref={packRef} className={`sealed-pack ${stage === 'tearing' ? 'is-tearing' : ''}`} exit={{ y: 300, opacity: 0, rotate: 4, transition: { duration: .5, ease: [.6, 0, .8, .4] } }}
      initial={{ y: 40, opacity: 0, rotate: -3 }} animate={stage === 'sealed' ? { y: [0, -4, 0], opacity: 1, rotate: [-1.5, -.5, -1.5], transition: { y: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }, rotate: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: .3 } } } : { y: 0, opacity: 1, rotate: 0 }}
      whileHover={stage === 'sealed' ? { scale: 1.02, rotate: [-1.5, 1, -1, .6, 0], transition: { rotate: { duration: .5 } } } : undefined} whileTap={stage === 'sealed' ? { scale: .97, y: 4 } : undefined}>
      <PackObject product={product} look={look} torn={stage === 'tearing'} />
      <motion.button className="tear-line" aria-label={t('tearPack')} disabled={stage !== 'sealed'} onPointerDown={ev => { start.current = ev.clientX; ev.currentTarget.setPointerCapture(ev.pointerId); }} onPointerUp={ev => { if (Math.abs(ev.clientX - start.current) > 35) rip(); }} onClick={rip} whileHover={{ x: [0, -3, 3, 0] }}>{t('tearLine')}</motion.button>
    </motion.div>}</AnimatePresence>
    {stage === 'open' && <>
      <div className="pack-cards">{items.map((item, i) => <motion.div key={i} initial={{ y: 250, x: (2 - i) * 190, opacity: 0, rotate: (i - 2) * 6, scale: .82 }} animate={{ y: 0, x: 0, opacity: 1, rotate: 0, scale: 1 }} transition={{ ...spring, stiffness: 240, damping: 22, delay: .05 + i * cardStagger }} className="flip-perspective">
        <motion.button aria-label={flipped.includes(i) ? (item.card ? item.card.name[i18n.language] || item.card.name.ru : item.reward.kind === 'currency' ? `$${item.reward.amount}` : item.reward.kind === 'xp' ? `+${item.reward.amount} XP` : t('rewardN', { n: i + 1 })) : t(item.card ? 'flipCardN' : 'flipRewardN', { n: i + 1 })} className={`flip-card ${flat.includes(i) ? 'is-flat' : ''}`} onAnimationComplete={() => { if (flipped.includes(i) && !flat.includes(i)) setFlat(prev => [...prev, i]); }} animate={{ rotateY: flat.includes(i) ? 0 : flipped.includes(i) ? 180 : 0 }} transition={flat.includes(i) ? { duration: 0 } : { type: 'spring', stiffness: 160, damping: 19 }} onClick={() => flip(i)}
          whileHover={flipped.includes(i) ? undefined : { y: -8, rotate: -1.5 }}>
          <div className="flip-front"><CardBack /></div><div className="flip-back">{item.card ? <GameCard card={item.card} hoverable={false} /> : <RewardChip reward={item.reward} />}</div>
        </motion.button>{flipped.includes(i) && <Burst color={item.card ? rarityStyle[item.card.rarity].frame : '#d7c07a'} />}
        {flipped.includes(i) && item.duplicate != null && item.card && <p className="duplicate-note" role="status">{t('alreadyInAlbum', { name: item.card.name[i18n.language] || item.card.name.ru, amount: item.duplicate })}</p>}
      </motion.div>)}</div>
      <p>{done ? (dust ? t('dupesTraded', { count: dupes, dust }) : t('lootInCollection')) : items.length ? t('flipEachCard') : t('takeLoot')}</p>
      <div className="pack-actions">
        {!done && items.length > 1 && <InkButton tone="paper" size="sm" onClick={flipAll}>{t('flipAll')}</InkButton>}
        <InkButton tone="toxic" disabled={!done} onClick={onDone}>{t('toCollection')}</InkButton>
      </div>
    </>}
    {stage === 'sealed' && <p className="tear-hint">{t('tearHint')}</p>}
  </div>;
}
/** Rarity burst behind a flipped card: a bloom of its colour and sixteen chips of it thrown outward. */
function Burst({ color }: { color: string }) {
  return <div className="pointer-events-none absolute inset-0" aria-hidden><motion.div className="absolute inset-0" style={{ boxShadow: `0 0 50px 15px ${color}` }} initial={{ opacity: .8 }} animate={{ opacity: .18 }} transition={{ duration: 1.2 }} />{Array.from({ length: 16 }, (_, i) => <motion.i key={i} className="absolute left-1/2 top-1/2 h-2 w-2" style={{ background: color }} initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos(i * Math.PI / 8) * 160, y: Math.sin(i * Math.PI / 8) * 200, opacity: 0, rotate: 180 }} transition={{ duration: .85 }} />)}</div>;
}

/**
 * Chest opening, staged: the box sits on the floor and rattles (anticipation) → its lid goes the way that
 * material would: the crate lid pops with the nails, the safe door swings on its hinge, the ammo lid flips
 * up, the hatbox lid lifts and tilts (opening) → a flash and debris (release) → the prize reel rises out of
 * the box and spins (reveal) → the prize card lands with its burst (secondary). Clicking the reel — or
 * "skip" — shortens the spin; later openings in the session skip most of the rattle.
 */
function CaseOpening({ reel, landing, result, look, onDone }: { reel: ChestTile[]; landing: number; result: { rewards: ShopReward[]; name: string; product?: ShopProduct }; look: CaseLook; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const { catalog } = useEconomy();
  const [stage, setStage] = useState<'closed' | 'open' | 'reel'>('closed');
  const [done, setDone] = useState(false);
  const [fast, setFast] = useState(false);
  const lastTile = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const quick = useRef(openingsThisSession > 0);
  useEffect(() => {
    openingsThisSession++;
    const rattle = quick.current ? 350 : 1100, lid = quick.current ? 500 : 750;
    const a = window.setTimeout(() => { setStage('open'); audioManager.play('pack_rip'); openBurst(boxRef.current, look, look === 'safe' ? 1.2 : 1); }, rattle);
    const b = window.setTimeout(() => setStage('reel'), rattle + lid);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [look]);
  const prize = result.rewards.find(reward => reward.kind === 'card' || reward.kind === 'duplicate');
  const skin = result.rewards.find(reward => reward.kind === 'cosmetic' || reward.kind === 'cosmeticDuplicate');
  const skinDef = skin ? cosmeticById(skin.itemId) : undefined;
  const skinName = skinDef ? pickLoc(skinDef.name, i18n.language) : '';
  const skinItem = skinDef && cosmeticItems(skinDef.kind).find(c => c.shopId === skinDef.id);
  const prizeCard = prize && catalog.find(card => card.id === prize.cardId);
  const duplicate = prize?.kind === 'duplicate' ? prize.amount : undefined;
  const product = result.product ?? { name: result.name, prizes: [{ kind: 'cards' as const, amount: 1, weight: 1 }] };
  const spinMs = fast ? 1.1 : quick.current ? 4.2 : 5.6;
  return <div className={`case-opening is-${look} is-${stage}`} data-testid="case-opening"><h2>{t(done ? 'caught' : 'ninthLife')}</h2><p>{t(stage === 'reel' ? 'reelPicks' : 'caseLoosening')}</p>
    <div className="case-stage">
      <div ref={boxRef} className="case-holder"><CaseObject product={product} look={look} open={stage !== 'closed'} rattle={stage === 'closed'} /></div>
      <AnimatePresence>{stage === 'reel' && <motion.div className="roulette-window" initial={{ y: 120, opacity: 0, scaleY: .6 }} animate={{ y: 0, opacity: 1, scaleY: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }} onClick={() => { if (!done) setFast(true); }}>
        <div className="roulette-selector" />
        <motion.div className="roulette-ribbon" initial={{ x: 0 }} animate={{ x: -(landing * 168 + 84 - 590) }} transition={{ duration: spinMs, ease: [.08, .66, .12, 1] }} onUpdate={latest => { const tile = Math.floor(Math.abs(Number(latest.x)) / 168); if (tile !== lastTile.current) { tick(); lastTile.current = tile; } }} onAnimationComplete={() => { setDone(true); chime('victory'); }}>{reel.map((tile, i) => <ReelTile tile={tile} key={i} />)}</motion.div>
        {!done && !fast && <button type="button" className="roulette-skip" onClick={ev => { ev.stopPropagation(); setFast(true); }}>{t('skipSpin')}</button>}
      </motion.div>}</AnimatePresence>
    </div>
    <p role="status">{done ? result.name : stage === 'reel' ? t('reelSlowing') : ''}</p>
    <AnimatePresence>{done && <motion.div role="dialog" aria-modal="true" aria-label={t('wonCard')} className="prize-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {prizeCard ? <div className="relative"><Burst color={rarityStyle[prizeCard.rarity].frame} /><motion.div initial={{ scale: .3, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={spring}><GameCard card={prizeCard} scale={1.2} hoverable={false} /></motion.div></div> : null}
      {skin?.kind === 'cosmetic' && skinItem ? <div className="relative"><Burst color="#c3a45e" /><motion.div className="prize-cosmetic" initial={{ scale: .3, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={spring}><CosmeticStage item={skinItem} name={t('guest')} /></motion.div></div> : null}
      <div className="pack-extras">{result.rewards.filter(reward => reward.kind !== 'cosmetic').map((reward, i) => <RewardChip key={i} reward={reward} />)}</div>
      <h2>{duplicate != null ? `${prizeCard?.name.ru ?? result.name} уже в альбоме → $${duplicate}` : skin?.kind === 'cosmeticDuplicate' ? t('cosmeticAlready', { name: skinName, amount: skin.amount }) : prizeCard?.name.ru ?? (skinName || result.name)}</h2>
      {duplicate != null && <p role="status">{t('dupeCash')}</p>}
      <InkButton tone="gold" onClick={onDone}>{t(duplicate != null ? 'takeDollars' : 'toCollection')}</InkButton>
    </motion.div>}</AnimatePresence>
  </div>;
}
function ReelTile({ tile }: { tile: ChestTile }) {
  const { t, i18n } = useTranslation();
  if (tile.kind === 'cosmetic') {
    const cosmetic = cosmeticById(tile.itemId);
    const item = cosmetic && cosmeticItems(cosmetic.kind).find(c => c.shopId === cosmetic.id);
    return <div className="reel-tile is-cosmetic"><div>{item && <CosmeticStage item={item} name={t('guest')} still />}</div><strong>{cosmetic ? pickLoc(cosmetic.name, i18n.language) : t('tileSkin')}</strong><i /></div>;
  }
  if (tile.kind !== 'card') return <div className={`reel-tile is-${tile.kind}`}><div><span>{tile.kind === 'currency' ? '$' : tile.kind === 'xp' ? 'XP' : '◆'}</span></div><strong>{t(tile.kind === 'currency' ? 'tileCash' : tile.kind === 'xp' ? 'tileXp' : 'tileCards')}</strong><i /></div>;
  return <CardReelTile card={tile.card} />;
}
function CardReelTile({ card }: { card: CardDefinition }) {
  const art = useCardArt(card.art, 512);
  return <div className="reel-tile"><div>{art ? <img src={art} alt="" /> : <PortraitPlaceholder seed={card.id} />}</div><strong>{card.name.ru}</strong><i style={{ background: rarityStyle[card.rarity].frame }} /></div>;
}
