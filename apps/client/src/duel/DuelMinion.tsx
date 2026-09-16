import { forwardRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { CardDefinition } from '@kartishki/shared';
import { AnimatedNumber } from '../battlegrounds/AnimatedNumber';
import { idlePhase, TauntFrame } from '../battlegrounds/cardBadges';
import { HeartIcon, SwordIcon } from '../battlegrounds/MinionTile';
import type { Minion } from '../session';
import { useCardArt } from '../ui/cardArt';
import { GameCard } from '../ui/GameCard';
import { PaperTooltip } from '../ui/PaperTooltip';
import { PortraitPlaceholder } from '../ui/PortraitPlaceholder';

type Props = {
  minion: Minion;
  card: CardDefinition;
  catalog: CardDefinition[];
  own: boolean;
  /** Left edge inside the row; the row's CSS sets the top. */
  x: number;
  /** Health to show instead of the state's, while a blow is still flying. */
  shownHealth?: number;
  canAttack: boolean;
  selected: boolean;
  /** Legal target of the current aim (glows) / not a target (dims). */
  target: boolean;
  dim: boolean;
  dying: boolean;
  onPress: (event: ReactPointerEvent<HTMLElement>) => void;
  onClick: () => void;
};

/** A minion on the table: the Battlegrounds token look on a 1v1 card, full card on hover. */
export const DuelMinion = forwardRef<HTMLDivElement, Props>(function DuelMinion({ minion, card, catalog, own, x, shownHealth, canAttack, selected, target, dim, dying, onPress, onClick }, ref) {
  const { t, i18n } = useTranslation();
  const art = useCardArt(card.art);
  const name = card.name[i18n.language] || card.name.ru;
  const health = shownHealth ?? minion.health;
  const tone = (now: number, base: number) => now === base ? '' : now > base ? ' is-buffed' : ' is-nerfed';
  const taunt = card.properties.includes('taunt');
  return (
    <div ref={ref} className={`duel-tile ${own ? 'is-own' : 'is-foe'} ${canAttack ? 'can-attack' : ''} ${selected ? 'is-selected' : ''} ${target ? 'is-target' : ''} ${dim ? 'is-dim' : ''} ${dying ? 'is-dying' : ''}`}
      style={{ left: x, '--idle-phase': `${(-idlePhase(minion.id) * 3.1).toFixed(2)}s` } as CSSProperties}
      data-duel-id={minion.id} data-duel-target={own ? undefined : minion.id} data-testid={`duel-minion-${minion.id}`}>
      <div className="duel-tile-body">
        <PaperTooltip className="ab-minion-wrap" placement="right" boxClassName="paper-tooltip is-dossier duel-dossier" delay={260}
          content={dying ? null : <GameCard card={card} catalog={catalog} attack={minion.attack} health={health} scale={.78} hoverable={false} />}>
          <button type="button" aria-label={`${name} ${minion.attack}/${health}${own ? (minion.ready ? '' : ` · ${t('sleeping')}`) : ''}`}
            className={`ab-minion is-token ${canAttack ? 'is-draggable' : ''} ${selected ? 'is-selected' : ''} ${target ? 'is-target' : ''} ${dim ? 'is-dim' : ''}`}
            aria-disabled={!canAttack && own}
            onDragStart={event => event.preventDefault()}
            onPointerDown={event => { if (canAttack) onPress(event); }}
            onClick={onClick}>
            <i className="ab-token-shadow" aria-hidden />
            <span className="ab-minion-art">{art ? <img src={art} alt="" draggable={false} /> : <PortraitPlaceholder seed={card.id} />}</span>
            {taunt && <TauntFrame />}
            {minion.shield && <span className="ab-shield-bubble" aria-hidden="true" />}
            {own && !minion.ready && !dying && <em className="duel-sleep" aria-hidden>zZ</em>}
            <span className="ab-minion-stats">
              <b className={tone(minion.attack, card.attack)} aria-label={`${t('attack')}: ${minion.attack}`}><SwordIcon /><AnimatedNumber value={minion.attack} /></b>
              <i className={tone(health, minion.maxHealth)} aria-label={`${t('health')}: ${health}`}><HeartIcon /><AnimatedNumber value={health} /></i>
            </span>
          </button>
        </PaperTooltip>
      </div>
    </div>
  );
});
