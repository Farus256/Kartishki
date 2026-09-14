import { CasinoGames } from './CasinoGames';
import { audioManager } from '../AudioManager';
import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { shopMixed, shopPrizeLabel, shopProducts, type CardDefinition, type ShopProduct, type ShopResult, type ShopReward } from '@kartishki/shared';
import { useEconomy, type ChestTile } from '../EconomyContext';
import { PortraitPlaceholder } from '../ui/PortraitPlaceholder';
import { Backdrop } from '../ui/Backdrop';
import { CardBack, GameCard } from '../ui/GameCard';
import { InkButton, spring } from '../ui/InkButton';
import { TopBar } from '../ui/TopBar';
import { rarityOrder, rarityStyle } from '../ui/rarity';
import { useCardArt } from '../ui/cardArt';
import { chime, tick } from '../ui/sfx';

const tabs = { casino: 'Казино', packs: 'Паки', chests: 'Сундуки' } as const;
type Tab = keyof typeof tabs;
const FOIL = ['#7f9868', '#b395cc', '#d3b655', '#c07a5a', '#6e8ea8'];
function shopTab(kind?: string): Tab {
  if (kind === 'packs') return 'packs';
  if (kind === 'chests') return 'chests';
  return 'casino';
}
export function ShopScreen({ onBack }: { onBack: () => void }) {
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
    <TopBar right={<InkButton size="sm" onClick={onBack}>Назад в меню</InkButton>} />
    <div className="shop-title"><span>ЛАВКА ДЕВЯТИ ЖИЗНЕЙ</span></div>
    <nav className="shop-tabs" aria-label="Режим магазина">
      {(Object.keys(tabs) as Tab[]).map(key => <button key={key} aria-pressed={tab === key} disabled={!!e.opening && shopTab(e.opening.kind) !== key} onClick={() => { setTab(key); e.clearMessage(); }}>{tabs[key]}</button>)}
    </nav>
    <p role="status" className="absolute right-12 top-[161px] max-w-[620px] text-right font-mono text-[13px] text-blood">{e.message}</p>
    <main className="absolute inset-x-[55px] top-[222px] bottom-[24px]">
      {tab === 'casino' && <CasinoGames />}
      {tab === 'packs' && pack && (e.opening?.kind === 'packs' ? <PackOpening key={e.opening.name} result={e.opening.result} name={e.opening.name} onDone={e.finish} /> : <div className="catalog-layout">
        <div className="catalog-shelf">{packs.map((p, i) => <button key={p.id} className={`product-choice ${p.id === pack.id ? 'chosen' : ''}`} onClick={() => setPackId(p.id)} aria-pressed={p.id === pack.id}>
          <Foil name={p.name} color={FOIL[i % FOIL.length]} compact mixed={p.id === 'mixed-pack'} />
          <strong>{p.name}</strong><span>$ {p.cost} · {shopMixed(p) ? `${p.draws} приза` : `${p.draws} карт`}</span>{(e.inventory[p.id] ?? 0) > 0 && <b className="bonus-label">В запасе: {e.inventory[p.id]}</b>}
        </button>)}</div>
        <div className="shop-receipt"><span className="eyebrow">{shopMixed(pack) ? 'КАРТЫ · ДЕНЬГИ · ОПЫТ' : 'СВЕЖИЙ УЛОВ'}</span><h2>{pack.name}</h2>
          <p>{shopMixed(pack) ? 'Внутри всё подряд: доллары, опыт и карты. Повтор карты из альбома сразу становится деньгами.' : 'Порви фольгу. Переверни каждую карту. Повтор из альбома сразу становится деньгами.'}</p>
          <Odds product={pack} /><PrizeOdds product={pack} />
          <InkButton tone="gold" size="lg" disabled={e.dollars < pack.cost && !(e.inventory[pack.id] > 0)} onClick={() => e.openPack(pack.id)}>{e.inventory[pack.id] > 0 ? 'Открыть бонусный пак' : `Купить пак ($${pack.cost})`}</InkButton>
        </div>
      </div>)}
      {tab === 'chests' && crate && (e.opening?.kind === 'chests' ? <CaseOpening reel={e.opening.reel} landing={e.opening.landing} result={e.opening.result} onDone={e.finish} /> : <div className="catalog-layout">
        <div className="catalog-shelf crates">{chests.map((p, i) => <button key={p.id} className={`product-choice ${p.id === crate.id ? 'chosen' : ''}`} onClick={() => setChestId(p.id)} aria-pressed={p.id === crate.id}>
          <div className={`wooden-crate crate-${i} ${shopMixed(p) ? 'is-mixed' : ''}`}><span>{shopMixed(p) ? '$' : '◆'}</span><b>▣</b><small>{shopMixed(p) ? 'КОНТРАБАНДА' : i ? 'IX • СЕКРЕТНО' : 'НЕ КАНТОВАТЬ'}</small></div>
          <strong>{p.name}</strong><span>$ {p.cost} · {shopMixed(p) ? '1 приз' : '1 карта'}</span>
        </button>)}</div>
        <div className="shop-receipt"><span className="eyebrow">{shopMixed(crate) ? 'РУЛЕТКА ПРИЗОВ' : 'КЛЮЧ НЕ НУЖЕН'}</span><h2>{crate.name}</h2>
          <p>{shopMixed(crate) ? 'Барабан как у сейфа: карта, доллары или опыт. Сумма видна только после остановки. Повтор карты из альбома становится деньгами.' : 'Одна карта. Никаких ключей. Если она уже в альбоме — вместо копии придут деньги.'}</p>
          <Odds product={crate} /><PrizeOdds product={crate} /><DropPreview product={crate} />
          <InkButton tone="gold" size="lg" disabled={e.dollars < crate.cost} onClick={() => e.openCase(crate.id)}>ОТКРЫТЬ СУНДУК (${crate.cost})</InkButton>
        </div>
      </div>)}
    </main>
  </div>;
}
function Odds({ product }: { product: ShopProduct }) {
  const { t } = useTranslation();
  if (shopMixed(product) && product.prizes.every(p => p.kind !== 'cards')) return null;
  return <div className="odds" aria-label="Шансы выпадения">{rarityOrder.map((r, i) => <span key={r}><i style={{ background: rarityStyle[r].frame }} />{t(r)}<b>{product.weights[i]}%</b></span>)}</div>;
}
function PrizeOdds({ product }: { product: ShopProduct }) {
  if (!shopMixed(product)) return null;
  return <ul className="prize-odds">{product.prizes.map((prize, i) => <li key={i}><span>{shopPrizeLabel(prize)}</span><b>{prize.weight}%</b></li>)}</ul>;
}
function DropPreview({ product }: { product: ShopProduct }) {
  const { catalog } = useEconomy();
  const { t } = useTranslation();
  if (shopMixed(product)) return null;
  return <details className="drop-preview"><summary>Все возможные карты и шансы ▾</summary><div>{catalog.filter(c => product.weights[rarityOrder.indexOf(c.rarity)] > 0).map(c => <p key={c.id}><span style={{ color: rarityStyle[c.rarity].frame }}>{c.name.ru} · {t(c.rarity)}</span><b>{(product.weights[rarityOrder.indexOf(c.rarity)] / catalog.filter(d => d.rarity === c.rarity).length).toFixed(2)}%</b></p>)}</div></details>;
}
function Foil({ name, color = '#c1ac62', compact = false, mixed = false }: { name: string; color?: string; compact?: boolean; mixed?: boolean }) {
  return <div className={`foil-pack ${compact ? 'compact' : ''} ${mixed ? 'is-mixed' : ''}`} style={{ '--foil-color': color } as React.CSSProperties}><div className="foil-crimp" /><span className="foil-brand">{mixed ? 'Картишки Всё включено' : 'КАРТИШКИ'}</span><div className="foil-emblem">{mixed ? '$' : '◆'}</div><strong>{name}</strong><small>{mixed ? 'КАРТЫ • ДОЛЛАРЫ • ОПЫТ' : '5 КАРТ • ОДНА НОВАЯ ИСТОРИЯ'}</small><div className="foil-crimp bottom" /></div>;
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
  return <div className={`reward-chip is-${reward.kind}`}>{reward.kind === 'currency' ? `$${reward.amount}` : `+${reward.amount} XP`}</div>;
}
export function PackOpening({ result, name, onDone }: { result: ShopResult; name: string; onDone: () => void }) {
  const { catalog } = useEconomy();
  const mixed = result.product?.id === 'mixed-pack';
  const items: { reward: ShopReward; card?: CardDefinition; duplicate?: number }[] = [];
  for (const reward of result.rewards) {
    if (reward.kind === 'card' || reward.kind === 'duplicate') {
      const card = catalog.find(item => item.id === reward.cardId);
      if (card) items.push({ reward, card, duplicate: reward.kind === 'duplicate' ? reward.amount : undefined });
    } else items.push({ reward });
  }
  const [ripped, setRipped] = useState(false);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [flat, setFlat] = useState<number[]>([]);
  const start = useRef(0);
  const done = ripped && flipped.length === items.length;
  const dust = items.reduce((sum, item) => sum + (item.duplicate ?? 0), 0);
  const dupes = items.filter(item => item.duplicate != null).length;
  const word = dupes === 1 ? 'карта обменена' : dupes > 4 ? 'карт обменены' : 'карты обменены';
  const rip = () => { if (!ripped) { setRipped(true); audioManager.play('pack_rip'); } };
  return <div className="pack-opening">
    <h2>{ripped ? 'ТВОЙ УЛОВ' : name}</h2>
    <AnimatePresence>{!ripped && <motion.div className="sealed-pack" exit={{ y: 340, opacity: 0 }} transition={{ duration: .55 }}>
      <Foil name={name} mixed={mixed} />
      <motion.button className="tear-line" aria-label="Порвать пак" onPointerDown={ev => { start.current = ev.clientX; ev.currentTarget.setPointerCapture(ev.pointerId); }} onPointerUp={ev => { if (Math.abs(ev.clientX - start.current) > 35) rip(); }} onClick={rip} whileHover={{ x: [0, -3, 3, 0] }}>✂ · · · ПОТЯНИ ИЛИ НАЖМИ · · ·</motion.button>
    </motion.div>}</AnimatePresence>
    {ripped && <><motion.div className="torn-head" initial={{ x: 0, y: 80, rotate: 0 }} animate={{ x: 460, y: -400, rotate: 85, opacity: 0 }} transition={{ duration: .9 }}>✂ {mixed ? 'Картишки Всё включено' : 'КАРТИШКИ'}</motion.div>
      <div className="pack-cards">{items.map((item, i) => <motion.div key={i} initial={{ y: 290, x: (2 - i) * 190, opacity: 0 }} animate={{ y: 0, x: 0, opacity: 1 }} transition={{ ...spring, delay: .15 + i * .1 }} className="flip-perspective">
        <motion.button aria-label={flipped.includes(i) ? (item.card ? item.card.name.ru : item.reward.kind === 'currency' ? `$${item.reward.amount}` : item.reward.kind === 'xp' ? `+${item.reward.amount} XP` : `Награда ${i + 1}`) : item.card ? `Перевернуть карту ${i + 1}` : `Перевернуть награду ${i + 1}`} className={`flip-card ${flat.includes(i) ? 'is-flat' : ''}`} onAnimationComplete={() => { if (flipped.includes(i) && !flat.includes(i)) setFlat(prev => [...prev, i]); }} animate={{ rotateY: flat.includes(i) ? 0 : flipped.includes(i) ? 180 : 0 }} transition={flat.includes(i) ? { duration: 0 } : { type: 'spring', stiffness: 160, damping: 19 }} onClick={() => { if (!flipped.includes(i)) { setFlipped(prev => [...prev, i]); chime(); } }}>
          <div className="flip-front"><CardBack /></div><div className="flip-back">{item.card ? <GameCard card={item.card} hoverable={false} /> : <RewardChip reward={item.reward} />}</div>
        </motion.button>{flipped.includes(i) && <Burst color={item.card ? rarityStyle[item.card.rarity].frame : '#d7c07a'} />}
        {flipped.includes(i) && item.duplicate != null && item.card && <p className="duplicate-note" role="status">{item.card.name.ru} уже в альбоме → ${item.duplicate}</p>}
      </motion.div>)}</div>
      <p>{done ? (dust ? `Уже в альбоме: ${dupes} ${word} на $${dust}.` : 'Добыча уже в коллекции.') : items.length ? 'Нажми на каждую карту, чтобы узнать её редкость.' : 'Забирай, что выпало.'}</p>
      <InkButton tone="toxic" disabled={!done} onClick={onDone}>Ура, в коллекцию!</InkButton>
    </>}
    {!ripped && <p className="tear-hint">Разорви пак по пунктирной линии</p>}
  </div>;
}
function Burst({ color }: { color: string }) {
  return <div className="pointer-events-none absolute inset-0" aria-hidden><motion.div className="absolute inset-0" style={{ boxShadow: `0 0 50px 15px ${color}` }} initial={{ opacity: .8 }} animate={{ opacity: .18 }} transition={{ duration: 1.2 }} />{Array.from({ length: 16 }, (_, i) => <motion.i key={i} className="absolute left-1/2 top-1/2 h-2 w-2" style={{ background: color }} initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos(i * Math.PI / 8) * 160, y: Math.sin(i * Math.PI / 8) * 200, opacity: 0, rotate: 180 }} transition={{ duration: .85 }} />)}</div>;
}
function CaseOpening({ reel, landing, result, onDone }: { reel: ChestTile[]; landing: number; result: { rewards: ShopReward[]; name: string }; onDone: () => void }) {
  const { catalog } = useEconomy();
  const [done, setDone] = useState(false);
  const lastTile = useRef(0);
  const prize = result.rewards.find(reward => reward.kind === 'card' || reward.kind === 'duplicate');
  const prizeCard = prize && catalog.find(card => card.id === prize.cardId);
  const duplicate = prize?.kind === 'duplicate' ? prize.amount : undefined;
  return <div className="case-opening"><h2>{done ? 'ПОЙМАНО!' : 'КОМУ ДОСТАНЕТСЯ ДЕВЯТАЯ ЖИЗНЬ?'}</h2><p>Барабан выбирает добычу.</p>
    <div className="roulette-window"><div className="roulette-selector" /><motion.div className="roulette-ribbon" initial={{ x: 0 }} animate={{ x: -(landing * 168 + 84 - 590) }} transition={{ duration: 5.6, ease: [.08, .66, .12, 1] }} onUpdate={latest => { const tile = Math.floor(Math.abs(Number(latest.x)) / 168); if (tile !== lastTile.current) { tick(); lastTile.current = tile; } }} onAnimationComplete={() => { setDone(true); chime('victory'); }}>{reel.map((tile, i) => <ReelTile tile={tile} key={i} />)}</motion.div></div>
    <p role="status">{done ? result.name : 'Барабан замедляется…'}</p>
    <AnimatePresence>{done && <motion.div role="dialog" aria-modal="true" aria-label="Выигранная карта" className="prize-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {prizeCard ? <div className="relative"><Burst color={rarityStyle[prizeCard.rarity].frame} /><motion.div initial={{ scale: .3, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={spring}><GameCard card={prizeCard} scale={1.4} hoverable={false} /></motion.div></div> : null}
      <div className="pack-extras">{result.rewards.map((reward, i) => <RewardChip key={i} reward={reward} />)}</div>
      <h2>{duplicate != null ? `${prizeCard?.name.ru ?? result.name} уже в альбоме → $${duplicate}` : prizeCard?.name.ru ?? result.name}</h2>
      {duplicate != null && <p role="status">Карта уже была в альбоме, поэтому вместо копии выданы деньги.</p>}
      <InkButton tone="gold" onClick={onDone}>{duplicate != null ? 'Забрать доллары' : 'Ура, в коллекцию!'}</InkButton>
    </motion.div>}</AnimatePresence>
  </div>;
}
function ReelTile({ tile }: { tile: ChestTile }) {
  if (tile.kind !== 'card') return <div className={`reel-tile is-${tile.kind}`}><div><span>{tile.kind === 'currency' ? '$' : tile.kind === 'xp' ? 'XP' : '◆'}</span></div><strong>{tile.kind === 'currency' ? 'Доллары' : tile.kind === 'xp' ? 'Опыт' : 'Карты'}</strong><i /></div>;
  return <CardReelTile card={tile.card} />;
}
function CardReelTile({ card }: { card: CardDefinition }) {
  const art = useCardArt(card.art, 512);
  return <div className="reel-tile"><div>{art ? <img src={art} alt="" /> : <PortraitPlaceholder seed={card.id} />}</div><strong>{card.name.ru}</strong><i style={{ background: rarityStyle[card.rarity].frame }} /></div>;
}
