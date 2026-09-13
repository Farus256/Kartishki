import { abCopyDescription, abCopyName, pickLoc, type AutoBattlerCatalog, type AutoBattlerMinionDef } from '@kartishki/shared';
import type { AbMinion } from '../autoBattlerSession';

export function localizedName(name: { ru: string; en: string }, lang: string): string {
  return lang.startsWith('en') ? (name.en || name.ru) : (name.ru || name.en);
}

export function minionName(cardId: string, catalog: AutoBattlerCatalog, lang: string): string {
  const def = catalog.minions.find(item => item.id === cardId);
  if (!def) return cardId === 'ab-discover' ? (lang.startsWith('en') ? 'Discover' : 'Открытие') : cardId;
  return localizedName(def.name, lang);
}

export function minionDef(cardId: string, catalog: AutoBattlerCatalog): AutoBattlerMinionDef | undefined {
  return catalog.minions.find(item => item.id === cardId);
}

export const KEYWORD_MARK: Record<string, string> = {
  taunt: 'T',
  divineShield: '🛡',
  poisonous: '☠',
  deathrattle: '💀',
  battlecry: 'B',
  windfury: 'W',
  reborn: 'R',
  cleave: 'C',
  immune: 'I',
  cannotAttack: '–',
};

export function isSpell(minion: Pick<AbMinion, 'kind' | 'cardId'>): boolean {
  return minion.kind === 'spell' || minion.cardId === 'ab-discover';
}

type CopyT = (key: string, opts?: { defaultValue?: string }) => string;

export function minionTribeLabel(def: AutoBattlerMinionDef | undefined, catalog: AutoBattlerCatalog, lang: string, t: CopyT): string {
  return (def?.tribes ?? []).map(k => abCopyName(catalog.copy, 'tribes', k, lang, t(`abTribe_${k}`, { defaultValue: k }))).join(' / ');
}

export function minionDossierLines(minion: AbMinion, catalog: AutoBattlerCatalog, lang: string, t: CopyT): string[] {
  const def = minionDef(minion.cardId, catalog);
  const copy = catalog.copy;
  const lines: string[] = [];
  if (def?.description) {
    const text = pickLoc(def.description, lang).trim();
    if (text) lines.push(text);
  }
  const fallback = (key: string) => t(`abKeyword_${key}`, { defaultValue: key });
  const title = (key: string) => {
    const name = abCopyName(copy, 'keywords', key, lang, '');
    if (name && !name.includes(':')) return name;
    return (name || fallback(key)).split(':')[0]!;
  };
  const keywordLine = (key: string) => {
    const name = abCopyName(copy, 'keywords', key, lang, '');
    const desc = abCopyDescription(copy, 'keywords', key, lang, '');
    if (name && desc) return desc.startsWith(name) ? desc : `${name}: ${desc}`;
    return desc || name || fallback(key);
  };
  for (const key of minion.keywords) {
    if (key === 'deathrattle' && def?.deathrattle) {
      lines.push(`${title(key)}: ${def.deathrattle.count}× ${minionName(def.deathrattle.summonId, catalog, lang)}`);
      continue;
    }
    if (key === 'battlecry' && def?.battlecryId) {
      const body = abCopyDescription(copy, 'battlecries', def.battlecryId, lang, '') || keywordLine(key);
      const head = title(key);
      lines.push(body.startsWith(head) ? body : `${head}: ${body}`);
      continue;
    }
    lines.push(keywordLine(key));
  }
  if (def?.auraId) lines.push(abCopyDescription(copy, 'auras', def.auraId, lang, t('abAuraHint')));
  if (minion.golden) lines.push(t('abGoldenHint'));
  return lines.filter(Boolean);
}
