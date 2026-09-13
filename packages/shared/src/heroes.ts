import type { HeroDefinition } from './index';
import { starterCards, validateCard } from './cards';
export const starterHeroes: HeroDefinition[] = [
  { id: 'captain', name: 'Капитан', description: 'Первым принимает вызов.', health: 30, art: structuredClone(starterCards[0].art), ability: { name: 'Точный удар', cost: 2, effectId: 'damage', amount: 2 } },
  { id: 'medic', name: 'Доктор', description: 'Всегда есть второй шанс.', health: 32, art: structuredClone(starterCards[0].art), ability: { name: 'Первая помощь', cost: 2, effectId: 'heal', amount: 3 } },
  { id: 'recruiter', name: 'Командир', description: 'Никогда не приходит один.', health: 28, art: structuredClone(starterCards[0].art), ability: { name: 'Подкрепление', cost: 3, effectId: 'summon', amount: 1, cardId: 'paper-imp' } },
];
export function validateHero(value: unknown): value is HeroDefinition {
  if (!value || typeof value !== 'object') return false;
  const h = value as HeroDefinition, a = h.ability;
  if (typeof h.name !== 'string' || !h.name.trim() || h.name.length > 100 || typeof h.description !== 'string' || h.description.length > 500) return false;
  if (!validateCard({ ...starterCards[0], id: h.id, name: { ru: h.name }, health: h.health, art: h.art })) return false;
  return !!a && typeof a.name === 'string' && !!a.name.trim() && a.name.length <= 100 && Number.isInteger(a.cost) && a.cost >= 0 && a.cost <= 10
    && ['damage','heal','summon'].includes(a.effectId) && Number.isInteger(a.amount) && a.amount >= 1 && a.amount <= (a.effectId === 'summon' ? 7 : 20)
    && (a.effectId !== 'summon' || typeof a.cardId === 'string' && /^[a-z0-9][a-z0-9-]{0,59}$/.test(a.cardId));
}
