import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  abCopyEntry,
  abCopyName,
  autoBattlerAuras,
  autoBattlerBattlecries,
  autoBattlerHeroPowerPresets,
  autoBattlerKeywords,
  autoBattlerTribes,
  pickLoc,
  starterAutoBattlerHeroes,
  starterAutoBattlerMinions,
  validateAutoBattlerCopy,
  validateAutoBattlerHero,
  validateAutoBattlerMinion,
  type AutoBattlerCopy,
  type AutoBattlerCopyEntry,
  type AutoBattlerCopyGroup,
  type AutoBattlerHeroDef,
  type AutoBattlerHeroPowerId,
  type AutoBattlerKeyword,
  type AutoBattlerMinionDef,
  type AutoBattlerTribe,
  type Catalog,
} from '@kartishki/shared';
import { applyPortraitPreset } from '@kartishki/shared/photo';
import { ImageProcessingPipeline } from './ImageProcessingPipeline';
import { uploadPortrait } from './uploadPortrait';
import { AbHeroFace } from '../../client/src/battlegrounds/AbHeroFace';
import { MinionTile } from '../../client/src/battlegrounds/MinionTile';
import '../../client/src/battlegrounds/battlegrounds.css';

const endpoint = import.meta.env.VITE_SERVER_URL ?? 'http://127.0.0.1:2567';
const blankArt = () => structuredClone(starterAutoBattlerMinions[0]!.art) ?? { url: '', crop: { x: .5, y: .5, size: 1 }, threshold: .5, contrast: 1, preset: 'none' as const };
const powerIds = Object.keys(autoBattlerHeroPowerPresets) as AutoBattlerHeroPowerId[];

