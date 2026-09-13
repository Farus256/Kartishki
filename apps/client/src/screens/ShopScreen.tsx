import { SlotMachine } from './SlotMachine';
import { audioManager } from '../AudioManager';
﻿import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { CardDefinition } from '@kartishki/shared';
import { useEconomy } from '../EconomyContext';
import { CASES, PACKS, type Product } from '../economy';
import { PortraitPlaceholder } from '../ui/PortraitPlaceholder';
import { Backdrop } from '../ui/Backdrop';
import { CardBack, GameCard } from '../ui/GameCard';
import { InkButton, spring } from '../ui/InkButton';
import { TopBar } from '../ui/TopBar';
import { rarityOrder, rarityStyle } from '../ui/rarity';
import { useCardArt } from '../ui/cardArt';
import { chime, tick } from '../ui/sfx';

const tabs = { slots: 'Слот-Машина', packs: 'Паки карт', cases: 'Кейсы' };
type Tab = keyof typeof tabs;
export function ShopScreen({ onBack }: { onBack: () => void }) {
  const e = useEconomy();
  const [tab, setTab] = useState<Tab>(e.opening?.kind ?? 'slots');
  const [packId, setPackId] = useState(PACKS[0].id);
  const [caseId, setCaseId] = useState(CASES[0].id);
  const pack = PACKS.find(p => p.id === packId)!;
  const crate = CASES.find(p => p.id === caseId)!;
  return <div className="absolute inset-0 overflow-clip">
    <Backdrop />
    <TopBar right={<InkButton size="sm" onClick={onBack}>Назад в меню</InkButton>} />
    <div className="shop-title"><span>ЛАВКА ДЕВЯТИ ЖИЗНЕЙ</span><small>Демо-доллары · без реальных платежей</small></div>
    <nav className="shop-tabs" aria-label="Режим магазина">
      {(Object.keys(tabs) as Tab[]).map(key => <button key={key} aria-pressed={tab === key} disabled={!!e.opening && e.opening.kind !== key} onClick={() => { setTab(key); e.clearMessage(); }}>{tabs[key]}</button>)}
    </nav>
    <p role="status" className="absolute right-12 top-[161px] max-w-[620px] text-right font-mono text-[13px] text-blood">{e.message}</p>
    <main className="absolute inset-x-[55px] top-[222px] bottom-[24px]">
      {tab === 'slots' && <SlotMachine />}
      {tab === 'packs' && (e.opening?.kind === 'packs' ? <PackOpening key={e.opening.name} cards={e.opening.cards} name={e.opening.name} onDone={e.finish} /> : <div className="catalog-layout">
        <div className="catalog-shelf">{PACKS.map((p, i) => <button key={p.id} className={`product-choice ${p.id === packId ? 'chosen' : ''}`} onClick={() => setPackId(p.id)} aria-pressed={p.id === packId}>
          <Foil name={p.name} color={['#7f9868', '#b395cc', '#d3b655'][i]} compact />
          <strong>{p.name}</strong><span>$ {p.cost} · 5 карт</span>{(e.inventory[p.id] ?? 0) > 0 && <b className="bonus-label">В запасе: {e.inventory[p.id]}</b>}
        </button>)}</div>
        <div className="shop-receipt"><span className="eyebrow">СВЕЖИЙ УЛОВ / 5 КАРТ</span><h2>{pack.name}</h2><p>Порви фольгу. Переверни каждую карту. Все копии остаются в коллекции.</p><Odds product={pack} />
          <InkButton tone="gold" size="lg" disabled={e.dollars < pack.cost && !(e.inventory[pack.id] > 0)} onClick={() => e.openPack(pack.id)}>{e.inventory[pack.id] > 0 ? 'Открыть бонусный пак' : `Купить пак ($${pack.cost})`}</InkButton>
        </div>
      </div>)}
      {tab === 'cases' && (e.opening?.kind === 'cases' ? <CaseOpening reel={e.opening.reel} landing={e.opening.landing} prize={e.opening.prize} onDone={e.finish} /> : <div className="catalog-layout">
        <div className="catalog-shelf crates">{CASES.map((p, i) => <button key={p.id} className={`product-choice ${caseId === p.id ? 'chosen' : ''}`} onClick={() => setCaseId(p.id)} aria-pressed={caseId === p.id}>
          <div className={`wooden-crate crate-${i}`}><span>◆</span><b>▣</b><small>{i ? 'IX • СЕКРЕТНО' : 'НЕ КАНТОВАТЬ'}</small></div><strong>{p.name}</strong><span>$ {p.cost} · 1 карта</span>
        </button>)}</div>
        <div className="shop-receipt"><span className="eyebrow">КЛЮЧ НЕ НУЖЕН</span><h2>{crate.name}</h2><Odds product={crate} /><DropPreview product={crate} /><InkButton tone="gold" size="lg" disabled={e.dollars < crate.cost} onClick={() => e.openCase(crate.id)}>ОТКРЫТЬ КЕЙС (${crate.cost})</InkButton></div>
      </div>)}
    </main>
  </div>;
}
function Odds({ product }: { product: Product }) {
  const { t } = useTranslation();
  return <div className="odds" aria-label="Шансы выпадения">{rarityOrder.map((r, i) => <span key={r}><i style={{ background: rarityStyle[r].frame }} />{t(r)}<b>{product.weights[i]}%</b></span>)}</div>;
}
function DropPreview({ product }: { product: Product }) {
  const { catalog } = useEconomy();
  const { t } = useTranslation();
  return <details className="drop-preview"><summary>Все возможные карты и шансы ▾</summary><div>{catalog.filter(c => product.weights[rarityOrder.indexOf(c.rarity)] > 0).map(c => <p key={c.id}><span style={{ color: rarityStyle[c.rarity].frame }}>{c.name.ru} · {t(c.rarity)}</span><b>{(product.weights[rarityOrder.indexOf(c.rarity)] / catalog.filter(d => d.rarity === c.rarity).length).toFixed(2)}%</b></p>)}</div></details>;
}
function Foil({ name, color = '#c1ac62', compact = false }: { name: string; color?: string; compact?: boolean }) {
  return <div className={`foil-pack ${compact ? 'compact' : ''}`} style={{ '--foil-color': color } as React.CSSProperties}><div className="foil-crimp" /><span className="foil-brand">КАРТИШКИ</span><div className="foil-emblem">◆</div><strong>{name}</strong><small>5 КАРТ • ОДНА НОВАЯ ИСТОРИЯ</small><div className="foil-crimp bottom" /></div>;
}
export function PackOpening({ cards, name, onDone }: { cards: CardDefinition[]; name: string; onDone: () => void }) {
  const [ripped, setRipped] = useState(false);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [flat, setFlat] = useState<number[]>([]);
  const start = useRef(0);
  const rip = () => { if (!ripped) { setRipped(true); audioManager.play('pack_rip'); } };
  return <div className="pack-opening">
    <h2>{ripped ? 'ТВОЙ УЛОВ' : name}</h2>
    <AnimatePresence>{!ripped && <motion.div className="sealed-pack" exit={{ y: 340, opacity: 0 }} transition={{ duration: .55 }}>
      <Foil name={name} />
      <motion.button className="tear-line" aria-label="Порвать пак" onPointerDown={ev => { start.current = ev.clientX; ev.currentTarget.setPointerCapture(ev.pointerId); }} onPointerUp={ev => { if (Math.abs(ev.clientX - start.current) > 35) rip(); }} onClick={rip} whileHover={{ x: [0, -3, 3, 0] }}>✂ · · · ПОТЯНИ ИЛИ НАЖМИ · · ·</motion.button>
    </motion.div>}</AnimatePresence>
    {ripped && <><motion.div className="torn-head" initial={{ x: 0, y: 80, rotate: 0 }} animate={{ x: 460, y: -400, rotate: 85, opacity: 0 }} transition={{ duration: .9 }}>✂ КАРТИШКИ</motion.div>
      <div className="pack-cards">{cards.map((card, i) => <motion.div key={i} initial={{ y: 290, x: (2 - i) * 190, opacity: 0 }} animate={{ y: 0, x: 0, opacity: 1 }} transition={{ ...spring, delay: .15 + i * .1 }} className="flip-perspective">
        <motion.button aria-label={flipped.includes(i) ? card.name.ru : `Перевернуть карту ${i + 1}`} className={`flip-card ${flat.includes(i) ? 'is-flat' : ''}`} onAnimationComplete={() => { if (flipped.includes(i) && !flat.includes(i)) setFlat(prev => [...prev, i]); }} animate={{ rotateY: flat.includes(i) ? 0 : flipped.includes(i) ? 180 : 0 }} transition={flat.includes(i) ? { duration: 0 } : { type: 'spring', stiffness: 160, damping: 19 }} onClick={() => { if (!flipped.includes(i)) { setFlipped(prev => [...prev, i]); chime(); } }}>
          <div className="flip-front"><CardBack /></div><div className="flip-back"><GameCard card={card} hoverable={false} /></div>
        </motion.button>{flipped.includes(i) && <Burst color={rarityStyle[card.rarity].frame} />}
      </motion.div>)}</div>
      <p>{flipped.length === 5 ? 'Все пять карт теперь в коллекции.' : 'Нажми на каждую карту, чтобы узнать её редкость.'}</p>
      <InkButton tone="toxic" disabled={flipped.length !== 5} onClick={onDone}>Ура, в коллекцию!</InkButton>
    </>}
    {!ripped && <p className="tear-hint">Разорви пак по пунктирной линии</p>}
  </div>;
}
function Burst({ color }: { color: string }) {
  return <div className="pointer-events-none absolute inset-0" aria-hidden><motion.div className="absolute inset-0" style={{ boxShadow: `0 0 50px 15px ${color}` }} initial={{ opacity: .8 }} animate={{ opacity: .18 }} transition={{ duration: 1.2 }} />{Array.from({ length: 16 }, (_, i) => <motion.i key={i} className="absolute left-1/2 top-1/2 h-2 w-2" style={{ background: color }} initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos(i * Math.PI / 8) * 160, y: Math.sin(i * Math.PI / 8) * 200, opacity: 0, rotate: 180 }} transition={{ duration: .85 }} />)}</div>;
}
function CaseOpening({ reel, landing, prize, onDone }: { reel: CardDefinition[]; landing: number; prize: CardDefinition; onDone: () => void }) {
  const [done, setDone] = useState(false);
  const lastTile = useRef(0);
  return <div className="case-opening"><h2>{done ? 'ПОЙМАНО!' : 'КОМУ ДОСТАНЕТСЯ ДЕВЯТАЯ ЖИЗНЬ?'}</h2><p>Одна карта. Никаких ключей.</p>
    <div className="roulette-window"><div className="roulette-selector" /><motion.div className="roulette-ribbon" initial={{ x: 0 }} animate={{ x: -(landing * 168 + 84 - 590) }} transition={{ duration: 5.6, ease: [.08, .66, .12, 1] }} onUpdate={latest => { const tile = Math.floor(Math.abs(Number(latest.x)) / 168); if (tile !== lastTile.current) { tick(); lastTile.current = tile; } }} onAnimationComplete={() => { setDone(true); chime('victory'); }}>{reel.map((card, i) => <ReelTile card={card} key={i} />)}</motion.div></div>
    <p role="status">{done ? prize.name.ru : 'Барабан замедляется…'}</p>
    <AnimatePresence>{done && <motion.div role="dialog" aria-modal="true" aria-label="Выигранная карта" className="prize-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><div className="relative"><Burst color={rarityStyle[prize.rarity].frame} /><motion.div initial={{ scale: .3, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={spring}><GameCard card={prize} scale={1.4} hoverable={false} /></motion.div></div><h2>{prize.name.ru}</h2><InkButton tone="gold" onClick={onDone}>Ура, в коллекцию!</InkButton></motion.div>}</AnimatePresence>
  </div>;
}
function ReelTile({ card }: { card: CardDefinition }) {
  const art = useCardArt(card.art, 512);
  return <div className="reel-tile"><div>{art ? <img src={art} alt="" /> : <PortraitPlaceholder seed={card.id} />}</div><strong>{card.name.ru}</strong><i style={{ background: rarityStyle[card.rarity].frame }} /></div>;
}
