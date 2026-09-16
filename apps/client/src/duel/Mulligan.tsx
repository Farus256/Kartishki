import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CardDefinition, HandCard } from '@kartishki/shared';
import { audioManager } from '../AudioManager';
import { SandClock, type Deadline } from '../battlegrounds/PhaseClock';
import { GameCard } from '../ui/GameCard';
import { InkButton } from '../ui/InkButton';

type Props = {
  hand: HandCard[];
  cards: CardDefinition[];
  done: boolean;
  first: boolean;
  deadline: Deadline;
  onConfirm: (replace: string[]) => void;
};

/** Opening hand: tap the cards to send back; the rest stays. The second player is told about The Coin. */
export function Mulligan({ hand, cards, done, first, deadline, onConfirm }: Props) {
  const { t } = useTranslation();
  const [replace, setReplace] = useState<Set<string>>(new Set());
  const toggle = (id: string) => { if (done) return; audioManager.play('card_flip'); setReplace(set => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  return (
    <div className="ab-modal duel-mulligan" role="dialog" aria-label={t('mulligan')} data-testid="duel-mulligan">
      <div className="duel-mulligan-card">
        <header>
          <h2>{done ? t('mulliganWaiting') : t('mulligan')}</h2>
          <p>{first ? t('mulliganFirst') : t('mulliganSecond')}</p>
          <SandClock deadline={deadline} active={!done} urgent />
        </header>
        <div className="duel-mulligan-hand">
          {hand.map(item => {
            const card = cards.find(c => c.id === item.cardId);
            if (!card) return null;
            const out = replace.has(item.instanceId);
            return <button key={item.instanceId} type="button" className={`duel-mulligan-slot ${out ? 'is-out' : ''}`} aria-pressed={out} disabled={done} data-testid={`mulligan-card-${item.instanceId}`} onClick={() => toggle(item.instanceId)}>
              <GameCard card={card} catalog={cards} scale={.8} hoverable={false} />
              {out && <b className="duel-mulligan-mark">✕</b>}
            </button>;
          })}
        </div>
        <footer>
          <p>{replace.size ? t('mulliganReplace', { n: replace.size }) : t('mulliganKeep')}</p>
          <InkButton tone="blood" size="lg" disabled={done} onClick={() => { audioManager.play('ab_end_turn'); onConfirm([...replace]); }} data-testid="mulligan-confirm">{t('mulliganConfirm')}</InkButton>
        </footer>
      </div>
    </div>
  );
}
