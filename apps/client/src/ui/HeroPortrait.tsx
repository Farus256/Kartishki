import type { HeroDefinition, CardDefinition } from '@kartishki/shared';
import { useCardArt } from './cardArt';
import i18n from '@kartishki/i18n';
export function heroAbilityText(hero: HeroDefinition, cards: CardDefinition[] = []) {
  const a = hero.ability;
  return a.effectId === 'summon' ? `Призывает ${a.amount} существ${cards.find(c => c.id === a.cardId) ? `: ${cards.find(c => c.id === a.cardId)!.name.ru}` : ""}.` : a.effectId === 'heal' ? `Восстанавливает герою ${a.amount} здоровья.` : `Наносит выбранной цели ${a.amount} урона. Герой противника защищён, пока у него есть существа.`;
}
export function HeroPortrait({ hero, cards }: { hero: HeroDefinition; cards?: CardDefinition[] }) {
  const art = useCardArt(hero.art, 768);
  return <article className="hero-portrait"><div className="hero-photo">{art && <img src={art} alt={hero.name} />}</div><span className="hero-health">♥ {hero.health}</span><h2>{hero.name}</h2><p>{hero.description}</p><div className="hero-ability"><strong>{hero.ability.name}</strong><span>◆ {i18n.t('heroPowerCost', { cost: hero.ability.cost })}</span><p>{heroAbilityText(hero, cards)}</p></div></article>;
}
