import type { CardDefinition } from './index';

export const properties = ['contraceptive', 'offense', 'humiliation'] as const;
export const triggers = ['battlecry', 'deathrattle', 'enrage'] as const;
export const effects = ['damage', 'heal', 'attack', ...properties] as const;
export const starterCards: CardDefinition[] = [
  ['paper-imp', 'Бумажный бес', 'Paper imp', 1, 2, 2, [], 'common'],
  ['rubber-knight', 'Резиновый рыцарь', 'Rubber knight', 2, 2, 3, ['contraceptive'], 'common'],
  ['grudge', 'Обиженный', 'The offended', 1, 4, 3, ['offense'], 'rare'],
  ['shame', 'Униженный', 'The humiliated', 2, 4, 5, ['humiliation'], 'rare'],
  ['screamer', 'Крикун', 'Screamer', 3, 3, 3, [], 'epic'],
  ['rager', 'Злюка', 'Rager', 2, 2, 4, [], 'legendary'],
  ['prism-cat', 'Призматический кот', 'Prismatic cat', 6, 6, 6, [], 'ultimate'],
].map(([id, ru, en, cost, attack, health, props, rarity]) => ({
  schemaVersion: 1, id: id as string, name: { ru: ru as string, en: en as string }, description: { ru: '', en: '' },
  rarity: rarity as CardDefinition['rarity'], cost: cost as number, attack: attack as number, health: health as number,
  minionTypes: ['imp'], properties: props as string[], abilities: [],
  art: { url: '', crop: { x: 0, y: 0, size: 1 }, threshold: .5, contrast: 1.5 }, audio: {},
}));
starterCards[4].abilities = [{ trigger: 'battlecry', effectId: 'damage', params: { target: 'enemyHero', amount: 2 } }, { trigger: 'deathrattle', effectId: 'damage', params: { target: 'enemyHero', amount: 1 } }];
starterCards[5].abilities = [{ trigger: 'enrage', effectId: 'attack', params: { target: 'self', amount: 2 } }];

const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const bounded = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const strings = (v: unknown, limit: number) => Array.isArray(v) && v.length <= limit && v.every(x => typeof x === 'string' && x.length > 0 && x.length <= 60);
function localized(v: unknown) { return object(v) && typeof v.ru === 'string' && Object.keys(v).length <= 20 && Object.values(v).every(x => typeof x === 'string' && x.length <= 500); }
function asset(v: unknown, kind: 'image' | 'audio') {
  if (v === '') return true;
  if (typeof v !== 'string' || v.length > 1_500_000) return false;
  return (kind === 'image' ? /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/ : /^data:audio\/(mpeg|mp3|wav|x-wav|ogg|webm);base64,[A-Za-z0-9+/=]+$/).test(v);
}
// Shared runtime validation; the server repeats it before accepting publication.
export function validateCard(v: unknown): v is CardDefinition {
  if (!object(v) || v.schemaVersion !== 1 || typeof v.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,59}$/.test(v.id)) return false;
  if (!localized(v.name) || !v.name.ru.trim() || !localized(v.description)) return false;
  if (!['common','rare','epic','legendary','ultimate'].includes(v.rarity)) return false;
  if (!['cost','attack','health'].every(k => Number.isInteger(v[k]) && bounded(v[k], k === 'health' ? 1 : 0, k === 'cost' ? 10 : 99))) return false;
  if (!strings(v.minionTypes, 10) || !strings(v.properties, 3) || !v.properties.every((p: string) => properties.includes(p as any))) return false;
  if (!Array.isArray(v.abilities) || v.abilities.length > 8 || !v.abilities.every((a: unknown) => {
    if (!object(a) || !triggers.includes(a.trigger) || !effects.includes(a.effectId) || !object(a.params)) return false;
    if (!['self','enemyHero','allEnemies'].includes(a.params.target) || !Number.isInteger(a.params.amount) || !bounded(a.params.amount, 1, 20)) return false;
    if (a.trigger === 'enrage' && (a.effectId !== 'attack' || a.params.target !== 'self')) return false;
    return a.params.target !== 'enemyHero' || ['damage', 'heal'].includes(a.effectId);
  })) return false;
  const a = v.art;
  if (!object(a) || !asset(a.url, 'image') || !object(a.crop) || !bounded(a.threshold, 0, 1) || !bounded(a.contrast, .1, 4)) return false;
  if (!bounded(a.crop.x, 0, 1) || !bounded(a.crop.y, 0, 1) || !bounded(a.crop.size, .1, 1)) return false;
  return object(v.audio) && Object.entries(v.audio).every(([k, url]) => ['spawn','attack','death'].includes(k) && asset(url, 'audio'));
}
