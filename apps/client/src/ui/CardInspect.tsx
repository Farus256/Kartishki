import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { renderPhoto } from '@kartishki/shared/photo';
import type { CardDefinition } from '@kartishki/shared';
import { cardKeywords, cardRules } from './cardText';

/** Enlarged card plus one rules window per keyword, shown while inspecting a card. */
export function CardInspect({ card, attack, health }: { card: CardDefinition; attack?: number; health?: number }) {
  const { t, i18n } = useTranslation();
  const photo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void renderPhoto(card.art, 640).then(canvas => { if (!cancelled) photo.current?.replaceChildren(canvas); }).catch(() => {});
    }, 40);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [card.art]);
  const keywords = cardKeywords(card);
  const text = cardRules(card, t, i18n.language);
  return <>
    <article className="inspect-card card-detail">
      <span className="inspect-cost">{card.cost}</span>
      <div ref={photo} className="inspect-art" />
      <h2>{card.name[i18n.language] || card.name.ru}</h2>
      <p className="inspect-meta">{t(card.rarity)}{card.minionTypes.length ? ` · ${card.minionTypes.join(', ')}` : ''}</p>
      <p className="inspect-text">{text || t('noRules')}</p>
      <div className="inspect-stats"><span>⚔ {attack ?? card.attack}</span><span>♥ {health ?? card.health}</span></div>
    </article>
    {keywords.length > 0 && <div className="inspect-hints">{keywords.map(key =>
      <aside key={key} className="inspect-hint"><strong>{t(key)}</strong><p>{t(`${key}Hint`)}</p></aside>)}</div>}
  </>;
}
