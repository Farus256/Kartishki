import { useTranslation } from 'react-i18next';
import type { CardDefinition } from '@kartishki/shared';
import { cardKeywords, cardRules } from './cardText';
import { GameCard } from './GameCard';
export function CardInspect({ card, catalog, attack, health }: { catalog?: CardDefinition[]; card: CardDefinition; attack?: number; health?: number }) {
  const { t, i18n } = useTranslation();
  return <><article className="card-detail"><GameCard card={card} catalog={catalog} attack={attack} health={health} scale={1.25} hoverable={false} /></article>
    <div className="inspect-hints"><aside className="inspect-hint"><strong>{card.name[i18n.language] || card.name.ru}</strong><p className="inspect-text">{cardRules(card, t, i18n.language, catalog) || t('noRules')}</p></aside>
    {cardKeywords(card).map(key => <aside key={key} className="inspect-hint"><strong>{t(key)}</strong><p>{t(`${key}Hint`)}</p></aside>)}</div></>;
}
