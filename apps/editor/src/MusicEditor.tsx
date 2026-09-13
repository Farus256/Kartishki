import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MENU_MUSIC_MAX, emptyMenuMusic, resolveMenuMusic, validateMenuMusic, type Catalog, type MenuMusic } from '@kartishki/shared';
import { uploadMusic } from './uploadMusic';

const endpoint = import.meta.env.VITE_SERVER_URL ?? 'http://127.0.0.1:2567';

export function MusicEditor({ nav }: { nav: ReactNode }) {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<Catalog>({ version: 0, cards: [] });
  const [music, setMusic] = useState<MenuMusic>(emptyMenuMusic);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try {
      const result = await fetch(`${endpoint}/api/catalog`);
      if (!result.ok) throw new Error();
      const data: Catalog = await result.json();
      setCatalog(data);
      setMusic(structuredClone(resolveMenuMusic(data.menuMusic)));
      setMessage('catalogLoaded');
    } catch { setMessage('connectionError'); } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function add(file?: File) {
    if (!file || music.tracks.length >= MENU_MUSIC_MAX) return;
    setBusy(true);
    try {
      const url = await uploadMusic(file, endpoint);
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 80) || t('menuMusic');
      setMusic(current => ({ tracks: [...current.tracks, { id: `track-${Date.now()}`, name, url }] }));
      setMessage('');
    } catch { setMessage('invalidAudio'); } finally { setBusy(false); }
  }
  function move(index: number, by: number) {
    const next = index + by;
    if (next < 0 || next >= music.tracks.length) return;
    setMusic(current => {
      const tracks = [...current.tracks];
      [tracks[index], tracks[next]] = [tracks[next]!, tracks[index]!];
      return { tracks };
    });
  }
  async function publish() {
    if (!validateMenuMusic(music)) { setMessage('invalidAudio'); return; }
    setBusy(true);
    try {
      const response = await fetch(`${endpoint}/api/menu-music`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ menuMusic: music, version: catalog.version }) });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error ?? 'publishError'); return; }
      setCatalog(data);
      setMusic(structuredClone(resolveMenuMusic(data.menuMusic)));
      setMessage('published');
    } catch { setMessage('publishError'); } finally { setBusy(false); }
  }
  return <main className="editor">
    <header><h1>{t('menuMusic')}</h1><div className="editor-nav">{nav}</div></header>
    <p>{t('menuMusicNote')}</p>
    <div className="toolbar">
      <button disabled={busy} onClick={() => void load()}>{t('reloadCatalog')}</button>
      <label>{t('addTrack')}<input type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/webm" disabled={busy || music.tracks.length >= MENU_MUSIC_MAX} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void add(file); }} /></label>
    </div>
    <ol className="music-tracks">
      {music.tracks.map((track, index) => <li key={track.id}>
        <strong>{index + 1}. {track.name}</strong>
        <audio controls src={`${endpoint}${track.url}`} />
        <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>{t('moveUp')}</button>
        <button type="button" disabled={index === music.tracks.length - 1} onClick={() => move(index, 1)}>{t('moveDown')}</button>
        <button type="button" onClick={() => setMusic(current => ({ tracks: current.tracks.filter(item => item.id !== track.id) }))}>{t('remove')}</button>
      </li>)}
    </ol>
    <section className="publish">
      <button disabled={busy || !catalog.version || !validateMenuMusic(music)} onClick={() => void publish()}>{t('publish')}</button>
      <p role="status">{message && t(message)}</p>
    </section>
  </main>;
}
