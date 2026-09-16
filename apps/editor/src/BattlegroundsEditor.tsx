import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  abCopyEntry,
  abCopyName,
  autoBattlerAuras,
  autoBattlerBattlecries,
  autoBattlerHeroPowerPresets,
  autoBattlerKeywords,
  autoBattlerSpellKinds,
  abTribes,
  AB_TRIBE_ID,
  AB_MATCH_TRIBES,
  autoBattlerTribes,
  pickLoc,
  printedStats,
  starterAutoBattlerHeroes,
  starterAutoBattlerMinions,
  validateAutoBattlerCopy,
  validateAutoBattlerEffect,
  validateAutoBattlerHero,
  validateAutoBattlerMinion,
  type AutoBattlerCopy,
  type AutoBattlerCopyEntry,
  type AutoBattlerCopyGroup,
  type AutoBattlerHeroDef,
  type AutoBattlerHeroPowerId,
  type AutoBattlerKeyword,
  type AutoBattlerMinionDef,
  type AutoBattlerSpellKind,
  type AutoBattlerTribe,
  type Catalog,
} from '@kartishki/shared';
import { applyPortraitPreset } from '@kartishki/shared/photo';
import { ImageProcessingPipeline } from './ImageProcessingPipeline';
import { uploadPortrait } from './uploadPortrait';
import { clamp, EffectsEditor, effectSummary } from './EffectsEditor';
import { CardSetsPane } from './CardSetsPane';
import { ScenarioRunner } from './ScenarioRunner';
import { AbHeroFace } from '../../client/src/battlegrounds/AbHeroFace';
import { MinionTile } from '../../client/src/battlegrounds/MinionTile';
import '../../client/src/battlegrounds/battlegrounds.css';
import '../../client/src/battlegrounds/fx-cards.css';
import '../../client/src/battlegrounds/fx-polish.css';

const endpoint = import.meta.env.VITE_SERVER_URL ?? 'http://127.0.0.1:2567';
const blankArt = () => structuredClone(starterAutoBattlerMinions[0]!.art) ?? { url: '', crop: { x: .5, y: .5, size: 1 }, threshold: .5, contrast: 1, preset: 'none' as const };
const powerIds = Object.keys(autoBattlerHeroPowerPresets) as AutoBattlerHeroPowerId[];
const SPELL: Record<AutoBattlerSpellKind, [string, string]> = { discover: ['Открытие', 'Discover'], coin: ['Золото', 'Coin'], freeReroll: ['Бесплатное обновление', 'Free refresh'], tonic: ['Настойка (+N/+N)', 'Tonic (+N/+N)'] };
const idRe = /^[a-z0-9][a-z0-9-]{0,59}$/;
const int = (n: unknown, min: number, max: number) => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;

