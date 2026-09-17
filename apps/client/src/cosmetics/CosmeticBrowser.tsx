import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { VfxLayer, rand } from './vfx';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cosmeticSet, cosmeticTier, cosmeticsOfSet, pickLoc, type CosmeticKind } from '@kartishki/shared';
import { audioManager } from '../AudioManager';
import { playerSession } from '../playerSession';
import { COSMETIC_KINDS, CosmeticCard, CosmeticStage, cosmeticItems, cosmeticOwned, equipCosmetic, useEquipped, type CosmeticItem } from '../ui/CosmeticCard';
import { InkButton, spring } from '../ui/InkButton';
import { playBoughtSound, playEquipSound } from './vfxAudio';
import { useAbHeroes } from '../ui/useCatalog';

const KIND_COPY: Record<CosmeticKind, { title: string; hint: string; mark: string }> = {
  heroSkin: { title: 'cosmeticsFrames', hint: 'cosmeticsFrameHint', mark: '▣' },
  heroSlam: { title: 'cosmeticsSlams', hint: 'cosmeticsSlamHint', mark: '✦' },
  portraitFx: { title: 'cosmeticsAuras', hint: 'cosmeticsAuraHint', mark: '◌' },
  nameFx: { title: 'cosmeticsNames', hint: 'cosmeticsNameHint', mark: 'Aa' },
  cardBack: { title: 'cosmeticsBacks', hint: 'cosmeticsBackHint', mark: '▮' },
  board: { title: 'cosmeticsBoards', hint: 'cosmeticsBoardHint', mark: '▬' },
};

/**
 * The one cosmetic browser: category rail, a featured item with its live preview and actions, and the
 * gallery underneath. The shop shows everything with prices; the wardrobe ('owned' mode) only what the
 * player has. Both read the same shared tables and the same account state, so they can never disagree.
 */
