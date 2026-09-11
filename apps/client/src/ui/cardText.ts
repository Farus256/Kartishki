import type { CardDefinition } from '@kartishki/shared';

/** Written description, statuses and ability lines, joined the way the card renders them. */
export function cardRules(card: CardDefinition, t: (key: string) => string, lang: string) {
  const written = (card.description[lang] || card.description.ru).trim();
  const listed = card.properties.map(p => t(p)).join(', ');
  const lines = card.abilities.map(a => `${t(a.trigger)}: ${t(a.effectId)} ${String(a.params.amount)} — ${t(String(a.params.target))}`);
  return [written, listed, ...lines].filter(Boolean).join('\n');
}

/** Property and trigger keys that deserve their own rules window. */
export function cardKeywords(card: CardDefinition) {
  return [...card.properties, ...card.abilities.map(a => a.trigger)].filter((key, index, all) => all.indexOf(key) === index);
}
