import { starterCards, type CardDefinition } from '@kartishki/shared';

/** Written description, statuses and ability lines, joined the way the card renders them. */
export function cardRules(card: CardDefinition, t: (key: string) => string, lang: string, catalog: CardDefinition[] = starterCards) {
  const written = (card.description[lang] || card.description.ru).trim();
  const propertyLines = card.properties.map(key => {
    const name = t(key);
    const hint = t(`${key}Hint`);
    return hint && hint !== `${key}Hint` ? `${name}: ${hint}` : name;
  });
  const abilityLines = card.abilities.map(ability => {
    const target = ability.effectId === 'summon'
      ? (catalog.find(c => c.id === ability.params.cardId)?.name[lang] || catalog.find(c => c.id === ability.params.cardId)?.name.ru || t('minion'))
      : t(String(ability.params.target));
    const amount = ability.params.amount === undefined ? '' : ` ${String(ability.params.amount)}`;
    return `${ability.name?.trim() || t(ability.trigger)}: ${t(ability.effectId)}${amount} — ${target}`;
  });
  return [written, ...propertyLines, ...abilityLines].filter(Boolean).join('\n');
}

/** Property and trigger keys that deserve their own rules window. */
export function cardKeywords(card: CardDefinition) {
  return [...card.properties, ...card.abilities.map(a => a.trigger)].filter((key, index, all) => all.indexOf(key) === index);
}
