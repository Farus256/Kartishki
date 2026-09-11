import { useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import i18n from '@kartishki/i18n';
import { CASE_COST, PACK_COST, type CardDefinition, type CaseResult, type LootCard, type PackResult } from '@kartishki/shared';
import { playerSession } from '../playerSession';
import { Backdrop } from '../ui/Backdrop';
import { CardBack, GameCard } from '../ui/GameCard';
import { InkButton, spring } from '../ui/InkButton';
import { TopBar } from '../ui/TopBar';
import { rarityOrder, rarityStyle } from '../ui/rarity';
import { useCardArt } from '../ui/cardArt';
import { useCatalog } from '../ui/useCatalog';
import { chime } from '../ui/sfx';

const TILE = 168;
const WINDOW = 1180;

export function ShopScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const player = useSyncExternalStore(playerSession.subscribe, playerSession.getSnapshot);
  const catalog = useCatalog();
  const [tab, setTab] = useState<'packs' | 'cases'>('packs');
  const [pack, setPack] = useState<PackResult>();
  const [ripped, setRipped] = useState(false);
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [burst, setBurst] = useState(0);
  const [crate, setCrate] = useState<CaseResult>();
  const [spinning, setSpinning] = useState(false);
  const [prize, setPrize] = useState<LootCard>();

  const balance = player.library?.profile.currency ?? 0;
  const definition = (loot: LootCard): CardDefinition =>
    catalog.find(card => card.id === loot.id) ?? { ...catalog[0], id: loot.id, name: loot.name, rarity: loot.rarity as CardDefinition['rarity'] };

  async function openPack() {
    const result = await playerSession.openPack();
    if (!result) return;
    setPack(result); setRipped(false); setFlipped(new Set());
  }

  function ripPack() {
    if (ripped) return;
    setRipped(true); setBurst(n => n + 1); chime('reveal');
  }

  async function openCase() {
    const result = await playerSession.openCase();
    if (!result) return;
    setPrize(undefined); setCrate(result); setSpinning(true);
    setTimeout(() => { setSpinning(false); setPrize(result.prize); chime('victory'); }, 4300);
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      <Backdrop />
      <TopBar right={<InkButton size="sm" onClick={onBack}>{t('backToMenu')}</InkButton>} />

      <div className="absolute top-[104px] left-[60px] flex gap-3">
        {(['packs', 'cases'] as const).map(key => (
          <InkButton key={key} size="sm" tone={tab === key ? 'ink' : 'paper'} onClick={() => setTab(key)}>{t(key === 'packs' ? 'tabPacks' : 'tabCases')}</InkButton>
        ))}
        {player.error && <span role="alert" className="ml-4 self-center font-mono text-[12px] text-blood">{t(player.error)}</span>}
      </div>

      {tab === 'packs' ? (
        <section className="absolute top-[160px] right-0 bottom-0 left-0 px-[60px]">
          {!pack || !ripped ? (
            <div className="flex h-[600px] flex-col items-center justify-center">
              <motion.div
                drag={!!pack} dragSnapToOrigin dragConstraints={{ left: 80, right: 80, top: 90, bottom: 40 }}
                whileHover={pack ? { scale: 1.06, rotate: -2 } : undefined}
                animate={pack ? { y: 0, rotate: [0, -3, 2, 0] } : { y: [0, -12, 0] }}
                transition={pack ? { ...spring, rotate: { duration: 1.8, repeat: Infinity } } : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                onDragEnd={(_, info) => { if (Math.hypot(info.offset.x, info.offset.y) > 48) ripPack(); }}
                onClick={() => { if (pack) ripPack(); }}
                role={pack ? 'button' : undefined} aria-label={pack ? t('ripPack') : undefined} className={pack ? 'cursor-grab active:cursor-grabbing' : undefined}
              >
                <CardBack scale={1.5} glow={pack ? 'rgba(217,37,37,.55)' : 'rgba(245,158,11,.55)'} />
              </motion.div>
              {/* Ritual pedestal */}
              <div className="mt-[-10px] h-[26px] w-[420px] border-[4px] border-ink bg-ink/85" />
              <div className="h-[16px] w-[520px] border-[4px] border-ink bg-paper" />
              <p className="mt-6 font-hand text-[30px] text-ink">{pack ? t('packDragHint') : t('packPedestal')}</p>
              {!pack && (
                <div className="mt-5">
                  <InkButton tone="gold" size="lg" disabled={player.loading || balance < PACK_COST} onClick={() => void openPack()}>
                    {t('buyPack', { cost: PACK_COST })}
                  </InkButton>
                </div>
              )}
            </div>
          ) : (
            <div className="relative flex h-[600px] flex-col items-center justify-center">
              <AnimatePresence>
                {Array.from({ length: 20 }, (_, n) => (
                  <motion.span key={`${burst}-${n}`} className="pointer-events-none absolute top-[42%] left-1/2 h-[10px] w-[10px] bg-ink"
                    initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                    animate={{ opacity: 0, scale: 0.2, x: Math.cos(n) * (240 + n * 12), y: Math.sin(n * 2) * (170 + n * 7), rotate: n * 40 }}
                    transition={{ duration: 1.1, ease: 'easeOut' }} />
                ))}
              </AnimatePresence>

              <div className="flex gap-[20px]">
                {pack.cards.map((loot, index) => {
                  const look = rarityStyle[loot.rarity as CardDefinition['rarity']];
                  const open = flipped.has(index);
                  return (
                    <motion.div key={index} className="[perspective:1200px]"
                      initial={{ y: -220, opacity: 0, rotate: -12 }} animate={{ y: 0, opacity: 1, rotate: 0 }}
                      transition={{ ...spring, delay: 0.12 * index }}>
                      <motion.div className={`pack-card relative [transform-style:preserve-3d] ${open ? '' : 'closed'}`}
                        style={{ width: 190 * 0.95, height: 260 * 0.95 }}
                        animate={{ rotateY: open ? 180 : 0 }} transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                        onClick={() => { if (!open) { setFlipped(prev => new Set(prev).add(index)); chime('reveal'); } }}>
                        <motion.div className="absolute inset-0 cursor-pointer [backface-visibility:hidden]"
                          whileHover={open ? undefined : { scale: 1.06, boxShadow: `0 0 34px 8px ${look.glow}` }}
                          aria-label={t('flipCard')} role="button"
                          onClick={() => { if (!open) { setFlipped(prev => new Set(prev).add(index)); chime('reveal'); } }}>
                          <CardBack scale={0.95} />
                        </motion.div>
                        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                          <GameCard card={definition(loot)} scale={0.95} hoverable={false} />
                        </div>
                      </motion.div>
                    </motion.div>
                  );
                })}
              </div>

              <p className="mt-7 font-mono text-[12px] tracking-[2px] text-ink/60">
                {flipped.size < pack.cards.length ? t('flipHint') : t('packOpened')}
              </p>
              <div className="mt-4 flex gap-4">
                <InkButton tone="gold" disabled={player.loading || balance < PACK_COST} onClick={() => void openPack()}>{t('buyPack', { cost: PACK_COST })}</InkButton>
                <InkButton onClick={() => { setPack(undefined); setRipped(false); }}>{t('done')}</InkButton>
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="absolute top-[170px] right-0 bottom-0 left-0 flex flex-col items-center">
          <div className="relative overflow-hidden border-y-[4px] border-ink bg-ink/10" style={{ width: WINDOW, height: 250 }}>
            <div className="pointer-events-none absolute top-0 bottom-0 left-1/2 z-20 w-[4px] -translate-x-1/2 bg-blood" />
            <div className="pointer-events-none absolute inset-0 z-10"
              style={{ background: 'linear-gradient(90deg,#efece4 0%,transparent 16%,transparent 84%,#efece4 100%)' }} />
            <motion.div className="absolute top-0 left-0 flex"
              animate={{ x: crate ? -(crate.landing * TILE + TILE / 2 - WINDOW / 2) : 0 }}
              transition={spinning ? { duration: 4.2, ease: [0.06, 0.72, 0.09, 1] } : { duration: 0 }}>
              {(crate ? crate.reel.map((loot, index) => (
                <ReelTile key={index} loot={loot} card={definition(loot)} />
              )) : Array.from({ length: 14 }, (_, n) => catalog[n % Math.max(catalog.length, 1)]).map((card, index) => (
                <ReelTile key={index} loot={card ?? { id: '', rarity: rarityOrder[index % rarityOrder.length], name: { ru: '?' } }} card={card} />
              )))}
            </motion.div>
          </div>

          <p className="mt-6 font-hand text-[30px] text-ink">{t('casePedestal')}</p>
          <div className="mt-4">
            <InkButton tone="gold" size="lg" disabled={player.loading || spinning || balance < CASE_COST} onClick={() => void openCase()}>
              {t('openCase', { cost: CASE_COST })}
            </InkButton>
          </div>
        </section>
      )}

      <AnimatePresence>
        {prize && (
          <motion.div className="absolute inset-0 z-50 grid place-items-center bg-black/80"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPrize(undefined)}>
            <motion.div initial={{ scale: 0.3, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 180, damping: 14 }}>
              <GameCard card={definition(prize)} scale={1.5} hoverable={false} />
            </motion.div>
            <motion.p className="absolute bottom-[90px] font-hand text-[44px] text-paper"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              {t('caseOpened')} — {t(prize.rarity)}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReelTile({ loot, card }: { loot: LootCard; card?: CardDefinition }) {
  const art = useCardArt(card?.art ?? { url: '', crop: { x: 0, y: 0, size: 1 }, threshold: 0.5, contrast: 1.5 }, 128);
  const look = rarityStyle[loot.rarity as CardDefinition['rarity']] ?? rarityStyle.common;
  return (
    <div className="relative shrink-0 border-r-[2px] border-ink/40 bg-paper" style={{ width: TILE, height: 250 }}>
      <div className="absolute inset-[10px] bottom-[38px] overflow-hidden border-[2px] border-ink">
        {art && <img src={art} alt="" className="h-full w-full object-cover" draggable={false} />}
      </div>
      <p className="absolute right-[10px] bottom-[16px] left-[10px] truncate text-center font-mono text-[11px]">
        {card ? (card.name[i18n.language] || card.name.ru) : '?'}
      </p>
      <div className="absolute right-0 bottom-0 left-0 h-[8px]" style={{ background: look.frame }} />
    </div>
  );
}
