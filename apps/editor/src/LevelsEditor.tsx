import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BATTLEGROUNDS_ELO_MAX, resolveLeveling, starterLeveling, validatePlayerLeveling, type Catalog, type PlayerLeveling } from '@kartishki/shared';

const endpoint = import.meta.env.VITE_SERVER_URL ?? 'http://127.0.0.1:2567';

export function LevelsEditor({ nav }: { nav: ReactNode }) {
  const { t, i18n } = useTranslation();
  const ru = i18n.language === 'ru';
  const [catalog, setCatalog] = useState<Catalog>({ version: 0, cards: [] });
  const [leveling, setLeveling] = useState<PlayerLeveling>(starterLeveling);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try {
      const result = await fetch(`${endpoint}/api/catalog`);
      if (!result.ok) throw new Error();
      const data: Catalog = await result.json();
      setCatalog(data);
      setLeveling(structuredClone(resolveLeveling(data.playerLeveling)));
      setMessage('catalogLoaded');
    } catch { setMessage('connectionError'); } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  function patch(index: number, key: 'ru' | 'en' | 'xp', value: string) {
    setLeveling(current => ({
      ...current,
      levels: current.levels.map((row, i) => i !== index ? row : { ...row, [key]: key === 'xp' ? Number(value) : value }),
    }));
  }
  async function publish() {
    if (!validatePlayerLeveling(leveling)) { setMessage('invalidLeveling'); return; }
    setBusy(true);
    try {
      const response = await fetch(`${endpoint}/api/player-leveling`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leveling, version: catalog.version }) });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error ?? 'publishError'); return; }
      setCatalog(data);
      setLeveling(structuredClone(resolveLeveling(data.playerLeveling)));
      setMessage('published');
    } catch { setMessage('publishError'); } finally { setBusy(false); }
  }
  return <main className="editor">
    <header><h1>{t('levelsEditor')}</h1><div className="editor-nav">{nav}</div></header>
    <p>{t('levelsEditorNote')}</p>
    <label className="battlegrounds-elo">{t('battlegroundsElo')}
      <input type="number" min={0} max={BATTLEGROUNDS_ELO_MAX} value={leveling.battlegroundsElo ?? 32}
        onChange={e => setLeveling(current => ({ ...current, battlegroundsElo: Number(e.target.value) }))} />
    </label>
    <p>{t('battlegroundsEloNote')}</p>
    <div className="toolbar"><button disabled={busy} onClick={() => void load()}>{t('reloadCatalog')}</button></div>
    <table className="levels-table">
      <thead><tr><th>#</th><th>{t('name')} (ru)</th><th>{t('name')} (en)</th><th>{t('levelXpNeed')}</th></tr></thead>
      <tbody>{leveling.levels.map((row, i) => <tr key={i}>
        <td>{i + 1}</td>
        <td><input aria-label={`${ru ? 'Уровень' : 'Level'} ${i + 1} ru`} value={row.ru} maxLength={40} onChange={e => patch(i, 'ru', e.target.value)} /></td>
        <td><input aria-label={`${ru ? 'Уровень' : 'Level'} ${i + 1} en`} value={row.en} maxLength={40} onChange={e => patch(i, 'en', e.target.value)} /></td>
        <td><input aria-label={`${ru ? 'Уровень' : 'Level'} ${i + 1} xp`} type="number" min={1} max={10000} value={row.xp} onChange={e => patch(i, 'xp', e.target.value)} /></td>
      </tr>)}</tbody>
    </table>
    <section className="publish">
      <button disabled={busy || !catalog.version || !validatePlayerLeveling(leveling)} onClick={() => void publish()}>{t('publish')}</button>
      <p role="status">{message && t(message)}</p>
    </section>
  </main>;
}
