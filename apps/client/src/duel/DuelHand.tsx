import { useMemo, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { COIN_CARD_ID, type CardDefinition, type HandCard } from '@kartishki/shared';
import { GameCard } from '../ui/GameCard';
import { DUEL, handOverlap } from './duelLayout';

type Props = {
  hand: HandCard[];
  cards: Map<string, CardDefinition>;
  mana: number;
  boardFull: boolean;
  myTurn: boolean;
  liftedId: string | null;
  /** Ids drawn since the last render: they slide in from the deck. */
  fresh: Set<string>;
  onPress: (id: string, event: ReactPointerEvent<HTMLElement>) => void;
  onPlay: (id: string) => void;
};

/** The hand: full cards fanned at the bottom, playable ones glow, one grows on hover. */
export function DuelHand({ hand, cards, mana, boardFull, myTurn, liftedId, fresh, onPress, onPlay }: Props) {
  const { t, i18n } = useTranslation();
  const catalog = useMemo(() => [...cards.values()], [cards]);
  return (
    <section className="duel-hand" data-testid="duel-hand" data-duel-zone="hand" style={{ '--duel-hand-overlap': `${handOverlap(hand.length)}px` } as CSSProperties}>
      {hand.map((item, index) => {
        const card = cards.get(item.cardId);
        if (!card) return null;
        const coin = card.id === COIN_CARD_ID;
        const playable = myTurn && mana >= card.cost && (coin || !boardFull);
        return (
          <div key={item.instanceId} className={`duel-hand-card ${playable ? 'is-playable' : ''} ${liftedId === item.instanceId ? 'is-lifted' : ''} ${fresh.has(item.instanceId) ? 'is-drawn' : ''} ${coin ? 'is-coin' : ''}`}
            style={{ zIndex: index + 1, animationDelay: fresh.has(item.instanceId) ? `${index * 40}ms` : undefined }}
            data-testid={`duel-hand-card-${item.instanceId}`} data-duel-card={item.cardId}
            aria-label={`${card.name[i18n.language] || card.name.ru}${playable ? '' : ` · ${t('locked')}`}`}
            onDragStart={event => event.preventDefault()}
            onPointerDown={event => { if (playable) onPress(item.instanceId, event); }}
            onClick={() => { if (playable) onPlay(item.instanceId); }}>
            <GameCard card={card} catalog={catalog} scale={DUEL.HAND_SCALE} hoverable={false} />
          </div>
        );
      })}
    </section>
  );
}
