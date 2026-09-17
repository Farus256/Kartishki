import { CasinoGames } from './CasinoGames';
import { CosmeticsStall } from './CosmeticsStall';
import { audioManager } from '../AudioManager';
import { useRef, useState } from 'react';
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

// Skins open first: they are what the shop is about now; the casino and loot sit behind.
const tabs = ['cosmetics', 'casino', 'packs', 'chests'] as const;
type Tab = typeof tabs[number];
const FOIL = ['#7f9868', '#b395cc', '#d3b655', '#c07a5a', '#6e8ea8'];
function shopTab(kind?: string): Tab {
  if (kind === 'packs') return 'packs';
  if (kind === 'chests') return 'chests';
  if (kind === 'slots' || kind === 'casino') return 'casino';
  return 'cosmetics';
}
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
      {tabs.map(key => <button key={key} aria-pressed={tab === key} disabled={!!e.opening && shopTab(e.opening.kind) !== key} onClick={() => { setTab(key); e.clearMessage(); }}>{t(`shopTab_${key}`)}</button>)}
    </nav>
    <p role="status" className="absolute right-12 top-[124px] max-w-[620px] text-right font-mono text-[13px] text-blood">{e.message}</p>
    <main className="absolute inset-x-[55px] top-[186px] bottom-[24px]">
      {tab === 'casino' && <CasinoGames />}
      {tab === 'cosmetics' && <CosmeticsStall />}
      {tab === 'packs' && pack && (e.opening?.kind === 'packs' ? <PackOpening key={e.opening.name} result={e.opening.result} name={e.opening.name} onDone={e.finish} /> : <div className="catalog-layout">
        <div className="catalog-shelf">{packs.map((p, i) => <button key={p.id} className={`product-choice ${p.id === pack.id ? 'chosen' : ''}`} onClick={() => setPackId(p.id)} aria-pressed={p.id === pack.id}>
          <Foil name={p.name} color={FOIL[i % FOIL.length]} compact mixed={p.id === 'mixed-pack'} />
          <strong>{p.name}</strong><span>$ {p.cost} · {t(shopMixed(p) ? 'shopPrizesN' : 'shopCardsN', { count: p.draws })}</span>{(e.inventory[p.id] ?? 0) > 0 && <b className="bonus-label">{t('shopInStock', { count: e.inventory[p.id] })}</b>}
        </button>)}</div>
        <div className="shop-receipt"><span className="eyebrow">{t(shopMixed(pack) ? 'shopEyebrowMixed' : 'shopEyebrowFresh')}</span><h2>{pack.name}</h2>
          <p>{t(shopMixed(pack) ? 'shopPackMixedText' : 'shopPackText')}</p>
          <Odds product={pack} /><PrizeOdds product={pack} />
          <InkButton tone="gold" size="lg" disabled={e.dollars < pack.cost && !(e.inventory[pack.id] > 0)} onClick={() => e.openPack(pack.id)}>{e.inventory[pack.id] > 0 ? t('shopOpenBonusPack') : t('shopBuyPack', { cost: pack.cost })}</InkButton>
        </div>
      </div>)}
      {tab === 'chests' && crate && (e.opening?.kind === 'chests' ? <CaseOpening reel={e.opening.reel} landing={e.opening.landing} result={e.opening.result} onDone={e.finish} /> : <div className="catalog-layout">
        <div className="catalog-shelf crates">{chests.map((p, i) => <button key={p.id} className={`product-choice ${p.id === crate.id ? 'chosen' : ''}`} onClick={() => setChestId(p.id)} aria-pressed={p.id === crate.id}>
          <div className={`wooden-crate crate-${i} ${shopMixed(p) ? 'is-mixed' : ''}`}><span>{shopMixed(p) ? '$' : '◆'}</span><b>▣</b><small>{t(shopMixed(p) ? 'crateContraband' : i ? 'crateSecret' : 'crateFragile')}</small></div>
          <strong>{p.name}</strong><span>$ {p.cost} · {t(shopMixed(p) ? 'shopOnePrize' : 'shopOneCard')}</span>
        </button>)}</div>
        <div className="shop-receipt"><span className="eyebrow">{t(shopMixed(crate) ? 'crateEyebrowMixed' : 'crateEyebrow')}</span><h2>{crate.name}</h2>
          <p>{t(shopMixed(crate) ? 'crateMixedText' : 'crateText')}</p>
          <Odds product={crate} /><PrizeOdds product={crate} /><DropPreview product={crate} />
          <InkButton tone="gold" size="lg" disabled={e.dollars < crate.cost} onClick={() => e.openCase(crate.id)}>{t('openChest', { cost: crate.cost })}</InkButton>
        </div>
      </div>)}
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
function Foil({ name, color = '#c1ac62', compact = false, mixed = false }: { name: string; color?: string; compact?: boolean; mixed?: boolean }) {
  const { t } = useTranslation();
  return <div className={`foil-pack ${compact ? 'compact' : ''} ${mixed ? 'is-mixed' : ''}`} style={{ '--foil-color': color } as React.CSSProperties}><div className="foil-crimp" /><span className="foil-brand">{t(mixed ? 'foilBrandMixed' : 'foilBrand')}</span><div className="foil-emblem">{mixed ? '$' : '◆'}</div><strong>{name}</strong><small>{t(mixed ? 'foilMixedSub' : 'foilSub')}</small><div className="foil-crimp bottom" /></div>;
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
export function PackOpening({ result, name, onDone }: { result: ShopResult; name: string; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const { catalog } = useEconomy();
  const mixed = !!result.product && shopMixed(result.product);
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
  const rip = () => { if (!ripped) { setRipped(true); audioManager.play('pack_rip'); } };
  return <div className="pack-opening">
    <h2>{ripped ? t('yourCatch') : name}</h2>
    <AnimatePresence>{!ripped && <motion.div className="sealed-pack" exit={{ y: 340, opacity: 0 }} transition={{ duration: .55 }}>
      <Foil name={name} mixed={mixed} />
      <motion.button className="tear-line" aria-label={t('tearPack')} onPointerDown={ev => { start.current = ev.clientX; ev.currentTarget.setPointerCapture(ev.pointerId); }} onPointerUp={ev => { if (Math.abs(ev.clientX - start.current) > 35) rip(); }} onClick={rip} whileHover={{ x: [0, -3, 3, 0] }}>{t('tearLine')}</motion.button>
    </motion.div>}</AnimatePresence>
    {ripped && <><motion.div className="torn-head" initial={{ x: 0, y: 80, rotate: 0 }} animate={{ x: 460, y: -400, rotate: 85, opacity: 0 }} transition={{ duration: .9 }}>✂ {t(mixed ? 'foilBrandMixed' : 'foilBrand')}</motion.div>
      <div className="pack-cards">{items.map((item, i) => <motion.div key={i} initial={{ y: 290, x: (2 - i) * 190, opacity: 0 }} animate={{ y: 0, x: 0, opacity: 1 }} transition={{ ...spring, delay: .15 + i * .1 }} className="flip-perspective">
        <motion.button aria-label={flipped.includes(i) ? (item.card ? item.card.name[i18n.language] || item.card.name.ru : item.reward.kind === 'currency' ? `$${item.reward.amount}` : item.reward.kind === 'xp' ? `+${item.reward.amount} XP` : t('rewardN', { n: i + 1 })) : t(item.card ? 'flipCardN' : 'flipRewardN', { n: i + 1 })} className={`flip-card ${flat.includes(i) ? 'is-flat' : ''}`} onAnimationComplete={() => { if (flipped.includes(i) && !flat.includes(i)) setFlat(prev => [...prev, i]); }} animate={{ rotateY: flat.includes(i) ? 0 : flipped.includes(i) ? 180 : 0 }} transition={flat.includes(i) ? { duration: 0 } : { type: 'spring', stiffness: 160, damping: 19 }} onClick={() => { if (!flipped.includes(i)) { setFlipped(prev => [...prev, i]); chime(); } }}>
          <div className="flip-front"><CardBack /></div><div className="flip-back">{item.card ? <GameCard card={item.card} hoverable={false} /> : <RewardChip reward={item.reward} />}</div>
        </motion.button>{flipped.includes(i) && <Burst color={item.card ? rarityStyle[item.card.rarity].frame : '#d7c07a'} />}
        {flipped.includes(i) && item.duplicate != null && item.card && <p className="duplicate-note" role="status">{t('alreadyInAlbum', { name: item.card.name[i18n.language] || item.card.name.ru, amount: item.duplicate })}</p>}
      </motion.div>)}</div>
      <p>{done ? (dust ? t('dupesTraded', { count: dupes, dust }) : t('lootInCollection')) : items.length ? t('flipEachCard') : t('takeLoot')}</p>
      <InkButton tone="toxic" disabled={!done} onClick={onDone}>{t('toCollection')}</InkButton>
    </>}
    {!ripped && <p className="tear-hint">{t('tearHint')}</p>}
  </div>;
}
function Burst({ color }: { color: string }) {
  return <div className="pointer-events-none absolute inset-0" aria-hidden><motion.div className="absolute inset-0" style={{ boxShadow: `0 0 50px 15px ${color}` }} initial={{ opacity: .8 }} animate={{ opacity: .18 }} transition={{ duration: 1.2 }} />{Array.from({ length: 16 }, (_, i) => <motion.i key={i} className="absolute left-1/2 top-1/2 h-2 w-2" style={{ background: color }} initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos(i * Math.PI / 8) * 160, y: Math.sin(i * Math.PI / 8) * 200, opacity: 0, rotate: 180 }} transition={{ duration: .85 }} />)}</div>;
}
function CaseOpening({ reel, landing, result, onDone }: { reel: ChestTile[]; landing: number; result: { rewards: ShopReward[]; name: string }; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const { catalog } = useEconomy();
  const [done, setDone] = useState(false);
  const lastTile = useRef(0);
  const prize = result.rewards.find(reward => reward.kind === 'card' || reward.kind === 'duplicate');
  const skin = result.rewards.find(reward => reward.kind === 'cosmetic' || reward.kind === 'cosmeticDuplicate');
  const skinDef = skin ? cosmeticById(skin.itemId) : undefined;
  const skinName = skinDef ? pickLoc(skinDef.name, i18n.language) : '';
  const skinItem = skinDef && cosmeticItems(skinDef.kind).find(c => c.shopId === skinDef.id);
  const prizeCard = prize && catalog.find(card => card.id === prize.cardId);
  const duplicate = prize?.kind === 'duplicate' ? prize.amount : undefined;
  return <div className="case-opening"><h2>{t(done ? 'caught' : 'ninthLife')}</h2><p>{t('reelPicks')}</p>
    <div className="roulette-window"><div className="roulette-selector" /><motion.div className="roulette-ribbon" initial={{ x: 0 }} animate={{ x: -(landing * 168 + 84 - 590) }} transition={{ duration: 5.6, ease: [.08, .66, .12, 1] }} onUpdate={latest => { const tile = Math.floor(Math.abs(Number(latest.x)) / 168); if (tile !== lastTile.current) { tick(); lastTile.current = tile; } }} onAnimationComplete={() => { setDone(true); chime('victory'); }}>{reel.map((tile, i) => <ReelTile tile={tile} key={i} />)}</motion.div></div>
    <p role="status">{done ? result.name : t('reelSlowing')}</p>
    <AnimatePresence>{done && <motion.div role="dialog" aria-modal="true" aria-label={t('wonCard')} className="prize-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {prizeCard ? <div className="relative"><Burst color={rarityStyle[prizeCard.rarity].frame} /><motion.div initial={{ scale: .3, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={spring}><GameCard card={prizeCard} scale={1.4} hoverable={false} /></motion.div></div> : null}
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