function previewMinion(def: AutoBattlerMinionDef) {
  return {
    id: 'preview', cardId: def.id, baseId: def.id, kind: 'minion',
    attack: def.attack, health: def.health, maxHealth: def.health,
    tavernTier: def.tavernTier, keywords: def.keywords, golden: false, owner: '',
  };
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
  const [pane, setPane] = useState<'minions' | 'heroes' | 'copy'>('minions');
  const [minion, setMinion] = useState<AutoBattlerMinionDef>(() => structuredClone(starterAutoBattlerMinions.find(m => !m.token) ?? starterAutoBattlerMinions[1]!));
  const [hero, setHero] = useState<AutoBattlerHeroDef>(() => structuredClone(starterAutoBattlerHeroes[0]!));
  const [copy, setCopy] = useState<AutoBattlerCopy>({});
  const [catalog, setCatalog] = useState<Catalog>({ version: 0, cards: [] });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const minions = catalog.autoBattlerMinions ?? starterAutoBattlerMinions;
  const heroes = catalog.autoBattlerHeroes ?? starterAutoBattlerHeroes;

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

  return <main className="editor"><header><h1>{ru ? 'Редактор поля сражений' : 'Battlegrounds editor'}</h1><div className="editor-nav">{nav}</div></header>
    <div className="toolbar">
      <button type="button" aria-pressed={pane === 'minions'} onClick={() => { setPane('minions'); setMessage(''); }}>{ru ? 'Существа' : 'Minions'}</button>
      <button type="button" aria-pressed={pane === 'heroes'} onClick={() => { setPane('heroes'); setMessage(''); }}>{ru ? 'Герои' : 'Heroes'}</button>
      <button type="button" aria-pressed={pane === 'copy'} onClick={() => { setPane('copy'); setMessage(''); }}>{ru ? 'Названия и описания' : 'Names and text'}</button>
      <button onClick={() => void load()}>{ru ? 'Обновить каталог' : 'Reload catalog'}</button>
      {pane === 'minions' ? <>
        <button onClick={() => chooseMinion({ ...structuredClone(starterAutoBattlerMinions.find(m => m.id === 'ab-bruiser')!), id: `ab-${Date.now()}`, name: { ru: 'Новое существо', en: 'New minion' }, description: { ru: '', en: '' }, keywords: [], tribes: ['neutral'] })}>{ru ? 'Новое существо' : 'New minion'}</button>
        <select aria-label={ru ? 'Каталог лавки' : 'Tavern catalog'} value={minions.some(m => m.id === minion.id) ? minion.id : ''} onChange={e => { const found = minions.find(m => m.id === e.target.value); if (found) chooseMinion(found); }}>
          <option value="">{ru ? 'Черновик' : 'Draft'}</option>
          {minions.map(m => <option key={m.id} value={m.id}>{m.name[ru ? 'ru' : 'en'] || m.name.ru}</option>)}
        </select>
      </> : pane === 'heroes' ? <>
        <button onClick={() => { const id = `ab-hero-${Date.now()}`; chooseHero({ ...structuredClone(starterAutoBattlerHeroes[0]!), id, portraitKey: id, name: { ru: 'Новый герой', en: 'New hero' }, description: { ru: '', en: '' } }); }}>{ru ? 'Новый герой' : 'New hero'}</button>
        <select aria-label={ru ? 'Каталог героев' : 'Hero catalog'} value={heroes.some(h => h.id === hero.id) ? hero.id : ''} onChange={e => { const found = heroes.find(h => h.id === e.target.value); if (found) chooseHero(found); }}>
          <option value="">{ru ? 'Черновик' : 'Draft'}</option>
          {heroes.map(h => <option key={h.id} value={h.id}>{h.name[ru ? 'ru' : 'en'] || h.name.ru}</option>)}
        </select>
      </> : null}
    </div>
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
      <fieldset><legend>{ru ? 'Расы' : 'Tribes'}</legend>
        {autoBattlerTribes.map(tribe => <label className="check" key={tribe}><input type="checkbox" checked={(minion.tribes ?? ['neutral']).includes(tribe)} onChange={e => toggleTribe(tribe, e.target.checked)} />{label('tribes', tribe, t(`abTribe_${tribe}`))}</label>)}
      </fieldset>
      <fieldset><legend>{ru ? 'Свойства' : 'Keywords'}</legend>
        {autoBattlerKeywords.map(key => <label className="check" key={key}><input type="checkbox" checked={minion.keywords.includes(key)} onChange={e => toggleKeyword(key, e.target.checked)} />{label('keywords', key, t(`abKeyword_${key}`))}</label>)}
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
      </fieldset>
      <fieldset><legend>{ru ? 'Лавка' : 'Shop'}</legend>
        <label className="check"><input type="checkbox" checked={minion.token === true} onChange={e => setMinion({ ...minion, token: e.target.checked || undefined, inTavern: e.target.checked ? false : minion.inTavern, inDiscover: e.target.checked ? false : minion.inDiscover })} />{ru ? 'Жетон' : 'Token'}</label>
        <label className="check"><input type="checkbox" checked={minion.inTavern !== false && !minion.token} onChange={e => setMinion({ ...minion, inTavern: e.target.checked ? undefined : false })} />{ru ? 'В лавке' : 'In tavern'}</label>
        <label className="check"><input type="checkbox" checked={minion.inDiscover !== false && !minion.token} onChange={e => setMinion({ ...minion, inDiscover: e.target.checked ? undefined : false })} />{ru ? 'В открытии' : 'In Discover'}</label>
      </fieldset>
    </section>
    <section className="editor-art-panel">
      <label>{ru ? 'Фотография существа' : 'Minion photo'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void photo(e.target.files?.[0], 'minion')} /></label>
      {minion.art && (['x', 'y', 'size'] as const).map(key => <label key={key}>{ru ? `Кадр ${key}` : `Crop ${key}`}<input type="range" min={key === 'size' ? .1 : 0} max={1} step={.01} value={minion.art!.crop[key]} onChange={e => setMinion({ ...minion, art: { ...minion.art!, crop: { ...minion.art!.crop, [key]: Number(e.target.value) } } })} /></label>)}
      <button type="button" onClick={() => { request.current++; setMinion({ ...minion, art: undefined }); }}>{ru ? 'Убрать фото существа' : 'Remove minion photo'}</button>
      {minion.art && <ImageProcessingPipeline art={minion.art} onChange={art => setMinion(m => ({ ...m, art }))} />}
    </section>
    <aside className="editor-preview-panel">
      <h2>{ru ? 'Предпросмотр в лавке' : 'Tavern preview'}</h2>
      <div className="editor-inspect" style={{ '--ab-card': '150px', position: 'relative', minHeight: 220 } as CSSProperties}>
        <MinionTile minion={previewMinion(minion)} catalog={catalogPreview} fullCard arrive={false} disabled />
      </div>
      {(minion.description?.ru || minion.description?.en) && <p className="editor-copy-preview">{pickLoc(minion.description, lang)}</p>}
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
    </section>
    <section className="editor-art-panel">
      <label>{ru ? 'Фотография героя' : 'Hero photo'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void photo(e.target.files?.[0], 'hero')} /></label>
      {heroArt && (['x', 'y', 'size'] as const).map(key => <label key={key}>{ru ? `Кадр ${key}` : `Crop ${key}`}<input type="range" min={key === 'size' ? .1 : 0} max={1} step={.01} value={heroArt.crop[key]} onChange={e => setHero({ ...hero, art: { ...heroArt, crop: { ...heroArt.crop, [key]: Number(e.target.value) } } })} /></label>)}
      <button type="button" onClick={() => { request.current++; setHero({ ...hero, art: undefined }); }}>{ru ? 'Убрать фото героя' : 'Remove hero photo'}</button>
      {heroArt && <ImageProcessingPipeline art={heroArt} onChange={art => setHero(h => ({ ...h, art }))} />}
    </section>
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
    </aside></div> : <div className="editor-copy-grid">
      {copyBlock(ru ? 'Свойства' : 'Keywords', 'keywords', autoBattlerKeywords, id => t(`abKeyword_${id}`), id => t(`abKeyword_${id}`))}
      {copyBlock(ru ? 'Расы' : 'Tribes', 'tribes', autoBattlerTribes, id => t(`abTribe_${id}`), id => t(`abTribe_${id}`))}
      {copyBlock(ru ? 'Приветствия' : 'Battlecries', 'battlecries', autoBattlerBattlecries, id => label('battlecries', id, ru ? 'Приветствие' : 'Battlecry'), () => ru ? 'Что происходит при розыгрыше' : 'What happens when played')}
      {copyBlock(ru ? 'Ауры' : 'Auras', 'auras', autoBattlerAuras, () => t('abAuraHint'), () => t('abAuraHint'))}
      {copyBlock(ru ? 'Силы героев' : 'Hero powers', 'powers', powerIds, id => t(`abPower_${id}`), id => t(`abHint_${id}`))}
    </div>}
    <section className="publish">{pane === 'minions'
      ? <button disabled={busy || !catalog.version || !validateAutoBattlerMinion(minion)} onClick={() => void publishMinion()}>{ru ? 'Опубликовать существо' : 'Publish minion'}</button>
      : pane === 'heroes'
        ? <button disabled={busy || !catalog.version || !validateAutoBattlerHero(hero)} onClick={() => void publishHero()}>{ru ? 'Опубликовать героя' : 'Publish hero'}</button>
        : <button disabled={busy || !catalog.version || !validateAutoBattlerCopy(packedCopy(copy))} onClick={() => void publishCopy()}>{ru ? 'Опубликовать тексты' : 'Publish texts'}</button>}
      <p role="status">{message}</p></section>
  </main>;
}