function previewMinion(def: AutoBattlerMinionDef, golden = false) {
  const stats = printedStats(def, golden);
  return {
    id: golden ? 'preview-golden' : 'preview', cardId: def.id, baseId: def.id, kind: def.spell ? 'spell' : 'minion',
    attack: stats.attack, health: stats.health, maxHealth: stats.health,
    tavernTier: def.tavernTier, keywords: stats.keywords, golden, owner: '',
  };
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `${name}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function minionIssues(m: AutoBattlerMinionDef, known: AutoBattlerMinionDef[], ru: boolean, tribes: readonly string[] = abTribes()): string[] {
  const out: string[] = [];
  const has = (id: string) => id === m.id || known.some(x => x.id === id);
  if (!idRe.test(m.id)) out.push(ru ? 'ID: строчные латинские буквы, цифры и дефис, до 60 символов' : 'ID: lowercase latin letters, digits and dashes, up to 60 chars');
  if (!m.name.ru.trim()) out.push(ru ? 'Нужно название (ru)' : 'Name (ru) is required');
  if (m.name.ru.length > 100 || m.name.en.length > 100) out.push(ru ? 'Название до 100 символов' : 'Name up to 100 chars');
  if (!int(m.tavernTier, 1, 6)) out.push(ru ? 'Тир 1–6' : 'Tier 1–6');
  if (!int(m.attack, 0, 99)) out.push(ru ? 'Атака 0–99' : 'Attack 0–99');
  if (!int(m.health, 1, 99)) out.push(ru ? 'Здоровье 1–99' : 'Health 1–99');
  if (m.poolCopies !== undefined && !int(m.poolCopies, 1, 30)) out.push(ru ? 'Копии в колоде 1–30' : 'Pool copies 1–30');
  if ((m.tribes?.length ?? 0) > 3) out.push(ru ? 'Не больше 3 рас' : 'At most 3 tribes');
  for (const id of m.tribes ?? []) if (!tribes.includes(id)) out.push(ru ? `Раса «${id}» не объявлена — добавьте её на вкладке «Расы» и опубликуйте тексты` : `Tribe "${id}" is not declared — add it on the Tribes tab and publish texts`);
  if (m.keywords.length > 8 || new Set(m.keywords).size !== m.keywords.length) out.push(ru ? 'Не больше 8 свойств, без повторов' : 'At most 8 keywords, no duplicates');
  if (m.deathrattle) {
    if (!int(m.deathrattle.count, 1, 7)) out.push(ru ? 'Прощание: количество 1–7' : 'Deathrattle: count 1–7');
    if (!has(m.deathrattle.summonId)) out.push(ru ? 'Прощание: призываемое существо не найдено в каталоге' : 'Deathrattle: summoned minion is not in the catalog');
  }
  if ((m.effects?.length ?? 0) > 6) out.push(ru ? 'Не больше 6 эффектов' : 'At most 6 effects');
  m.effects?.forEach((e, i) => {
    const auraMismatch = e.action.kind === 'aura' && e.trigger !== 'aura';
    if (!validateAutoBattlerEffect(e)) out.push(ru ? `Эффект ${i + 1}: некорректные параметры${auraMismatch ? ' (аура требует триггер «Аура»)' : ''}` : `Effect ${i + 1}: invalid fields${auraMismatch ? ' (aura action needs the Aura trigger)' : ''}`);
    if (e.action.kind === 'summon' && !has(e.action.summonId)) out.push(ru ? `Эффект ${i + 1}: призываемое существо не найдено в каталоге` : `Effect ${i + 1}: summoned minion is not in the catalog`);
  });
  if (m.spell?.amount !== undefined && !int(m.spell.amount, 1, 10)) out.push(ru ? 'Заклинание: величина 1–10' : 'Spell: amount 1–10');
  if (m.golden && (!int(m.golden.attack, 0, 99) || !int(m.golden.health, 1, 99))) out.push(ru ? 'Золотой: атака 0–99, здоровье 1–99' : 'Golden: attack 0–99, health 1–99');
  if (!out.length && !validateAutoBattlerMinion(m)) out.push(ru ? 'Проверьте параметры существа (фото?)' : 'Check the minion fields (photo?)');
  return out;
}

function heroIssues(h: AutoBattlerHeroDef, ru: boolean): string[] {
  const out: string[] = [];
  if (!idRe.test(h.id)) out.push(ru ? 'ID: строчные латинские буквы, цифры и дефис, до 60 символов' : 'ID: lowercase latin letters, digits and dashes, up to 60 chars');
  if (!idRe.test(h.portraitKey)) out.push(ru ? 'Ключ портрета: строчные латинские буквы, цифры и дефис' : 'Portrait key: lowercase latin letters, digits and dashes');
  if (!h.name.ru.trim()) out.push(ru ? 'Нужно название (ru)' : 'Name (ru) is required');
  if (h.name.ru.length > 100 || h.name.en.length > 100) out.push(ru ? 'Название до 100 символов' : 'Name up to 100 chars');
  if (!int(h.health, 1, 99)) out.push(ru ? 'Здоровье 1–99' : 'Health 1–99');
  const preset = autoBattlerHeroPowerPresets[h.power.id as AutoBattlerHeroPowerId];
  if (!preset) out.push(ru ? 'Неизвестная сила героя' : 'Unknown hero power');
  else if (h.power.isPassive !== preset.isPassive || h.power.targeted !== preset.targeted || h.power.targetDomain !== preset.targetDomain) out.push(ru ? 'Параметры силы не совпадают с пресетом' : 'Power flags do not match the preset');
  if (!int(h.power.goldCost, 0, 10)) out.push(ru ? 'Стоимость силы 0–10' : 'Power cost 0–10');
  if (!out.length && !validateAutoBattlerHero(h)) out.push(ru ? 'Проверьте параметры героя (фото?)' : 'Check the hero fields (photo?)');
  return out;
}

function applyPower(hero: AutoBattlerHeroDef, id: AutoBattlerHeroPowerId): AutoBattlerHeroDef {
  return { ...hero, power: { id, ...autoBattlerHeroPowerPresets[id] } };
}

function packedCopy(copy: AutoBattlerCopy): AutoBattlerCopy {
  const pack = (bag?: Partial<Record<string, AutoBattlerCopyEntry>>) => {
    if (!bag) return undefined;
    const next = Object.fromEntries(Object.entries(bag).flatMap(([id, entry]) => {
      if (!entry) return [];
      const nameRu = entry.name.ru.trim() || entry.name.en.trim();
      const hasText = nameRu || entry.description?.ru.trim() || entry.description?.en.trim();
      if (!hasText) return [];
      return [[id, { ...entry, name: { ru: nameRu || id, en: entry.name.en } }]];
    }));
    return Object.keys(next).length ? next : undefined;
  };
  return {
    keywords: pack(copy.keywords),
    tribes: pack(copy.tribes),
    battlecries: pack(copy.battlecries),
    auras: pack(copy.auras),
    powers: pack(copy.powers),
  };
}

function entryOf(copy: AutoBattlerCopy, group: AutoBattlerCopyGroup, id: string): AutoBattlerCopyEntry {
  return abCopyEntry(copy, group, id) ?? { name: { ru: '', en: '' }, description: { ru: '', en: '' } };
}

export function BattlegroundsEditor({ nav }: { nav?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const ru = i18n.language === 'ru';
  const lang = ru ? 'ru' : 'en';
  const [pane, setPane] = useState<'minions' | 'heroes' | 'tribes' | 'copy' | 'sets'>('minions');
  const [minion, setMinion] = useState<AutoBattlerMinionDef>(() => structuredClone(starterAutoBattlerMinions.find(m => !m.token) ?? starterAutoBattlerMinions[1]!));
  const [hero, setHero] = useState<AutoBattlerHeroDef>(() => structuredClone(starterAutoBattlerHeroes[0]!));
  const [copy, setCopy] = useState<AutoBattlerCopy>({});
  const [catalog, setCatalog] = useState<Catalog>({ version: 0, cards: [] });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState({ tier: 0, tribe: '' as '' | AutoBattlerTribe, q: '' });
  const request = useRef(0);
  const minions = catalog.autoBattlerMinions ?? starterAutoBattlerMinions;
  const heroes = catalog.autoBattlerHeroes ?? starterAutoBattlerHeroes;
  const shown = minions.filter(m => (!filter.tier || m.tavernTier === filter.tier) && (!filter.tribe || (m.tribes ?? ['neutral']).includes(filter.tribe))
    && (!filter.q || `${m.id} ${m.name.ru} ${m.name.en}`.toLowerCase().includes(filter.q.trim().toLowerCase())));

  async function load() {
    try {
      const r = await fetch(`${endpoint}/api/catalog`);
      if (!r.ok) throw new Error();
      const data: Catalog = await r.json();
      setCatalog(data);
      setCopy(data.autoBattlerCopy ?? {});
      setMinion(m => { const found = data.autoBattlerMinions?.find(x => x.id === m.id); return found ? structuredClone(found) : m; });
      setHero(h => { const found = data.autoBattlerHeroes?.find(x => x.id === h.id); return found ? structuredClone(found) : h; });
    } catch { setMessage(ru ? 'Не удалось загрузить каталог' : 'Could not load catalog'); }
  }
  useEffect(() => { void load(); }, []);

  function chooseMinion(next: AutoBattlerMinionDef) { request.current++; setMinion(structuredClone(next)); setMessage(''); }
  function chooseHero(next: AutoBattlerHeroDef) { request.current++; setHero(structuredClone(next)); setMessage(''); }
  function duplicate() {
    const suffix = { ru: ' (копия)', en: ' (copy)' };
    if (pane === 'minions') chooseMinion({ ...minion, id: `${minion.id}-copy`, name: { ru: minion.name.ru + suffix.ru, en: minion.name.en && minion.name.en + suffix.en } });
    else chooseHero({ ...hero, id: `${hero.id}-copy`, portraitKey: `${hero.id}-copy`, name: { ru: hero.name.ru + suffix.ru, en: hero.name.en && hero.name.en + suffix.en } });
  }
  async function importJson(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 7_000_000) throw new Error();
      const data: unknown = JSON.parse(await file.text());
      if (pane === 'minions') { if (!validateAutoBattlerMinion(data)) throw new Error(); chooseMinion(data); }
      else { if (!validateAutoBattlerHero(data)) throw new Error(); chooseHero(data); }
      setMessage(ru ? 'JSON импортирован в черновик' : 'JSON imported into the draft');
    } catch { setMessage(ru ? 'Некорректный JSON: не прошёл проверку' : 'Invalid JSON: failed validation'); }
  }
  const jsonTools = <>
    <button type="button" onClick={duplicate}>{ru ? 'Дублировать' : 'Duplicate'}</button>
    <button type="button" onClick={() => pane === 'minions' ? download(minion.id || 'minion', minion) : download(hero.id || 'hero', hero)}>{ru ? 'Экспорт JSON' : 'Export JSON'}</button>
    <label className="file-button">{ru ? 'Импорт JSON' : 'Import JSON'}<input type="file" accept="application/json,.json" onChange={e => { void importJson(e.target.files?.[0]); e.target.value = ''; }} /></label>
  </>;
  function toggleKeyword(key: AutoBattlerKeyword, on: boolean) {
    setMinion(m => {
      const keywords = on ? [...m.keywords, key] : m.keywords.filter(k => k !== key);
      const patch: AutoBattlerMinionDef = { ...m, keywords };
      if (key === 'deathrattle') patch.deathrattle = on ? (m.deathrattle ?? { summonId: minions.find(x => x.token)?.id ?? m.id, count: 1 }) : undefined;
      if (key === 'battlecry') patch.battlecryId = on ? (m.battlecryId ?? 'ab-bc-gold') : undefined;
      return patch;
    });
  }
  function toggleTribe(tribe: AutoBattlerTribe, on: boolean) {
    setMinion(m => {
      const current = m.tribes?.length ? [...m.tribes] : [];
      const tribes = on ? [...current.filter(t => t !== tribe), tribe].slice(0, 3) : current.filter(t => t !== tribe);
      return { ...m, tribes: tribes.length ? tribes : ['neutral'] };
    });
  }
  function patchCopy(group: AutoBattlerCopyGroup, id: string, field: 'name' | 'description', side: 'ru' | 'en', value: string) {
    setCopy(current => {
      const prev = entryOf(current, group, id);
      const next: AutoBattlerCopyEntry = {
        name: { ...prev.name },
        description: { ru: prev.description?.ru ?? '', en: prev.description?.en ?? '' },
      };
      next[field] = { ...next[field]!, [side]: value };
      return { ...current, [group]: { ...current[group], [id]: next } };
    });
  }
  async function photo(file: File | undefined, kind: 'minion' | 'hero') {
    if (!file) return;
    const revision = ++request.current;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8_000_000) { setMessage(ru ? 'Нужен PNG, JPEG или WebP до 8 МБ' : 'Need PNG, JPEG or WebP up to 8 MB'); return; }
    try {
      const source = await uploadPortrait(file, endpoint);
      if (revision !== request.current) return;
      const art = applyPortraitPreset({ ...blankArt(), ...source, rotation: 0, crop: { x: .5, y: .5, size: 1 } }, 'printed');
      if (kind === 'minion') setMinion(m => ({ ...m, art }));
      else setHero(h => ({ ...h, art }));
    } catch { if (revision === request.current) setMessage(ru ? 'Не удалось обработать фото' : 'Could not process photo'); }
  }
  async function publishMinion() {
    if (!validateAutoBattlerMinion(minion)) { setMessage(ru ? 'Проверьте параметры существа' : 'Check the minion fields'); return; }
    setBusy(true);
    try {
      const r = await fetch(`${endpoint}/api/auto-battler`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minion, version: catalog.version }) });
      const data = await r.json();
      if (!r.ok) { setMessage(r.status === 409 ? (ru ? 'Каталог изменился. Обновите и повторите.' : 'Catalog changed. Reload and retry.') : (ru ? 'Не удалось опубликовать существо.' : 'Could not publish minion.')); return; }
      setCatalog(data);
      setMessage(ru ? 'Существо опубликовано. Оно появится в новых играх Поля сражений.' : 'Minion published. New Battlegrounds matches will use it.');
    } catch { setMessage(ru ? 'Не удалось соединиться с сервером' : 'Could not reach the server'); }
    finally { setBusy(false); }
  }
  async function publishHero() {
    if (!validateAutoBattlerHero(hero)) { setMessage(ru ? 'Проверьте параметры героя' : 'Check the hero fields'); return; }
    setBusy(true);
    try {
      const r = await fetch(`${endpoint}/api/auto-battler-heroes`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hero, version: catalog.version }) });
      const data = await r.json();
      if (!r.ok) { setMessage(r.status === 409 ? (ru ? 'Каталог изменился. Обновите и повторите.' : 'Catalog changed. Reload and retry.') : (ru ? 'Не удалось опубликовать героя.' : 'Could not publish hero.')); return; }
      setCatalog(data);
      setMessage(ru ? 'Герой опубликован. Он появится в новых играх Поля сражений.' : 'Hero published. New Battlegrounds matches will use it.');
    } catch { setMessage(ru ? 'Не удалось соединиться с сервером' : 'Could not reach the server'); }
    finally { setBusy(false); }
  }
  async function publishCopy() {
    const next = packedCopy(copy);
    if (!validateAutoBattlerCopy(next)) { setMessage(ru ? 'Проверьте названия и описания' : 'Check names and descriptions'); return; }
    setBusy(true);
    try {
      const r = await fetch(`${endpoint}/api/auto-battler-copy`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ copy: next, version: catalog.version }) });
      const data = await r.json();
      if (!r.ok) { setMessage(r.status === 409 ? (ru ? 'Каталог изменился. Обновите и повторите.' : 'Catalog changed. Reload and retry.') : (ru ? 'Не удалось опубликовать тексты.' : 'Could not publish texts.')); return; }
      setCatalog(data);
      setCopy(data.autoBattlerCopy ?? next);
      setMessage(ru ? 'Названия и описания опубликованы. Новые игры Поля сражений возьмут их.' : 'Names and descriptions published. New Battlegrounds matches will use them.');
    } catch { setMessage(ru ? 'Не удалось соединиться с сервером' : 'Could not reach the server'); }
    finally { setBusy(false); }
  }

  const catalogPreview = {
    version: catalog.version || 1,
    minions: minions.map(m => m.id === minion.id ? minion : m),
    heroes: heroes.map(h => h.id === hero.id ? hero : h),
    copy,
  };
  const heroArt = hero.art;
  const label = (group: AutoBattlerCopyGroup, id: string, fallback: string) => abCopyName(copy, group, id, lang, fallback);
  const keywordName = (id: string) => label('keywords', id, t(`abKeyword_${id}`)).split(':')[0]!;
  const effectName = (group: 'tribes' | 'keywords', id: string) => group === 'keywords' ? keywordName(id) : label('tribes', id, t(`abTribe_${id}`));
  const minionName = (id: string) => { const def = catalogPreview.minions.find(m => m.id === id); return def ? (def.name[lang] || def.name.ru) : id; };
  const effectLines = (minion.effects ?? []).map(e => effectSummary(e, ru, effectName, minionName));
  const copyBlock = (title: string, group: AutoBattlerCopyGroup, ids: readonly string[], nameHint: (id: string) => string, descHint: (id: string) => string) => (
    <section className="editor-copy-col">
      <h2>{title}</h2>
      {ids.map(id => {
        const entry = entryOf(copy, group, id);
        return <fieldset key={id}>
          <legend>{nameHint(id)}</legend>
          <label>{ru ? 'Название (ru)' : 'Name (ru)'}<input aria-label={`${nameHint(id)} ru`} value={entry.name.ru} maxLength={100} placeholder={nameHint(id)} onChange={e => patchCopy(group, id, 'name', 'ru', e.target.value)} /></label>
          <label>{ru ? 'Название (en)' : 'Name (en)'}<input value={entry.name.en} maxLength={100} onChange={e => patchCopy(group, id, 'name', 'en', e.target.value)} /></label>
          <label>{ru ? 'Описание (ru)' : 'Description (ru)'}<textarea aria-label={`${nameHint(id)} ${ru ? 'описание' : 'description'}`} value={entry.description?.ru ?? ''} maxLength={500} placeholder={descHint(id)} onChange={e => patchCopy(group, id, 'description', 'ru', e.target.value)} /></label>
          <label>{ru ? 'Описание (en)' : 'Description (en)'}<textarea value={entry.description?.en ?? ''} maxLength={500} onChange={e => patchCopy(group, id, 'description', 'en', e.target.value)} /></label>
        </fieldset>;
      })}
    </section>
  );
  const tribeIds = abTribes(copy);
  const builtin = (id: string) => (autoBattlerTribes as readonly string[]).includes(id);
  const tribeName = (id: string) => label('tribes', id, t(`abTribe_${id}`, { defaultValue: id }));
  const [newTribe, setNewTribe] = useState({ id: '', ru: '', en: '' });
  function addTribe() {
    const id = newTribe.id.trim();
    if (!AB_TRIBE_ID.test(id) || tribeIds.includes(id) || !newTribe.ru.trim()) { setMessage(ru ? 'Раса: id латиницей (a-z, 0-9, дефис), уникальный, и название (ru)' : 'Tribe: latin id (a-z, 0-9, dash), unique, and a name (ru)'); return; }
    setCopy(current => ({ ...current, tribes: { ...current.tribes, [id]: { name: { ru: newTribe.ru.trim(), en: newTribe.en.trim() }, description: { ru: '', en: '' } } } }));
    setNewTribe({ id: '', ru: '', en: '' }); setMessage('');
  }
  function removeTribe(id: string) {
    setCopy(current => { const tribes = { ...current.tribes }; delete tribes[id]; return { ...current, tribes }; });
  }
  const membersOf = (tribe: AutoBattlerTribe) => minions.filter(m => !m.token && (m.tribes ?? ['neutral']).includes(tribe));
  const panes: [typeof pane, string, string][] = [['minions', 'Существа', 'Minions'], ['heroes', 'Герои', 'Heroes'], ['tribes', 'Расы', 'Tribes'], ['copy', 'Тексты', 'Texts'], ['sets', 'Наборы (Workshop)', 'Sets (Workshop)']];
  const issues = pane === 'minions' ? minionIssues(minion, catalogPreview.minions, ru, tribeIds) : pane === 'heroes' ? heroIssues(hero, ru) : [];
  const publishedMinion = minions.find(m => m.id === minion.id);
  const publishedHero = heroes.find(h => h.id === hero.id);
  const draftState = pane === 'minions'
    ? (!publishedMinion ? 'new' : JSON.stringify(publishedMinion) === JSON.stringify(minion) ? 'same' : 'changed')
    : pane === 'heroes' ? (!publishedHero ? 'new' : JSON.stringify(publishedHero) === JSON.stringify(hero) ? 'same' : 'changed')
    : JSON.stringify(packedCopy(copy)) === JSON.stringify(catalog.autoBattlerCopy ?? packedCopy({})) ? 'same' : 'changed';
  const publish = pane === 'minions' ? publishMinion : pane === 'heroes' ? publishHero : publishCopy;
  const canPublish = !busy && !!catalog.version && issues.length === 0 && (pane === 'minions' ? validateAutoBattlerMinion(minion) : pane === 'heroes' ? validateAutoBattlerHero(hero) : validateAutoBattlerCopy(packedCopy(copy)));
  useEffect(() => {
    // Ctrl/Cmd+S publishes the current pane, like saving a document.
    const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (pane !== 'sets' && canPublish) void publish(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const messageTone = /опубликован|imported|published|импортирован/i.test(message) ? 'ok' : message ? 'error' : '';
  const artPanel = (art: AutoBattlerMinionDef['art'], kind: 'minion' | 'hero', setArt: (next: AutoBattlerMinionDef['art']) => void) => <section className="editor-art-panel">
    <h2>{ru ? 'Фотография' : 'Photo'}</h2>
    {!art ? <div className="editor-dropzone">
      <p>{ru ? 'Фото пока нет. Без него карта показывает силуэт.' : 'No photo yet. The card shows a silhouette without one.'}</p>
      <label className="file-button">{ru ? 'Загрузить фото' : 'Upload photo'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void photo(e.target.files?.[0], kind)} /></label>
      <small>{ru ? 'PNG, JPEG или WebP до 8 МБ. Лицо лучше держать в центре кадра.' : 'PNG, JPEG or WebP up to 8 MB. Keep the face near the centre.'}</small>
    </div> : <>
      <div className="photo-actions">
        <label className="file-button">{ru ? 'Заменить фото' : 'Replace photo'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void photo(e.target.files?.[0], kind)} /></label>
        <button type="button" className="is-danger" onClick={() => { request.current++; setArt(undefined); }}>{ru ? 'Убрать фото' : 'Remove photo'}</button>
      </div>
      <fieldset><legend>{ru ? 'Кадрирование' : 'Crop'}</legend>
        {([['x', ru ? 'По горизонтали' : 'Horizontal'], ['y', ru ? 'По вертикали' : 'Vertical'], ['size', ru ? 'Масштаб' : 'Zoom']] as const).map(([key, name]) => <label key={key}>{name} <output>{art.crop[key].toFixed(2)}</output><input type="range" min={key === 'size' ? .1 : 0} max={1} step={.01} value={art.crop[key]} onChange={e => setArt({ ...art, crop: { ...art.crop, [key]: Number(e.target.value) } })} /></label>)}
        <button type="button" onClick={() => setArt({ ...art, crop: { x: .5, y: .5, size: 1 } })}>{ru ? 'Сбросить кадр' : 'Reset crop'}</button>
      </fieldset>
      <ImageProcessingPipeline art={art} onChange={setArt} />
    </>}
  </section>;

  return <main className="editor"><header><h1>{ru ? 'Редактор поля сражений' : 'Battlegrounds editor'}</h1><div className="editor-nav">{nav}</div></header>
    <nav className="editor-tabs" aria-label={ru ? 'Разделы' : 'Sections'}>
      {panes.map(([id, nameRu, nameEn]) => <button key={id} type="button" aria-pressed={pane === id} onClick={() => { setPane(id); setMessage(''); }}>{ru ? nameRu : nameEn}</button>)}
    </nav>
    {pane !== 'sets' && <div className="toolbar">
      {pane === 'minions' && <>
        <span className="toolbar-group" role="group" aria-label={ru ? 'Каталог' : 'Catalog'}>
          <span className="toolbar-title">{ru ? 'Каталог' : 'Catalog'}</span>
          <select aria-label={ru ? 'Каталог лавки' : 'Tavern catalog'} value={shown.some(m => m.id === minion.id) ? minion.id : ''} onChange={e => { const found = minions.find(m => m.id === e.target.value); if (found) chooseMinion(found); }}>
            <option value="">{ru ? '— выбрать существо —' : '— pick a minion —'}</option>
            {shown.map(m => <option key={m.id} value={m.id}>{`${'★'.repeat(m.tavernTier)} ${m.name[lang] || m.name.ru}`}</option>)}
          </select>
          <select aria-label={ru ? 'Фильтр по тиру' : 'Tier filter'} value={filter.tier} onChange={e => setFilter({ ...filter, tier: Number(e.target.value) })}>
            <option value={0}>{ru ? 'Все тиры' : 'All tiers'}</option>
            {[1, 2, 3, 4, 5, 6].map(tier => <option key={tier} value={tier}>{ru ? `Тир ${tier}` : `Tier ${tier}`}</option>)}
          </select>
          <select aria-label={ru ? 'Фильтр по расе' : 'Tribe filter'} value={filter.tribe} onChange={e => setFilter({ ...filter, tribe: e.target.value as '' | AutoBattlerTribe })}>
            <option value="">{ru ? 'Все расы' : 'All tribes'}</option>
            {tribeIds.map(tribe => <option key={tribe} value={tribe}>{tribeName(tribe)}</option>)}
          </select>
          <input type="search" aria-label={ru ? 'Поиск' : 'Search'} placeholder={ru ? 'Поиск по названию или ID' : 'Search name or ID'} value={filter.q} onChange={e => setFilter({ ...filter, q: e.target.value })} />
          <small>{shown.length}/{minions.length}</small>
        </span>
        <span className="toolbar-actions">
          <button className="is-primary" onClick={() => chooseMinion({ ...structuredClone(starterAutoBattlerMinions.find(m => m.id === 'ab-bruiser')!), id: `ab-${Date.now()}`, name: { ru: 'Новое существо', en: 'New minion' }, description: { ru: '', en: '' }, keywords: [], tribes: ['neutral'] })}>{ru ? '+ Новое существо' : '+ New minion'}</button>
          {jsonTools}
        </span>
      </>}
      {pane === 'heroes' && <>
        <span className="toolbar-group" role="group" aria-label={ru ? 'Каталог' : 'Catalog'}>
          <span className="toolbar-title">{ru ? 'Каталог' : 'Catalog'}</span>
          <select aria-label={ru ? 'Каталог героев' : 'Hero catalog'} value={heroes.some(h => h.id === hero.id) ? hero.id : ''} onChange={e => { const found = heroes.find(h => h.id === e.target.value); if (found) chooseHero(found); }}>
            <option value="">{ru ? '— выбрать героя —' : '— pick a hero —'}</option>
            {heroes.map(h => <option key={h.id} value={h.id}>{h.name[lang] || h.name.ru}</option>)}
          </select>
          <small>{heroes.length}</small>
        </span>
        <span className="toolbar-actions">
          <button className="is-primary" onClick={() => { const id = `ab-hero-${Date.now()}`; chooseHero({ ...structuredClone(starterAutoBattlerHeroes[0]!), id, portraitKey: id, name: { ru: 'Новый герой', en: 'New hero' }, description: { ru: '', en: '' } }); }}>{ru ? '+ Новый герой' : '+ New hero'}</button>
          {jsonTools}
        </span>
      </>}
      {(pane === 'tribes' || pane === 'copy') && <p className="editor-note">{pane === 'tribes'
        ? (ru ? 'Расы — это ярлыки существ: ауры, эффекты и открытия ищут существ по ним. Здесь задаются названия, описания и видно, кто в какой расе.' : 'Tribes are minion tags: auras, effects and Discover look minions up by them. Set names and descriptions here and see who belongs where.')
        : (ru ? 'Тексты, которые видит игрок во всплывающих подсказках. Пустое поле — берётся стандартный текст.' : 'Texts players see in tooltips. Leave a field empty to keep the default.')}</p>}
      <span className="toolbar-actions"><button onClick={() => void load()} title={ru ? 'Перечитать каталог с сервера' : 'Re-read the catalog from the server'}>{ru ? '↻ Обновить' : '↻ Reload'}</button></span>
    </div>}
    {pane === 'minions' ? <div className="editor-grid"><section className="editor-fields"><h2>{ru ? 'Существо лавки' : 'Tavern minion'}</h2>
      <label>{ru ? 'ID существа' : 'Minion ID'}<input value={minion.id} maxLength={60} onChange={e => setMinion({ ...minion, id: e.target.value })} /></label>
      <label>{ru ? 'Название (ru)' : 'Name (ru)'}<input value={minion.name.ru} maxLength={100} onChange={e => setMinion({ ...minion, name: { ...minion.name, ru: e.target.value } })} /></label>
      <label>{ru ? 'Название (en)' : 'Name (en)'}<input value={minion.name.en} maxLength={100} onChange={e => setMinion({ ...minion, name: { ...minion.name, en: e.target.value } })} /></label>
      <label>{ru ? 'Описание (ru)' : 'Description (ru)'}<textarea value={minion.description?.ru ?? ''} maxLength={500} onChange={e => setMinion({ ...minion, description: { ru: e.target.value, en: minion.description?.en ?? '' } })} /></label>
      <label>{ru ? 'Описание (en)' : 'Description (en)'}<textarea value={minion.description?.en ?? ''} maxLength={500} onChange={e => setMinion({ ...minion, description: { ru: minion.description?.ru ?? '', en: e.target.value } })} /></label>
      <div className="stats-fields">
        <label>{ru ? 'Тир' : 'Tier'}<input type="number" min={1} max={6} value={minion.tavernTier} onChange={e => setMinion({ ...minion, tavernTier: Math.min(6, Math.max(1, Number(e.target.value))) as AutoBattlerMinionDef['tavernTier'] })} /></label>
        <label>{ru ? 'Атака' : 'Attack'}<input type="number" min={0} max={99} value={minion.attack} onChange={e => setMinion({ ...minion, attack: Number(e.target.value) })} /></label>
        <label>{ru ? 'Здоровье' : 'Health'}<input type="number" min={1} max={99} value={minion.health} onChange={e => setMinion({ ...minion, health: Number(e.target.value) })} /></label>
        <label>{ru ? 'Копии в колоде' : 'Pool copies'}<input type="number" min={1} max={30} value={minion.poolCopies ?? ''} placeholder={ru ? 'авто' : 'auto'} onChange={e => setMinion({ ...minion, poolCopies: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
      </div>
      <small className="field-hint">{ru ? 'Тир — с какого уровня лавки существо появляется. Копии в колоде: пусто — стандарт для тира (больше копий = чаще встречается).' : 'Tier — the tavern level the minion appears from. Pool copies: empty — the tier default (more copies = shows up more often).'}</small>
      <fieldset><legend>{ru ? 'Расы' : 'Tribes'}</legend>
        <div className="chip-row" role="group" aria-label={ru ? 'Расы' : 'Tribes'}>
          {tribeIds.map(tribe => { const on = (minion.tribes ?? ['neutral']).includes(tribe); return <button type="button" className="chip" key={tribe} aria-pressed={on} onClick={() => toggleTribe(tribe, !on)}>{tribeName(tribe)}</button>; })}
        </div>
        <small className="field-hint">{ru ? 'До трёх рас. «Без типа» — если ни одна не выбрана.' : 'Up to three tribes. Neutral when none is picked.'}</small>
      </fieldset>
      <fieldset><legend>{ru ? 'Свойства' : 'Keywords'}</legend>
        <div className="check-grid">{autoBattlerKeywords.map(key => { const [name, ...rest] = label('keywords', key, t(`abKeyword_${key}`)).split(':'); return <label className="check" key={key}><input type="checkbox" checked={minion.keywords.includes(key)} onChange={e => toggleKeyword(key, e.target.checked)} /><span><b>{name}</b>{rest.length > 0 && <small>{rest.join(':').trim()}</small>}</span></label>; })}</div>
        {(minion.keywords.includes('humiliate') || minion.keywords.includes('bait')) && <p>{ru
          ? 'Эти свойства заменяют обычный удар: без контактного урона и ответного удара. Если выбраны оба, применяются оба эффекта. Двойной удар повторяет действие. Изменения действуют только в текущем бою.'
          : 'These properties replace the attack without contact damage or retaliation. Selecting both applies both effects. Windfury repeats the action. Changes last only for the current combat.'}</p>}
      </fieldset>
      {minion.keywords.includes('deathrattle') && <fieldset><legend>{label('keywords', 'deathrattle', ru ? 'Прощание' : 'Deathrattle')}</legend>
        <label>{ru ? 'Призыв' : 'Summon'}<select value={minion.deathrattle?.summonId ?? ''} onChange={e => setMinion({ ...minion, deathrattle: { summonId: e.target.value, count: minion.deathrattle?.count ?? 1 } })}>
          {minions.map(m => <option key={m.id} value={m.id}>{m.name[ru ? 'ru' : 'en'] || m.name.ru}</option>)}
        </select></label>
        <label>{ru ? 'Количество' : 'Count'}<input type="number" min={1} max={7} value={minion.deathrattle?.count ?? 1} onChange={e => setMinion({ ...minion, deathrattle: { summonId: minion.deathrattle?.summonId ?? minions[0]!.id, count: Number(e.target.value) } })} /></label>
      </fieldset>}
      {minion.keywords.includes('battlecry') && <label>{label('keywords', 'battlecry', ru ? 'Приветствие' : 'Battlecry')}<select value={minion.battlecryId ?? ''} onChange={e => setMinion({ ...minion, battlecryId: e.target.value || undefined })}>
        <option value="">—</option>
        {autoBattlerBattlecries.map(id => <option key={id} value={id}>{label('battlecries', id, ru ? '+$1 (+$2 золотой)' : '+$1 (+$2 golden)')}</option>)}
      </select></label>}
      <label>{ru ? 'Аура' : 'Aura'}<select value={minion.auraId ?? ''} onChange={e => setMinion({ ...minion, auraId: e.target.value || undefined })}>
        <option value="">—</option>
        {autoBattlerAuras.map(id => <option key={id} value={id}>{label('auras', id, t('abAuraHint'))}</option>)}
      </select></label>
      <fieldset><legend>{ru ? 'Золотая версия' : 'Golden'}</legend>
        <label className="check"><input type="checkbox" checked={!!minion.golden} onChange={e => setMinion({ ...minion, golden: e.target.checked ? { attack: minion.attack * 2, health: minion.health * 2 } : undefined })} />{ru ? 'Свои статы золотого' : 'Custom golden stats'}</label>
        {minion.golden && <div className="stats-fields">
          <label>{ru ? 'Атака золотого' : 'Golden attack'}<input type="number" min={0} max={99} value={minion.golden.attack} onChange={e => setMinion({ ...minion, golden: { ...minion.golden!, attack: Number(e.target.value) } })} /></label>
          <label>{ru ? 'Здоровье золотого' : 'Golden health'}<input type="number" min={1} max={99} value={minion.golden.health} onChange={e => setMinion({ ...minion, golden: { ...minion.golden!, health: Number(e.target.value) } })} /></label>
        </div>}
        {minion.golden && <label className="check"><input type="checkbox" checked={!!minion.golden.keywords} onChange={e => setMinion({ ...minion, golden: { ...minion.golden!, keywords: e.target.checked ? [...minion.keywords] : undefined } })} />{ru ? 'Свои свойства золотого' : 'Custom golden keywords'}</label>}
        {minion.golden?.keywords && <div className="check-grid">
          {autoBattlerKeywords.map(key => <label className="check" key={key}><input type="checkbox" checked={minion.golden!.keywords!.includes(key)} onChange={e => setMinion({ ...minion, golden: { ...minion.golden!, keywords: e.target.checked ? [...minion.golden!.keywords!, key] : minion.golden!.keywords!.filter(k => k !== key) } })} />{keywordName(key)}</label>)}
        </div>}
      </fieldset>
      <fieldset><legend>{ru ? 'Заклинание' : 'Spell'}</legend>
        <label className="check"><input type="checkbox" checked={!!minion.spell} onChange={e => setMinion(e.target.checked ? { ...minion, spell: { kind: 'coin', amount: 1 }, attack: 0, health: 1 } : { ...minion, spell: undefined })} />{ru ? 'Это заклинание (покупается как существо, играется из руки)' : 'This is a spell (bought like a minion, played from hand)'}</label>
        {minion.spell && <div className="stats-fields">
          <label>{ru ? 'Тип' : 'Kind'}<select value={minion.spell.kind} onChange={e => setMinion({ ...minion, spell: { ...minion.spell!, kind: e.target.value as AutoBattlerSpellKind } })}>
            {autoBattlerSpellKinds.map(kind => <option key={kind} value={kind}>{SPELL[kind][ru ? 0 : 1]}</option>)}
          </select></label>
          <label>{ru ? 'Величина' : 'Amount'}<input type="number" min={1} max={10} value={minion.spell.amount ?? ''} placeholder="—" onChange={e => setMinion({ ...minion, spell: { kind: minion.spell!.kind, amount: e.target.value === '' ? undefined : clamp(e.target.value, 1, 10) } })} /></label>
        </div>}
      </fieldset>
      <EffectsEditor effects={minion.effects ?? []} onChange={effects => setMinion(m => ({ ...m, effects: effects.length ? effects : undefined }))} minions={minions} ru={ru} name={effectName} minionName={minionName} />
      <ScenarioRunner minion={minion} minions={catalogPreview.minions} endpoint={endpoint} ru={ru} minionName={minionName} />
      <fieldset><legend>{ru ? 'Лавка' : 'Shop'}</legend>
        <label className="check"><input type="checkbox" checked={minion.token === true} onChange={e => setMinion({ ...minion, token: e.target.checked || undefined, inTavern: e.target.checked ? false : minion.inTavern, inDiscover: e.target.checked ? false : minion.inDiscover })} />{ru ? 'Жетон' : 'Token'}</label>
        <label className="check"><input type="checkbox" checked={minion.inTavern !== false && !minion.token} onChange={e => setMinion({ ...minion, inTavern: e.target.checked ? undefined : false })} />{ru ? 'В лавке' : 'In tavern'}</label>
        <label className="check"><input type="checkbox" checked={minion.inDiscover !== false && !minion.token} onChange={e => setMinion({ ...minion, inDiscover: e.target.checked ? undefined : false })} />{ru ? 'В открытии' : 'In Discover'}</label>
      </fieldset>
      <ul className="editor-issues">{minionIssues(minion, catalogPreview.minions, ru, tribeIds).map(issue => <li key={issue}>{issue}</li>)}</ul>
    </section>
    {artPanel(minion.art, 'minion', art => setMinion(m => ({ ...m, art })))}
    <aside className="editor-preview-panel">
      <h2>{ru ? 'Предпросмотр в лавке' : 'Tavern preview'}</h2>
      <div className="editor-preview-row">
        <div><MinionTile minion={previewMinion(minion)} catalog={catalogPreview} fullCard arrive={false} disabled /><small>{ru ? 'Обычная' : 'Regular'}</small></div>
        <div><MinionTile minion={previewMinion(minion, true)} catalog={catalogPreview} fullCard arrive={false} disabled /><small>{ru ? 'Золотая' : 'Golden'}</small></div>
      </div>
      {(minion.description?.ru || minion.description?.en) && <p className="editor-copy-preview">{pickLoc(minion.description, lang)}</p>}
      {effectLines.length > 0 && <ul className="editor-effect-lines">{effectLines.map((line, i) => <li key={i}>{line}</li>)}</ul>}
    </aside></div> : pane === 'heroes' ? <div className="editor-grid"><section className="editor-fields"><h2>{ru ? 'Герой поля сражений' : 'Battlegrounds hero'}</h2>
      <label>{ru ? 'ID героя' : 'Hero ID'}<input value={hero.id} maxLength={60} onChange={e => { const id = e.target.value; setHero({ ...hero, id, portraitKey: id }); }} /></label>
      <label>{ru ? 'Название (ru)' : 'Name (ru)'}<input value={hero.name.ru} maxLength={100} onChange={e => setHero({ ...hero, name: { ...hero.name, ru: e.target.value } })} /></label>
      <label>{ru ? 'Название (en)' : 'Name (en)'}<input value={hero.name.en} maxLength={100} onChange={e => setHero({ ...hero, name: { ...hero.name, en: e.target.value } })} /></label>
      <label>{ru ? 'Описание (ru)' : 'Description (ru)'}<textarea value={hero.description?.ru ?? ''} maxLength={500} onChange={e => setHero({ ...hero, description: { ru: e.target.value, en: hero.description?.en ?? '' } })} /></label>
      <label>{ru ? 'Описание (en)' : 'Description (en)'}<textarea value={hero.description?.en ?? ''} maxLength={500} onChange={e => setHero({ ...hero, description: { ru: hero.description?.ru ?? '', en: e.target.value } })} /></label>
      <label>{ru ? 'Здоровье героя' : 'Hero health'}<input type="number" min={1} max={99} value={hero.health} onChange={e => setHero({ ...hero, health: Number(e.target.value) })} /></label>
      <fieldset><legend>{ru ? 'Сила героя' : 'Hero power'}</legend>
        <label>{ru ? 'Эффект силы' : 'Power'}<select aria-label={ru ? 'Эффект силы' : 'Power'} value={hero.power.id} onChange={e => setHero(h => applyPower(h, e.target.value as AutoBattlerHeroPowerId))}>
          {powerIds.map(id => <option key={id} value={id}>{label('powers', id, t(`abPower_${id}`))}</option>)}
        </select></label>
        <label>{ru ? 'Стоимость силы' : 'Power cost'}<input type="number" min={0} max={10} value={hero.power.goldCost} disabled={hero.power.isPassive} onChange={e => setHero({ ...hero, power: { ...hero.power, goldCost: Number(e.target.value) } })} /></label>
        <p>{abCopyName(copy, 'powers', hero.power.id, lang, t(`abPower_${hero.power.id}`))}: {copy.powers?.[hero.power.id]?.description ? pickLoc(copy.powers[hero.power.id]!.description!, lang) : t(`abHint_${hero.power.id}`)}</p>
      </fieldset>
      <ul className="editor-issues">{heroIssues(hero, ru).map(issue => <li key={issue}>{issue}</li>)}</ul>
    </section>
    {artPanel(heroArt, 'hero', art => setHero(h => ({ ...h, art })))}
    <aside className="editor-preview-panel">
      <h2>{ru ? 'Предпросмотр героя' : 'Hero preview'}</h2>
      <article className="hero-portrait">
        <div className="hero-photo"><AbHeroFace id={hero.id} art={hero.art} /></div>
        <span className="hero-health">♥ {hero.health}</span>
        <h2>{hero.name[ru ? 'ru' : 'en'] || hero.name.ru}</h2>
        <div className="hero-ability">
          <strong>{label('powers', hero.power.id, t(`abPower_${hero.power.id}`))}</strong>
          <span>{hero.power.isPassive ? t('abPassive') : `${hero.power.goldCost}$`}</span>
          <p>{copy.powers?.[hero.power.id]?.description ? pickLoc(copy.powers[hero.power.id]!.description!, lang) : t(`abHint_${hero.power.id}`)}</p>
        </div>
      </article>
      {(hero.description?.ru || hero.description?.en) && <p className="editor-copy-preview">{pickLoc(hero.description, lang)}</p>}
      <h2>{ru ? 'Герои в каталоге' : 'Catalog heroes'} ({heroes.length})</h2>
      <ul className="editor-hero-list">{heroes.map(h => <li key={h.id}>
        <button type="button" aria-pressed={h.id === hero.id} onClick={() => chooseHero(h)}>{h.name[lang] || h.name.ru}</button>
        <span>{label('powers', h.power.id, t(`abPower_${h.power.id}`))}{h.power.isPassive ? '' : ` · ${h.power.goldCost}$`}</span>
        <span>♥ {h.health}</span>
      </li>)}</ul>
    </aside></div> : pane === 'tribes' ? <div className="editor-copy-grid tribes-grid">
      <section className="editor-copy-col tribe-card tribe-new" data-testid="tribe-new">
        <h2>{ru ? '+ Новая раса' : '+ New tribe'}</h2>
        <p className="editor-note">{ru ? 'Раса появляется в игре после публикации текстов. Существа с ней — через карточку существа. Встроенные расы удалить нельзя.' : 'A tribe goes live once texts are published. Give minions the tribe on their card. Built-in tribes cannot be removed.'}</p>
        <label>ID<input value={newTribe.id} maxLength={60} placeholder="elf" aria-label={ru ? 'ID новой расы' : 'New tribe ID'} onChange={e => setNewTribe({ ...newTribe, id: e.target.value.toLowerCase() })} /></label>
        <label>{ru ? 'Название (ru)' : 'Name (ru)'}<input value={newTribe.ru} maxLength={100} placeholder={ru ? 'Эльфы' : 'Elves'} aria-label={ru ? 'Название новой расы' : 'New tribe name'} onChange={e => setNewTribe({ ...newTribe, ru: e.target.value })} /></label>
        <label>{ru ? 'Название (en)' : 'Name (en)'}<input value={newTribe.en} maxLength={100} placeholder="Elves" onChange={e => setNewTribe({ ...newTribe, en: e.target.value })} /></label>
        <button type="button" className="is-primary" onClick={addTribe}>{ru ? 'Добавить расу' : 'Add tribe'}</button>
        <small className="field-hint">{ru ? `Рас: ${tribeIds.length}. За столом играют ${AB_MATCH_TRIBES} случайных (плюс «Без типа»).` : `Tribes: ${tribeIds.length}. A table plays ${AB_MATCH_TRIBES} random ones (plus Neutral).`}</small>
      </section>
      {tribeIds.map(tribe => {
        const entry = entryOf(copy, 'tribes', tribe);
        const members = membersOf(tribe);
        const perTier = [1, 2, 3, 4, 5, 6].map(tier => members.filter(m => m.tavernTier === tier).length);
        return <section className="editor-copy-col tribe-card" key={tribe} data-testid={`tribe-${tribe}`}>
          <h2>{tribeName(tribe)} <small>{tribe}</small>{!builtin(tribe) && <button type="button" className="is-danger" disabled={members.length > 0} title={members.length ? (ru ? 'Сначала уберите расу у существ' : 'Remove the tribe from its minions first') : undefined} onClick={() => removeTribe(tribe)}>✕</button>}</h2>
          <label>{ru ? 'Название (ru)' : 'Name (ru)'}<input aria-label={`${t(`abTribe_${tribe}`)} ru`} value={entry.name.ru} maxLength={100} placeholder={t(`abTribe_${tribe}`)} onChange={e => patchCopy('tribes', tribe, 'name', 'ru', e.target.value)} /></label>
          <label>{ru ? 'Название (en)' : 'Name (en)'}<input value={entry.name.en} maxLength={100} onChange={e => patchCopy('tribes', tribe, 'name', 'en', e.target.value)} /></label>
          <label>{ru ? 'Описание (ru)' : 'Description (ru)'}<textarea aria-label={`${t(`abTribe_${tribe}`)} ${ru ? 'описание' : 'description'}`} value={entry.description?.ru ?? ''} maxLength={500} placeholder={ru ? 'Чем славится эта раса — подсказка в игре' : 'What this tribe is about — the in-game hint'} onChange={e => patchCopy('tribes', tribe, 'description', 'ru', e.target.value)} /></label>
          <label>{ru ? 'Описание (en)' : 'Description (en)'}<textarea value={entry.description?.en ?? ''} maxLength={500} onChange={e => patchCopy('tribes', tribe, 'description', 'en', e.target.value)} /></label>
          <h3>{ru ? 'Существа' : 'Minions'} ({members.length})</h3>
          <ul className="tribe-tiers" aria-label={ru ? 'По тирам' : 'By tier'}>{perTier.map((count, i) => <li key={i} className={count ? '' : 'is-empty'}><b>{'★'.repeat(i + 1)}</b>{count}</li>)}</ul>
          {members.length === 0 && <p className="editor-note">{ru ? 'Пока никого. Откройте существо и отметьте расу в его карточке.' : 'Nobody yet. Open a minion and tick this tribe on its card.'}</p>}
          <ul className="editor-hero-list">{members.map(m => <li key={m.id}>
            <button type="button" onClick={() => { chooseMinion(m); setPane('minions'); }} title={ru ? 'Открыть существо' : 'Open minion'}>{m.name[lang] || m.name.ru}</button>
            <span>{'★'.repeat(m.tavernTier)} · {m.attack}/{m.health}</span>
          </li>)}</ul>
        </section>;
      })}
    </div> : pane === 'sets' ? <CardSetsPane catalog={catalog} tavern={catalogPreview} endpoint={endpoint} ru={ru} minionName={minionName} onCatalog={next => setCatalog(next)} onEditMinion={(id, set) => { const found = set.minions.find(m => m.id === id); if (found) { chooseMinion(found); setPane('minions'); } }} /> : <div className="editor-copy-grid">
      {copyBlock(ru ? 'Свойства' : 'Keywords', 'keywords', autoBattlerKeywords, id => t(`abKeyword_${id}`), id => t(`abKeyword_${id}`))}
      {copyBlock(ru ? 'Приветствия' : 'Battlecries', 'battlecries', autoBattlerBattlecries, id => label('battlecries', id, ru ? 'Приветствие' : 'Battlecry'), () => ru ? 'Что происходит при розыгрыше' : 'What happens when played')}
      {copyBlock(ru ? 'Ауры' : 'Auras', 'auras', autoBattlerAuras, () => t('abAuraHint'), () => t('abAuraHint'))}
      {copyBlock(ru ? 'Силы героев' : 'Hero powers', 'powers', powerIds, id => t(`abPower_${id}`), id => t(`abHint_${id}`))}
    </div>}
    {pane !== 'sets' && <section className="publish">
      <button className="is-primary" disabled={!canPublish} title="Ctrl+S" onClick={() => void publish()}>{pane === 'minions' ? (ru ? 'Опубликовать существо' : 'Publish minion') : pane === 'heroes' ? (ru ? 'Опубликовать героя' : 'Publish hero') : (ru ? 'Опубликовать тексты' : 'Publish texts')}</button>
      <span className={`publish-state is-${draftState}`}>{draftState === 'new' ? (ru ? 'Новая запись — ещё не в каталоге' : 'New entry — not in the catalog yet') : draftState === 'changed' ? (ru ? 'Есть неопубликованные изменения' : 'Unpublished changes') : (ru ? 'Совпадает с каталогом' : 'Matches the catalog')}</span>
      {issues.length > 0 && <span className="publish-issues">{ru ? `Ошибок: ${issues.length}` : `${issues.length} issue(s)`}</span>}
      {!catalog.version && <span className="publish-issues">{ru ? 'Каталог не загружен' : 'Catalog not loaded'}</span>}
      <p role="status" data-tone={messageTone}>{message}</p></section>}
  </main>;
}