/** A handful of coins and sparks thrown up from the buy button — one short burst, cleaned up by itself. */
function coinBurst(host: HTMLElement | null) {
  if (!host || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = new VfxLayer(host, { inset: 60, zIndex: 30, className: 'buy-burst' });
  layer.max = 40;
  const w = host.offsetWidth, h = host.offsetHeight;
  for (let i = 0; i < 14; i++) { const a = -Math.PI / 2 + rand(-1.1, 1.1), sp = rand(160, 300); layer.spawn({ x: w * .7, y: h * .5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 620, drag: .4, life: rand(.6, .9), size: rand(3, 5.5), size1: 2, rot: rand(0, 6), spin: rand(-8, 8), shape: i % 3 ? 'glow' : 'star', color: i % 2 ? '#ffd66b' : '#fff3b0', alpha: 1, fadeIn: .05, fadeOut: .35 }); }
  for (let i = 0; i < 10; i++) { const a = rand(0, 6.3), sp = rand(80, 200); layer.spawn({ x: w * .7, y: h * .5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2, life: rand(.25, .45), size: rand(1.4, 2.4), size1: .6, shape: 'spark', color: '#fff8e6', alpha: 1, fadeIn: .03, fadeOut: .5 }); }
  window.setTimeout(() => layer.destroy(), 1200);
}

export function CosmeticBrowser({ mode, onShop }: { mode: 'shop' | 'owned'; onShop?: () => void }) {
  const { t, i18n } = useTranslation();
  const player = useSyncExternalStore(playerSession.subscribe, playerSession.getSnapshot);
  const heroes = useAbHeroes();
  const equipped = useEquipped();
  const library = player.library;
  const unlocks = library?.unlocks ?? [];
  const dollars = library?.profile.currency ?? 0;
  const busy = player.loading;
  const name = library?.profile.username ?? t('guest');
  const [kind, setKind] = useState<CosmeticKind>('heroSkin');
  const [picked, setPicked] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ id: string; kind: 'bought' | 'worn' } | null>(null);
  /** Button feedback: 'deny' shakes a buy the purse can't cover, 'pop' is the success punch after a purchase or equip. */
  const [nudge, setNudge] = useState<{ id: string; kind: 'deny' | 'pop'; n: number } | null>(null);
  const buyRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  // Picking a tile lower in the gallery brings the featured preview back into view; otherwise the change happens off-screen.
  const pickItem = (id: string) => { setPicked(id); mainRef.current?.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
  const flashTimer = useRef<number>(undefined);
  // Gallery order: free first, then by rarity (price tier) ascending, ties by price, so every kind reads common → legendary.
  const items = useMemo(() => cosmeticItems(kind).filter(item => mode === 'shop' || (cosmeticOwned(item, unlocks) && (!!library || item.kind === 'board'))).sort((a, b) => a.cost - b.cost), [kind, mode, unlocks.join(','), !!library]);
  const item = items.find(i => i.id === picked) ?? items.find(i => i.id === equipped[kind]) ?? items[0];
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);
  const stamp = (id: string, what: 'bought' | 'worn') => { setFlash({ id, kind: what }); window.clearTimeout(flashTimer.current); flashTimer.current = window.setTimeout(() => setFlash(null), 1400); };
  const buy = async (target: CosmeticItem) => {
    if (!library || dollars < target.cost) { audioManager.play('ab_error'); setNudge(n => ({ id: target.id, kind: 'deny', n: (n?.n ?? 0) + 1 })); return; }
    if (await playerSession.buyCosmetic(target.shopId)) { audioManager.play('coins_spend'); playBoughtSound(); stamp(target.id, 'bought'); setNudge(n => ({ id: target.id, kind: 'pop', n: (n?.n ?? 0) + 1 })); coinBurst(buyRef.current); }
  };
  const wear = async (target: CosmeticItem) => {
    if (await equipCosmetic(target)) { playEquipSound(); stamp(target.id, 'worn'); setNudge(n => ({ id: target.id, kind: 'pop', n: (n?.n ?? 0) + 1 })); }
  };
  const ownedCount = (k: CosmeticKind) => cosmeticItems(k).filter(i => i.cost && cosmeticOwned(i, unlocks)).length;
  const totalCount = (k: CosmeticKind) => cosmeticItems(k).filter(i => i.cost).length;
  const hero = heroes[0], foe = heroes[1] ?? heroes[0];
  const owned = item ? cosmeticOwned(item, unlocks) : false;
  const isEquipped = !!item && equipped[item.kind] === item.id;
  const canEquip = !!item && owned && !isEquipped && !busy && (!!library || item.kind === 'board');
  const family = item?.set ? cosmeticSet(item.set) : undefined;
  // The rest of the family: one chip per piece, in the shop's kind order; clicking jumps the browser to that item.
  const siblings = item?.set ? cosmeticsOfSet(item.set).map(c => cosmeticItems(c.kind).find(i => i.shopId === c.id)).filter((i): i is CosmeticItem => !!i && (mode === 'shop' || cosmeticOwned(i, unlocks))) : [];
  return <div className={`stall is-${mode}`} data-testid="cosmetics-stall">
    <nav className="stall-rail" aria-label={t('shopTab_cosmetics')}>
      {COSMETIC_KINDS.map(k => <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setPicked(null); }} data-testid={`stall-${k}`}>
        <i aria-hidden>{KIND_COPY[k].mark}</i><span>{t(KIND_COPY[k].title)}</span><small>{ownedCount(k)}/{totalCount(k)}</small>
      </button>)}
    </nav>
    <div className="stall-main" ref={mainRef}>
      <AnimatePresence mode="wait">
        {item ? <motion.section key={`${kind}:${item.id}`} className={`stall-featured is-${item.cost ? cosmeticTier(item.cost) : 'free'}`} data-testid="stall-featured"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .18 }}>
          <div className="stall-preview">
            <CosmeticStage item={item} hero={hero} foe={foe} name={name} size="lg" worn={equipped} />
            <AnimatePresence>{flash?.id === item.id && <motion.b key={flash.kind} className={`stall-stamp is-${flash.kind}`} initial={{ scale: 2.2, rotate: -18, opacity: 0 }} animate={{ scale: 1, rotate: -8, opacity: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ ...spring, duration: .35 }}>{t(flash.kind === 'bought' ? 'cosmeticsBought' : 'cosmeticsEquipped')}</motion.b>}</AnimatePresence>
          </div>
          <div className="stall-copy">
            <span className="eyebrow">{t(KIND_COPY[item.kind].title)}{item.cost ? ` · ${t(`tier_${cosmeticTier(item.cost)}`)}` : ''}{family && <b className="stall-set" data-set={family.id}>{pickLoc(family.name, i18n.language)}</b>}</span>
            <h2>{pickLoc(item.name, i18n.language)}</h2>
            <p>{t(KIND_COPY[item.kind].hint)}</p>
            {siblings.length > 1 && <div className="stall-family" data-testid="stall-family"><span>{t('cosmeticsSet')}</span>{siblings.map(sib => <button key={sib.shopId} type="button" className={`${sib.shopId === item.shopId ? 'is-here' : ''} ${cosmeticOwned(sib, unlocks) ? 'is-owned' : ''}`} title={t(KIND_COPY[sib.kind].title)} onClick={() => { setKind(sib.kind); pickItem(sib.id); }}>{KIND_COPY[sib.kind].mark} {pickLoc(sib.name, i18n.language)}</button>)}</div>}
            <div className="stall-actions" ref={buyRef}>
              {item.cost > 0 && <b className={`stall-price ${owned ? 'is-owned' : dollars < item.cost && library ? 'is-short' : ''}`}>{owned ? t('cosmeticsOwned') : `$ ${item.cost}`}</b>}
              {!item.cost && <b className="stall-price is-owned">{t('cosmeticsFree')}</b>}
              {owned
                ? <InkButton key={`wear-${item.id}`} tone={isEquipped ? 'ink' : 'gold'} disabled={!canEquip} onClick={() => void wear(item)} data-testid="stall-equip" className={busy ? 'is-busy' : ''}
                    animate={nudge?.id === item.id && nudge.kind === 'pop' ? { scale: [1, 1.14, .96, 1.04, 1], rotate: [0, -3, 2, 0] } : { scale: 1, rotate: 0 }} transition={{ duration: .5, times: [0, .2, .45, .7, 1] }}>
                    {isEquipped && <motion.i className="stall-check" initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }} aria-hidden>✓</motion.i>}{t(isEquipped ? 'cosmeticsEquipped' : 'cosmeticsEquip')}
                  </InkButton>
                : mode === 'shop'
                  ? <InkButton key={`buy-${item.id}`} tone="gold" disabled={busy} title={library ? undefined : t('cosmeticsGuest')} onClick={() => void buy(item)} data-testid="stall-buy" className={`${busy ? 'is-busy' : ''} ${library && dollars < item.cost ? 'is-short' : ''}`}
                    animate={nudge?.id === item.id && nudge.kind === 'deny' ? { x: [0, -10, 10, -7, 7, -3, 0], rotate: [0, -2, 2, -1, 1, 0, 0] } : nudge?.id === item.id && nudge.kind === 'pop' ? { scale: [1, 1.14, .96, 1.04, 1] } : { x: 0, scale: 1 }} transition={{ duration: .45 }}>
                    {t('cosmeticsBuy', { n: item.cost })}
                  </InkButton>
                  : null}
            </div>
          </div>
        </motion.section> : null}
      </AnimatePresence>
      {items.length <= 1 && mode === 'owned' && <div className="stall-empty"><p>{t('customizeEmpty')}</p>{onShop && <InkButton tone="gold" size="sm" onClick={onShop}>{t('customizeShop')}</InkButton>}</div>}
      <div className="stall-gallery" role="listbox" aria-label={t(KIND_COPY[kind].title)}>
        {items.map(entry => {
          const has = cosmeticOwned(entry, unlocks);
          return <CosmeticCard key={entry.id || 'none'} item={entry} equipped={equipped[entry.kind] === entry.id} owned={has} hero={hero} foe={foe} name={name} selected={item?.id === entry.id}
            testId={`${mode === 'owned' ? 'wear-' : ''}${entry.shopId || `${entry.kind}-none`}`} onClick={() => pickItem(entry.id)}>
            <span>{entry.cost ? has ? '✓' : `$ ${entry.cost}` : t('cosmeticsFree')}</span>
          </CosmeticCard>;
        })}
      </div>
    </div>
  </div>;
}
