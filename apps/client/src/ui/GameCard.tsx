import { audioManager } from '../AudioManager';
import { CatPortrait } from './CatPortrait';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { CardDefinition } from '@kartishki/shared';
import { useCardArt } from './cardArt';
import { cardRules } from './cardText';
import { craftCost, rarityStyle } from './rarity';
import { spring } from './InkButton';

export const CARD_W = 190;
export const CARD_H = 260;
const BLEED = 10;

type Props = {
  card: CardDefinition;
  scale?: number;
  attack?: number;
  health?: number;
  owned?: boolean;
  selected?: boolean;
  dim?: boolean;
  hoverable?: boolean;
  onClick?: () => void;
};

function Gem({ value, className, fill }: { value: number | string; className: string; fill: string }) {
  return (
    <div className={`absolute z-30 grid h-[40px] w-[40px] rotate-45 place-items-center border-[3px] border-ink ${className}`}
      style={{ background: fill, filter: 'drop-shadow(2px 2px 1px rgba(26,26,26,.45))' }}>
      <span className="-rotate-45 font-stencil text-[19px] text-paper">{value}</span>
    </div>
  );
}

/** Full-size collectible card: rarity frame, centre gem, portrait, rules and stats. */
export function GameCard({ card, scale = 1, attack, health, owned = true, selected, dim, hoverable = true, onClick }: Props) {
  const { t, i18n } = useTranslation();
  const art = useCardArt(card.art, Math.ceil(512 * Math.max(1, scale)));
  const look = rarityStyle[card.rarity];
  const rules = cardRules(card, t, i18n.language);
  const name = card.name[i18n.language] || card.name.ru;
  const titleSize = name.length > 22 ? 'text-[13px]' : name.length > 14 ? 'text-[16px]' : 'text-[20px]';
  const rarityColor = card.rarity === 'ultimate' ? '#0E7490' : '#1A1A1A';
  return (
    <div className="relative shrink-0 overflow-visible" style={{ width: CARD_W * scale + BLEED, height: CARD_H * scale + BLEED }}>
      <motion.div
        className={`game-card-face group absolute origin-top-left overflow-visible ${onClick ? 'cursor-pointer' : ''}`}
        style={{ top: BLEED / 2, left: BLEED / 2, width: CARD_W, height: CARD_H, zoom: scale }}
        whileHover={hoverable ? { scale: 1.15, y: -16, zIndex: 40 } : undefined}
        whileTap={onClick ? { scale: 1.05 } : undefined}
        transition={spring}
        onHoverStart={() => { if (hoverable) audioManager.play('card_hover'); }}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
        aria-label={owned ? name : `${name} — ${t('locked')}`}
      >
        <div className="pointer-events-none absolute -inset-4 z-0 opacity-0 blur-xl transition-opacity duration-200 group-hover:opacity-100"
          style={{ background: `radial-gradient(closest-side, ${look.glow}, transparent 78%)` }} />

        <div className={`relative flex h-full w-full flex-col border-[4px] bg-paper shadow-[7px_8px_0_rgba(26,26,26,.45)] ${look.foil ? 'ultimate-fracture foil-sheen' : 'ink-edge'} ${dim ? 'opacity-55' : ''}`}
          style={{ borderColor: selected ? '#D92525' : look.frame, boxShadow: selected ? `0 0 0 3px #D92525, 7px 8px 0 rgba(26,26,26,.45)` : undefined }}>
          <div className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(150deg, ${look.frame}22, transparent 55%)` }} />
          {card.rarity === 'legendary' && (
            <div className="pointer-events-none absolute inset-[4px] border-[2px] border-legendary/70"
              style={{ clipPath: 'polygon(0 10%, 10% 0, 90% 0, 100% 10%, 100% 90%, 90% 100%, 10% 100%, 0 90%)' }} />
          )}
          {card.rarity === 'legendary' && Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="legendary-spark pointer-events-none absolute h-[3px] w-[3px] bg-legendary"
              style={{ left: `${12 + (i * 9) % 76}%`, top: `${14 + (i * 17) % 62}%`, animationDelay: `${i * 0.14}s` }} />
          ))}

          <div className="relative mx-[10px] mt-[9px] h-[108px] shrink-0 overflow-hidden border-[2px] border-ink bg-[#e0e0e0]">
            {art && <img src={art} alt="" className={`h-full w-full object-cover ${owned ? '' : 'brightness-[.18] contrast-200'}`} draggable={false} />}
            {!art && <div className={owned ? 'h-full' : 'h-full brightness-[.18]'}><CatPortrait seed={card.id} /></div>}
            {!owned && <span className="absolute inset-0 grid place-items-center font-hand text-[64px] text-paper/85">?</span>}
          </div>

          <div className={`relative z-20 mx-auto -mt-[10px] mb-1 h-[20px] w-[20px] shrink-0 rotate-45 border-[2px] border-ink ${look.pulse ? 'gem-pulse' : ''}`}
            style={{ background: `radial-gradient(circle at 32% 30%, #ffffffcc, ${look.gem} 62%, ${look.deep})` }} />

          <div className="relative z-10 mx-[10px] mb-[10px] flex min-h-0 flex-1 flex-col items-center gap-1 pt-1">
            <h3 className={`w-full text-center font-hand leading-[1.1] break-words ${titleSize}`} style={{ color: '#1A1A1A' }}>{name}</h3>
            <p className="min-h-0 w-full flex-1 overflow-hidden text-center font-mono text-[10px] leading-[1.25] whitespace-pre-line" style={{ color: '#1A1A1A' }}>{rules}</p>
            <span className="mt-auto font-mono text-[8px] tracking-[2px] uppercase" style={{ color: rarityColor }}>{t(card.rarity)}</span>
          </div>
        </div>

        <Gem value={card.cost} className="-top-1.5 -left-1.5" fill="#2E8B57" />
        {owned ? <>
          <Gem value={attack ?? card.attack} className="-bottom-1.5 -left-1.5" fill="#1A1A1A" />
          <Gem value={health ?? card.health} className="-right-1.5 -bottom-1.5" fill="#D92525" />
        </> : (
          <span className="absolute -bottom-1.5 left-1/2 z-30 -translate-x-1/2 border-[2px] border-ink bg-ink px-2 py-[2px] font-mono text-[11px] text-legendary"
            style={{ filter: 'drop-shadow(2px 2px 0 rgba(26,26,26,.45))' }}>$ {craftCost[card.rarity]}</span>
        )}
      </motion.div>
    </div>
  );
}

/** Polaroid-style locked slot for empty album cells. */
export function LockedSlot({ scale = 1 }: { scale?: number }) {
  return (
    <div className="relative shrink-0 overflow-visible" style={{ width: CARD_W * scale + BLEED, height: CARD_H * scale + BLEED }} aria-hidden="true">
      <div className="ink-edge absolute origin-top-left border-[3px] border-ink bg-[#3f3b34] shadow-[6px_7px_0_rgba(26,26,26,.4)]"
        style={{ top: BLEED / 2, left: BLEED / 2, width: CARD_W, height: CARD_H, scale }}>
        <div className="absolute inset-0 opacity-50"
          style={{ backgroundImage: 'repeating-linear-gradient(-22deg, transparent 0 4px, #1a1a1a 4px 5px), repeating-linear-gradient(68deg, transparent 0 6px, #1a1a1a 6px 7px)' }} />
        <div className="absolute inset-[12px] bottom-[32px] grid place-items-center border-[2px] border-ink bg-[#1c1a16]"
          style={{ boxShadow: 'inset 2px 2px 0 #0006, 1px 1px 0 #efece422' }}>
          <span className="font-hand text-[82px] leading-none text-paper" style={{ transform: 'rotate(-8deg)', textShadow: '2px 2px 0 #000' }}>?</span>
        </div>
        <div className="absolute right-[10px] bottom-[8px] left-[10px] h-[16px] border-t-[2px] border-dashed border-ink/70 bg-[#cfc6b4]/40" />
      </div>
    </div>
  );
}

/** Sealed reverse used while a pack card is still face down. */
export function CardBack({ scale = 1, glow }: { scale?: number; glow?: string }) {
  return (
    <div className="ink-edge relative overflow-hidden border-[4px] border-ink bg-ink shadow-[7px_8px_0_rgba(26,26,26,.45)]"
      style={{ width: CARD_W * scale, height: CARD_H * scale, boxShadow: glow ? `0 0 26px 4px ${glow}` : undefined }}>
      <div className="absolute inset-0 opacity-30"
        style={{ backgroundImage: 'repeating-linear-gradient(45deg,#efece4 0 2px,transparent 2px 9px)' }} />
      <div className="absolute inset-[14px] grid place-items-center border-[3px] border-paper/70">
        <span className="font-hand text-[86px] text-paper">✳</span>
      </div>
    </div>
  );
}
