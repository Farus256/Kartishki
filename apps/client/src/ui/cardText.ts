import { starterCards, type CardDefinition } from '@kartishki/shared';

/** Written description, statuses and ability lines, joined the way the card renders them. */
export function cardRules(card: CardDefinition, t: (key: string) => string, lang: string, catalog: CardDefinition[] = starterCards) {
  const written = (card.description[lang] || card.description.ru).trim();
  const listed = card.properties.map(p => t(p)).join(', ');
  const lines = card.abilities.map(a => `${a.name?.trim() || t(a.trigger)}: ${t(a.effectId)} ${String(a.params.amount)} — ${a.effectId === 'summon' ? (catalog.find(c => c.id === a.params.cardId)?.name[lang] || catalog.find(c => c.id === a.params.cardId)?.name.ru || 'существо') : t(String(a.params.target))}`);
  return [written, listed, ...lines].filter(Boolean).join('\n');
}

/** Property and trigger keys that deserve their own rules window. */
export function cardKeywords(card: CardDefinition) {
  return [...card.properties, ...card.abilities.map(a => a.trigger)].filter((key, index, all) => all.indexOf(key) === index);
}
