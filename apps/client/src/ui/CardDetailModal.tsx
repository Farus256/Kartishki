import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { CardDefinition } from '@kartishki/shared';
import { GameCard } from './GameCard';
import { cardKeywords, cardRules } from './cardText';
export function CardDetailModal({ card, catalog, onClose, onAdd, canAdd }: { catalog: CardDefinition[]; card: CardDefinition; onClose: () => void; onAdd: () => void; canAdd: boolean }) {
  const { t, i18n } = useTranslation(); const root = useRef<HTMLDivElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement; root.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keys = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); if (event.key === 'Tab') { const buttons = [...root.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]; const index = buttons.indexOf(document.activeElement as HTMLButtonElement); event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus(); } };
    document.addEventListener('keydown', keys); return () => { document.removeEventListener('keydown', keys); previous?.focus(); };
  }, [onClose]);
  return <div className="card-detail-backdrop" onClick={onClose}><div ref={root} role="dialog" aria-modal="true" aria-label={`Карта: ${card.name.ru}`} className="card-detail-modal" onClick={e => e.stopPropagation()}><button className="detail-close" onClick={onClose}>Закрыть ×</button><GameCard card={card} catalog={catalog} scale={1.85} hoverable={false} /><section className="detail-rules"><h2>{card.name[i18n.language] || card.name.ru}</h2><p>{t(card.rarity)} · {card.minionTypes.join(', ')}</p><p className="full-card-text">{cardRules(card,t,i18n.language,catalog) || t('noRules')}</p>{cardKeywords(card).map(k => <div key={k}><h3>{t(k)}</h3><p>{t(`${k}Hint`)}</p></div>)}<button disabled={!canAdd} onClick={onAdd}>Добавить в колоду</button></section></div></div>;
}
