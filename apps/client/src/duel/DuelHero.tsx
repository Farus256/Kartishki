import { forwardRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MATCH_RULES, type CardDefinition, type HeroDefinition } from '@kartishki/shared';
import { AnimatedNumber } from '../battlegrounds/AnimatedNumber';
import { HeartIcon } from '../battlegrounds/MinionTile';
import type { Player } from '../session';
import { useCardArt } from '../ui/cardArt';
import { heroAbilityText } from '../ui/HeroPortrait';
import { PaperTooltip } from '../ui/PaperTooltip';
import { PortraitPlaceholder } from '../ui/PortraitPlaceholder';

type Props = {
  player: Player;
  hero?: HeroDefinition;
  cards: CardDefinition[];
  own: boolean;
  /** Hero health to show while a blow is still flying. */
  shownHealth?: number;
  target: boolean;
  dim: boolean;
  powerReady: boolean;
  powerAiming: boolean;
  onPowerPress?: (event: ReactPointerEvent<HTMLElement>) => void;
  onPower?: () => void;
  onClick: () => void;
};

/** Portrait with the health gem, name plaque, mana crystals and the power gem; the foe's version sits at the top. */
export const DuelHero = forwardRef<HTMLDivElement, Props>(function DuelHero({ player, hero, cards, own, shownHealth, target, dim, powerReady, powerAiming, onPowerPress, onPower, onClick }, ref) {
  const { t } = useTranslation();
  const art = useCardArt(hero?.art ?? { url: '', crop: { x: .5, y: .5, size: 1 }, threshold: .5, contrast: 1 }, 512);
  const health = shownHealth ?? player.health;
  const ability = hero?.ability;
  return (
    <div ref={ref} className={`duel-hero ${own ? 'is-own' : 'is-foe'} ${target ? 'is-target' : ''} ${dim ? 'is-dim' : ''} ${health <= 0 ? 'is-lethal' : ''} ${player.connected ? '' : 'is-away'}`} data-testid={own ? 'duel-hero-own' : 'duel-hero-foe'}>
      <div className="ab-hero-face duel-hero-face" data-duel-target={own ? undefined : player.id} data-testid={own ? 'duel-face-own' : 'duel-face-foe'} onClick={onClick} role={own ? undefined : 'button'} aria-label={own ? t('you') : t('opponent')}>
        {art ? <img src={art} alt="" draggable={false} /> : <PortraitPlaceholder seed={hero?.id ?? player.id} />}
        <span className="ab-hero-health" aria-label={`${t('health')}: ${health}`}><HeartIcon /><AnimatedNumber value={health} /></span>
        {!player.connected && <em className="duel-away">{t('offline')}</em>}
      </div>
      <div className="ab-hero-vitals duel-hero-name"><strong>{hero?.name ?? (own ? t('you') : t('opponent'))}</strong></div>
      <div className="duel-mana" aria-label={`${t('mana')}: ${player.mana}/${player.maxMana}`} data-testid={own ? 'duel-mana-own' : 'duel-mana-foe'}>
        <strong><AnimatedNumber value={player.mana} /><em>/{player.maxMana}</em></strong>
        <span className="duel-crystals" aria-hidden>{Array.from({ length: MATCH_RULES.MAX_MANA }, (_, i) => <i key={i} className={i < player.mana ? 'is-full' : i < player.maxMana ? 'is-spent' : ''} />)}</span>
      </div>
      {ability && (
        <PaperTooltip className="ab-hero-power-anchor duel-power-anchor" content={<><strong>{ability.name}</strong><p>◆ {ability.cost} · {t('powerOncePerTurn')}</p><p>{heroAbilityText(hero!, cards)}</p></>}>
          {own
            ? <button type="button" className={`ab-power ${player.powerUsed ? 'is-exhausted' : ''} ${powerReady ? 'is-ready' : ''} ${powerAiming ? 'is-aiming' : ''}`} aria-disabled={!powerReady} data-testid="duel-power"
              onDragStart={event => event.preventDefault()}
              onPointerDown={event => { if (powerReady && ability.effectId === 'damage') onPowerPress?.(event); }}
              onClick={() => { if (powerReady) onPower?.(); }}>
              <b>{ability.name}</b><span>{player.powerUsed ? t('abExhausted') : `◆ ${ability.cost}`}</span>
            </button>
            : <div className={`ab-power ${player.powerUsed ? 'is-exhausted' : ''}`} data-testid="duel-power-foe"><b>{ability.name}</b><span>{player.powerUsed ? t('abExhausted') : `◆ ${ability.cost}`}</span></div>}
        </PaperTooltip>
      )}
      <div className="duel-deck" aria-label={`${t('deck')}: ${player.deckCount}`} data-testid={own ? 'duel-deck-own' : 'duel-deck-foe'}>
        <i /><i /><i /><b>{player.deckCount}</b>
      </div>
      {!own && <div className="duel-foe-hand" aria-label={`${t('handLabel')}: ${player.handCount}`} data-testid="duel-foe-hand">{Array.from({ length: player.handCount }, (_, i) => <i key={i} style={{ '--n': i - (player.handCount - 1) / 2 } as CSSProperties} />)}</div>}
    </div>
  );
});
