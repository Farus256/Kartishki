import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { CardDefinition } from '@kartishki/shared';
import { useCardArt } from './cardArt';
import { cardRules } from './cardText';
import { craftCost, rarityStyle } from './rarity';
import { spring } from './InkButton';

export const CARD_W = 190;
export const CARD_H = 260;

type Props = {
  card: CardDefinition;
  scale?: number;
  attack?: number;
  health?: number;
  owned?: boolean;
  copies?: string;
  selected?: boolean;
  dim?: boolean;
  hoverable?: boolean;
  onClick?: () => void;
};

/** Full-size collectible card: rarity frame, centre gem, portrait, rules and stats. */
export function GameCard({ card, scale = 1, attack, health, owned = true, copies, selected, dim, hoverable = true, onClick }: Props) {
  const { t, i18n } = useTranslation();
  const art = useCardArt(card.art, 256);
  const look = rarityStyle[card.rarity];
  const rules = cardRules(card, t, i18n.language);
  const name = card.name[i18n.language] || card.name.ru;
  return (
    <div className="relative shrink-0" style={{ width: CARD_W * scale, height: CARD_H * scale }}>
      <motion.div
        className={`group absolute top-0 left-0 origin-top-left ${onClick ? 'cursor-pointer' : ''}`}
        style={{ width: CARD_W, height: CARD_H, scale }}
        whileHover={hoverable ? { scale: scale * 1.15, y: -16, zIndex: 40 } : undefined}
        whileTap={onClick ? { scale: scale * 1.05 } : undefined}
        transition={spring}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        aria-label={owned ? name : `${name} — ${t('locked')}`}
      >
        {/* Ambient rarity aura, revealed on hover. */}
        <div className="pointer-events-none absolute -inset-4 opacity-0 blur-xl transition-opacity duration-200 group-hover:opacity-100"
          style={{ background: `radial-gradient(closest-side, ${look.glow}, transparent 78%)` }} />

        <div className={`relative h-full w-full overflow-hidden border-[4px] bg-paper shadow-[7px_8px_0_rgba(26,26,26,.45)] ${look.foil ? 'ultimate-fracture foil-sheen' : 'ink-edge'} ${dim ? 'opacity-55' : ''}`}
          style={{ borderColor: selected ? '#D92525' : look.frame, boxShadow: selected ? `0 0 0 3px #D92525, 7px 8px 0 rgba(26,26,26,.45)` : undefined }}>
          <div className="absolute inset-0" style={{ background: `linear-gradient(150deg, ${look.frame}22, transparent 55%)` }} />
          {card.rarity === 'legendary' && (
            <div className="pointer-events-none absolute inset-[4px] border-[2px] border-legendary/70"
              style={{ clipPath: 'polygon(0 10%, 10% 0, 90% 0, 100% 10%, 100% 90%, 90% 100%, 10% 100%, 0 90%)' }} />
          )}
          {card.rarity === 'legendary' && Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="legendary-spark pointer-events-none absolute h-[3px] w-[3px] bg-legendary"
              style={{ left: `${12 + (i * 9) % 76}%`, top: `${14 + (i * 17) % 62}%`, animationDelay: `${i * 0.14}s` }} />
          ))}

          <div className="absolute top-[9px] left-[10px] h-[118px] w-[162px] overflow-hidden border-[2px] border-ink bg-[#e0e0e0]">
            {art && <img src={art} alt="" className={`h-full w-full object-cover ${owned ? '' : 'brightness-[.18] contrast-200'}`} draggable={false} />}
            {!owned && <span className="absolute inset-0 grid place-items-center font-hand text-[64px] text-paper/85">?</span>}
          </div>

          {/* Mana crystal */}
          <div className="absolute -top-[6px] -left-[6px] grid h-[40px] w-[40px] rotate-45 place-items-center border-[3px] border-ink bg-toxic">
            <span className="-rotate-45 font-stencil text-[19px] text-paper">{card.cost}</span>
          </div>

          {/* Rarity gem */}
          <div className={`absolute top-[118px] left-1/2 h-[20px] w-[20px] -translate-x-1/2 rotate-45 border-[2px] border-ink ${look.pulse ? 'gem-pulse' : ''}`}
            style={{ background: `radial-gradient(circle at 32% 30%, #ffffffcc, ${look.gem} 62%, ${look.deep})` }} />

          <h3 className="absolute top-[133px] w-full truncate px-[10px] text-center font-hand text-[21px] leading-none text-ink">{name}</h3>
          <p className="absolute top-[158px] w-full px-[11px] text-center font-mono text-[9.5px] leading-[1.25] whitespace-pre-line text-ink/85"
            style={{ maxHeight: 52, overflow: 'hidden' }}>{rules}</p>

          <span className="absolute bottom-[36px] left-1/2 -translate-x-1/2 font-mono text-[8px] tracking-[2px] uppercase"
            style={{ color: look.frame }}>{t(card.rarity)}</span>

          {owned ? <>
            <div className="absolute -bottom-[4px] -left-[4px] grid h-[38px] w-[38px] rotate-45 place-items-center border-[3px] border-ink bg-ink">
              <span className="-rotate-45 font-stencil text-[18px] text-paper">{attack ?? card.attack}</span>
            </div>
            <div className="absolute -right-[4px] -bottom-[4px] grid h-[38px] w-[38px] rotate-45 place-items-center border-[3px] border-ink bg-blood">
              <span className="-rotate-45 font-stencil text-[18px] text-paper">{health ?? card.health}</span>
            </div>
          </> : (
            <div className="absolute right-0 bottom-0 left-0 border-t-[3px] border-ink bg-ink py-[5px] text-center font-mono text-[11px] text-legendary">
              {craftCost[card.rarity]} ✦
            </div>
          )}

          {copies && (
            <span className="absolute top-[6px] right-[6px] border-[2px] border-ink bg-paper px-[6px] font-mono text-[11px] text-ink">{copies}</span>
          )}
        </div>
      </motion.div>
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
