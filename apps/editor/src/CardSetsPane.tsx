import { useEffect, useState } from 'react';
import {
  BOARD_PRESETS,
  cardSetFromCatalog,
  pickLoc,
  setFairness,
  validateAutoBattlerCopy,
  validateCardSet,
  type AutoBattlerCatalog,
  type CardSet,
  type CardSetSummary,
  type Catalog,
  type SetFairness,
  type CardSetTheme,
  type LevelDef,
  CARD_SET_MAX_WALLPAPER,
  LEVEL_COUNT,
  MENU_MUSIC_MAX,
  resolveLeveling,
} from '@kartishki/shared';
import { uploadPortrait } from './uploadPortrait';
import { uploadMusic } from './uploadMusic';

type Props = {
  catalog: Catalog;
  tavern: AutoBattlerCatalog;
  endpoint: string;
  ru: boolean;
  minionName: (id: string) => string;
  onCatalog: (next: Catalog) => void;
  /** Load one of the set's minions into the minion editor. */
  onEditMinion: (id: string, set: CardSet) => void;
};

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `${name}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const GRADE = { fair: ['честный', 'fair'], strong: ['сильный — есть карты выше нормы', 'strong — some cards above the norm'], broken: ['нечестный — публикация закрыта', 'broken — publishing refused'] } as const;

/**
 * Workshop card sets: one file per set (the shape people will share), built from the tavern or imported, judged by
 * the hidden fairness points before it can be published, and offered in the game lobby once it is.
 */
export function CardSetsPane({ catalog, tavern, endpoint, ru, minionName, onCatalog, onEditMinion }: Props) {
  const [published, setPublished] = useState<CardSetSummary[]>([]);
  const [draft, setDraft] = useState<CardSet | null>(null);
  const [fairness, setFairness_] = useState<SetFairness | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    try { const r = await fetch(`${endpoint}/api/card-sets`); if (r.ok) setPublished(await r.json()); } catch { /* offline editor keeps its draft */ }
  }
  useEffect(() => { void refresh(); }, [catalog.version]);
  useEffect(() => { setFairness_(draft ? setFairness(draft.minions) : null); }, [draft]);

  function fromTavern() {
    const id = `set-${Date.now().toString(36)}`;
    // The editor's copy draft may hold half-typed entries; a set only carries a valid copy block.
    const copy = tavern.copy && validateAutoBattlerCopy(tavern.copy) ? tavern.copy : undefined;
    setDraft(cardSetFromCatalog({ ...tavern, copy }, id, { ru: 'Мой набор', en: 'My set' }));
    setMessage('');
  }
  async function open(id: string) {
    try {
      const r = await fetch(`${endpoint}/api/card-sets/${id}`);
      if (!r.ok) throw new Error();
      const data: { set: CardSet } = await r.json();
      setDraft(data.set); setMessage('');
    } catch { setMessage(ru ? 'Не удалось загрузить набор' : 'Could not load the set'); }
  }
  async function importJson(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 12_000_000) throw new Error();
      const data: unknown = JSON.parse(await file.text());
      if (!validateCardSet(data)) throw new Error();
      setDraft(data); setMessage(ru ? 'Набор загружен из файла' : 'Set loaded from file');
    } catch { setMessage(ru ? 'Файл не похож на набор карт (format 1)' : 'That file is not a card set (format 1)'); }
  }
  async function publish() {
    if (!draft || !validateCardSet(draft)) { setMessage(ru ? 'Проверьте набор: id, название, не меньше 8 существ в лавке, все призывы существуют' : 'Check the set: id, name, at least 8 tavern minions, every summon exists'); return; }
    setBusy(true);
    try {
      const r = await fetch(`${endpoint}/api/card-sets`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ set: draft, version: catalog.version }) });
      const data = await r.json();
      if (!r.ok) { setMessage(data.error === 'unfairSet' ? (ru ? 'Набор нечестный: слишком сильные карты. Смотри вердикт ниже.' : 'Unfair set: cards far above the norm. See the verdict below.') : data.error === 'catalogConflict' ? (ru ? 'Каталог изменился. Обновите и повторите.' : 'Catalog changed. Reload and retry.') : (ru ? 'Не удалось опубликовать набор.' : 'Could not publish the set.')); if (data.fairness) setFairness_(data.fairness); return; }
      onCatalog(data);
      setMessage(ru ? 'Набор опубликован: его можно выбрать в лобби Поля сражений.' : 'Set published: it can be picked in the Battlegrounds lobby.');
    } catch { setMessage(ru ? 'Не удалось соединиться с сервером' : 'Could not reach the server'); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true);
    try {
      const r = await fetch(`${endpoint}/api/card-sets/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: catalog.version }) });
      const data = await r.json();
      if (!r.ok) { setMessage(ru ? 'Не удалось удалить набор.' : 'Could not remove the set.'); return; }
      onCatalog(data); if (draft?.id === id) setDraft(null);
      setMessage(ru ? 'Набор удалён.' : 'Set removed.');
    } catch { setMessage(ru ? 'Не удалось соединиться с сервером' : 'Could not reach the server'); }
    finally { setBusy(false); }
  }
  const patch = (fn: (set: CardSet) => CardSet) => setDraft(current => current ? fn(current) : current);
  const patchTheme = (fn: (theme: CardSetTheme) => CardSetTheme) => patch(s => {
    const theme = fn(s.theme ?? {});
    const clean: CardSetTheme = { ...(theme.wallpaper?.length ? { wallpaper: theme.wallpaper } : {}), ...(theme.menuMusic?.length ? { menuMusic: theme.menuMusic } : {}), ...(theme.leveling ? { leveling: theme.leveling } : {}) };
    return { ...s, theme: Object.keys(clean).length ? clean : undefined };
  });
  const patchLevel = (index: number, change: Partial<LevelDef>) => patchTheme(th => ({ ...th, leveling: { ...th.leveling!, levels: th.leveling!.levels.map((level, i) => i === index ? { ...level, ...change } : level) } }));
  async function addWallpaper(files: File[]) {
    for (const file of files.slice(0, CARD_SET_MAX_WALLPAPER)) {
      try {
        const { originalUrl } = await uploadPortrait(file, endpoint);
        const path = new URL(originalUrl).pathname;
        patchTheme(th => ({ ...th, wallpaper: [...(th.wallpaper ?? []).filter(x => x !== path), path].slice(-CARD_SET_MAX_WALLPAPER) }));
      } catch { setMessage(ru ? `Не удалось загрузить ${file.name}` : `Could not upload ${file.name}`); }
    }
  }
  async function addTrack(file: File | undefined) {
    if (!file) return;
    try {
      const url = await uploadMusic(file, endpoint);
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'track';
      patchTheme(th => ({ ...th, menuMusic: [...(th.menuMusic ?? []).filter(x => x.url !== url), { id: url.split('/').pop()!.split('.')[0]!.slice(0, 60), name, url }].slice(0, MENU_MUSIC_MAX) }));
    } catch { setMessage(ru ? 'Нужен MP3, WAV, OGG или WebM до 8 МБ' : 'Need MP3, WAV, OGG or WebM up to 8 MB'); }
  }
  const over = fairness ? [...fairness.cards].filter(c => c.verdict === 'over' || c.verdict === 'broken').sort((a, b) => b.delta - a.delta) : [];
  const under = fairness ? fairness.cards.filter(c => c.verdict === 'under') : [];
  return <div className="editor-grid card-sets" data-testid="card-sets-pane">
    <section className="editor-fields">
      <h2>{ru ? 'Наборы карт (Workshop)' : 'Card sets (Workshop)'}</h2>
      <p className="editor-note">{ru ? 'Набор — один файл JSON: существа, герои и тексты. Его можно выложить в мастерскую, а за столом выбрать в лобби.' : 'A set is one JSON file: minions, heroes and copy. Share it in the workshop; tables pick it in the lobby.'}</p>
      <div className="toolbar">
        <button type="button" onClick={fromTavern}>{ru ? 'Собрать из текущей таверны' : 'Build from the current tavern'}</button>
        <label className="file-button">{ru ? 'Импорт файла' : 'Import file'}<input type="file" accept="application/json,.json" onChange={e => void importJson(e.target.files?.[0])} /></label>
        {draft && <button type="button" onClick={() => download(draft.id, draft)}>{ru ? 'Экспорт файла' : 'Export file'}</button>}
      </div>
      <h3>{ru ? 'Опубликованные' : 'Published'} ({published.length})</h3>
      <ul className="editor-hero-list">
        {published.map(set => <li key={set.id}>
          <button type="button" aria-pressed={draft?.id === set.id} onClick={() => void open(set.id)}>{pickLoc(set.name, ru ? 'ru' : 'en')}</button>
          <span>{set.minions} {ru ? 'существ' : 'minions'}{set.heroes ? ` · ${set.heroes} ${ru ? 'героев' : 'heroes'}` : ''}{set.author ? ` · ${set.author}` : ''} · v{set.version}</span>
          <button type="button" disabled={busy} onClick={() => void remove(set.id)}>✕</button>
        </li>)}
        {!published.length && <li><span>{ru ? 'Пока ничего не опубликовано.' : 'Nothing published yet.'}</span></li>}
      </ul>
      {draft && <>
        <h3>{ru ? 'Черновик набора' : 'Set draft'}</h3>
        <label>ID<input value={draft.id} maxLength={60} onChange={e => patch(s => ({ ...s, id: e.target.value }))} /></label>
        <label>{ru ? 'Название (ru)' : 'Name (ru)'}<input value={draft.name.ru} maxLength={100} onChange={e => patch(s => ({ ...s, name: { ...s.name, ru: e.target.value } }))} /></label>
        <label>{ru ? 'Название (en)' : 'Name (en)'}<input value={draft.name.en} maxLength={100} onChange={e => patch(s => ({ ...s, name: { ...s.name, en: e.target.value } }))} /></label>
        <label>{ru ? 'Автор' : 'Author'}<input value={draft.author ?? ''} maxLength={60} onChange={e => patch(s => ({ ...s, author: e.target.value || undefined }))} /></label>
        <label>{ru ? 'Описание (ru)' : 'Description (ru)'}<textarea value={draft.description?.ru ?? ''} maxLength={1000} onChange={e => patch(s => ({ ...s, description: { ru: e.target.value, en: s.description?.en ?? '' } }))} /></label>
        <label>{ru ? 'Описание (en)' : 'Description (en)'}<textarea value={draft.description?.en ?? ''} maxLength={1000} onChange={e => patch(s => ({ ...s, description: { ru: s.description?.ru ?? '', en: e.target.value } }))} /></label>
        <label>{ru ? 'Стол набора' : 'Set table'}<select value={draft.board ?? ''} onChange={e => patch(s => ({ ...s, board: e.target.value || undefined }))}>
          <option value="">—</option>
          {BOARD_PRESETS.map(p => <option key={p.id} value={p.id}>{pickLoc(p.name, ru ? 'ru' : 'en')}</option>)}
        </select></label>
        <label className="check"><input type="checkbox" checked={!!draft.heroes?.length} onChange={e => patch(s => ({ ...s, heroes: e.target.checked ? structuredClone(tavern.heroes) : undefined }))} />{ru ? 'Свои герои (иначе стандартные)' : 'Own hero roster (else the standard one)'}</label>
        <fieldset className="set-theme"><legend>{ru ? 'Тема набора' : 'Set theme'}</legend>
          <p className="editor-note">{ru ? 'Выбранный набор меняет игру целиком: лица за меню, музыку, названия и число уровней, стол.' : 'The picked set themes the whole game: menu faces, music, level names and count, the table.'}</p>
          <h3>{ru ? 'Фон меню' : 'Menu wallpaper'} ({draft.theme?.wallpaper?.length ?? 0})</h3>
          <div className="theme-wallpaper">
            {(draft.theme?.wallpaper ?? []).map(url => <span key={url}><img src={`${endpoint}${url}`} alt="" /><button type="button" className="is-danger" onClick={() => patchTheme(th => ({ ...th, wallpaper: th.wallpaper?.filter(x => x !== url) }))}>✕</button></span>)}
          </div>
          <label className="file-button">{ru ? 'Добавить лица' : 'Add faces'}<input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={e => { void addWallpaper(Array.from(e.target.files ?? [])); e.target.value = ''; }} /></label>
          <small className="field-hint">{ru ? 'Вырезанные лица на прозрачном PNG плывут за главным меню. Пусто — стандартные.' : 'Cut-out faces on transparent PNG drift behind the main menu. Empty — the defaults.'}</small>
          <h3>{ru ? 'Музыка меню' : 'Menu music'} ({draft.theme?.menuMusic?.length ?? 0})</h3>
          <ul className="editor-hero-list">{(draft.theme?.menuMusic ?? []).map(track => <li key={track.id}>
            <span>{track.name}</span><audio controls preload="none" src={`${endpoint}${track.url}`} />
            <button type="button" className="is-danger" onClick={() => patchTheme(th => ({ ...th, menuMusic: th.menuMusic?.filter(x => x.id !== track.id) }))}>✕</button>
          </li>)}</ul>
          <label className="file-button">{ru ? 'Добавить трек' : 'Add track'}<input type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/webm" onChange={e => { void addTrack(e.target.files?.[0]); e.target.value = ''; }} /></label>
          <h3>{ru ? 'Уровни' : 'Levels'}</h3>
          <label className="check"><input type="checkbox" checked={!!draft.theme?.leveling} onChange={e => patchTheme(th => ({ ...th, leveling: e.target.checked ? structuredClone(resolveLeveling(catalog.playerLeveling)) : undefined }))} />{ru ? 'Свои названия и число уровней' : 'Own level names and count'}</label>
          {draft.theme?.leveling && <>
            <label>{ru ? 'Число уровней' : 'Level count'}<input type="number" min={1} max={LEVEL_COUNT} value={draft.theme.leveling.levels.length} onChange={e => {
              const count = Math.min(LEVEL_COUNT, Math.max(1, Number(e.target.value) || 1));
              patchTheme(th => { const levels = [...th.leveling!.levels]; while (levels.length < count) levels.push({ ru: `Уровень ${levels.length + 1}`, en: `Level ${levels.length + 1}`, xp: levels.at(-1)?.xp ?? 100 }); return { ...th, leveling: { ...th.leveling!, levels: levels.slice(0, count) } }; });
            }} /></label>
            <table className="levels-table set-levels"><thead><tr><th>#</th><th>ru</th><th>en</th><th>XP</th></tr></thead><tbody>
              {draft.theme.leveling.levels.map((level, i) => <tr key={i}><td>{i + 1}</td>
                <td><input value={level.ru} maxLength={40} onChange={e => patchLevel(i, { ru: e.target.value })} /></td>
                <td><input value={level.en} maxLength={40} onChange={e => patchLevel(i, { en: e.target.value })} /></td>
                <td><input type="number" min={1} max={100000} value={level.xp} onChange={e => patchLevel(i, { xp: Math.max(1, Number(e.target.value) || 1) })} /></td></tr>)}
            </tbody></table>
          </>}
        </fieldset>
      </>}
    </section>
    {draft && <section className="editor-art-panel">
      <h2>{ru ? 'Состав' : 'Contents'} ({draft.minions.length})</h2>
      <ul className="editor-hero-list set-minions">
        {draft.minions.map(m => {
          const card = fairness?.cards.find(c => c.id === m.id);
          return <li key={m.id} className={card ? `is-${card.verdict}` : ''}>
            <button type="button" onClick={() => onEditMinion(m.id, draft)}>{minionName(m.id) || m.name.ru}</button>
            <span>T{m.tavernTier} · {m.attack}/{m.health}{m.token ? (ru ? ' · жетон' : ' · token') : ''}{m.spell ? (ru ? ' · заклинание' : ' · spell') : ''}</span>
            {card && <span className="set-verdict">{card.verdict === 'fair' ? '✓' : card.verdict === 'under' ? '↓' : card.verdict === 'over' ? '↑' : '‼'}</span>}
            <button type="button" onClick={() => patch(s => ({ ...s, minions: s.minions.filter(x => x.id !== m.id) }))}>✕</button>
          </li>;
        })}
      </ul>
    </section>}
    {draft && <aside className="editor-preview-panel">
      <h2>{ru ? 'Честность набора' : 'Set fairness'}</h2>
      {fairness && <div className={`fairness fairness-${fairness.grade}`} data-testid="set-fairness">
        <p className="fairness-grade">{GRADE[fairness.grade][ru ? 0 : 1]}</p>
        <table className="fairness-tiers"><thead><tr><th>{ru ? 'Тир' : 'Tier'}</th><th>{ru ? 'Карт' : 'Cards'}</th><th>{ru ? 'Отклонение' : 'Offset'}</th></tr></thead>
          <tbody>{fairness.tiers.map(t => <tr key={t.tier}><td>{t.tier}</td><td>{t.count}</td><td>{t.count ? (t.mean > 0 ? '+' : '') + t.mean : '—'}</td></tr>)}</tbody></table>
        {over.length > 0 && <p><b>{ru ? 'Сильнее нормы' : 'Above the norm'}:</b> {over.slice(0, 8).map(c => `${minionName(c.id) || c.id} (+${c.delta})`).join(', ')}</p>}
        {under.length > 0 && <p><b>{ru ? 'Слабее нормы' : 'Below the norm'}:</b> {under.slice(0, 8).map(c => `${minionName(c.id) || c.id} (${c.delta})`).join(', ')}</p>}
        {fairness.problems.length > 0 && <ul className="editor-issues">{fairness.problems.map(p => <li key={p}>{p}</li>)}</ul>}
        <p className="editor-note">{ru ? 'Баллы честности каждой механики скрыты; здесь только вердикт. Нечестный набор сервер не примет.' : 'The points behind each mechanic stay hidden; only the verdict shows. The server refuses a broken set.'}</p>
      </div>}
      <section className="publish">
        <button type="button" disabled={busy || !catalog.version || !validateCardSet(draft) || fairness?.grade === 'broken'} onClick={() => void publish()}>{ru ? 'Опубликовать набор' : 'Publish set'}</button>
        <p role="status">{message}</p>
      </section>
    </aside>}
    {!draft && message && <aside className="editor-preview-panel"><p role="status">{message}</p></aside>}
  </div>;
}
