import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AB_ANOMALIES, AB_ROOM_NAME_MAX, AB_ROOM_TIMERS, AUTO_BATTLER, DEFAULT_ROOM_SETTINGS, pickLoc, type RoomListing, type RoomSettings } from '@kartishki/shared';
import { autoBattlerSession } from '../autoBattlerSession';
import { AnomalyChip } from '../battlegrounds/AnomalyGlyph';
import { Backdrop } from '../ui/Backdrop';
import { InkButton } from '../ui/InkButton';
import { TopBar } from '../ui/TopBar';
import { apiBase, useCardSets } from '../ui/useCatalog';
import './serverBrowser.css';

type Filters = { search: string; freeOnly: boolean; showPlaying: boolean; bots: 'any' | 'with' | 'none'; players: number; anomaly: string; set: string; timer: number };
const FILTERS: Filters = { search: '', freeOnly: true, showPlaying: false, bots: 'any', players: 0, anomaly: '', set: '', timer: 0 };

/** Pure so it can be unit-tested: the rows a filter set leaves visible. */
export function filterRooms(rooms: RoomListing[], f: Filters): RoomListing[] {
  const q = f.search.trim().toLowerCase();
  return rooms.filter(r =>
    (!q || r.name.toLowerCase().includes(q) || r.host.toLowerCase().includes(q))
    && (!f.freeOnly || r.joinable)
    && (f.showPlaying || r.status === 'waiting')
    && (f.bots === 'any' || (f.bots === 'with') === r.bots > 0)
    && (!f.players || r.maxPlayers === f.players)
    && (!f.anomaly || r.anomalySetting === f.anomaly || (f.anomaly === 'random' && r.anomalySetting === 'random'))
    && (!f.set || r.setId === (f.set === 'starter' ? '' : f.set))
    && (!f.timer || r.timer === f.timer));
}

/** Room settings form: used by the create modal here and by the host inside the lobby (see BattlegroundsScreen). */
export function RoomSettingsForm({ value, onChange, disabled = false, humans = 1 }: { value: RoomSettings; onChange: (patch: Partial<RoomSettings>) => void; disabled?: boolean; humans?: number }) {
  const { t, i18n } = useTranslation();
  const sets = useCardSets();
  const [advanced, setAdvanced] = useState(value.anomaly !== 'random' || value.timer !== DEFAULT_ROOM_SETTINGS.timer);
  const maxBots = Math.max(0, value.maxPlayers - Math.max(1, humans));
  return (
    <div className="room-form" data-testid="room-form">
      <label><span>{t('roomName')}</span>
        <input value={value.name} maxLength={AB_ROOM_NAME_MAX} placeholder={t('roomNamePlaceholder')} disabled={disabled} data-testid="room-name" onChange={e => onChange({ name: e.target.value })} /></label>
      <label><span>{t('roomMaxPlayers')}</span>
        <select value={value.maxPlayers} disabled={disabled} data-testid="room-max" onChange={e => { const maxPlayers = Number(e.target.value); onChange({ maxPlayers, bots: Math.min(value.bots, maxPlayers - Math.max(1, humans)) }); }}>
          {Array.from({ length: AUTO_BATTLER.MAX_PLAYERS - AUTO_BATTLER.MIN_PLAYERS + 1 }, (_, i) => AUTO_BATTLER.MIN_PLAYERS + i).map(n => <option key={n} value={n}>{n}</option>)}
        </select></label>
      <label><span>{t('roomBots')}</span>
        <select value={Math.min(value.bots, maxBots)} disabled={disabled} data-testid="room-bots" onChange={e => onChange({ bots: Number(e.target.value) })}>
          {Array.from({ length: maxBots + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <small>{t('roomHumansNote', { n: value.maxPlayers - Math.min(value.bots, maxBots) })}</small></label>
      <label><span>{t('roomSet')}</span>
        <select value={value.setId} disabled={disabled} data-testid="room-set" onChange={e => onChange({ setId: e.target.value })}>
          <option value="">{t('abCardSetStarter')}</option>
          {sets.map(set => <option key={set.id} value={set.id}>{pickLoc(set.name, i18n.language)}{set.author ? ` · ${set.author}` : ''}</option>)}
        </select></label>
      <button type="button" className="room-form-toggle" aria-expanded={advanced} onClick={() => setAdvanced(a => !a)}>{advanced ? '▾' : '▸'} {t('roomAdvanced')}</button>
      {advanced && <>
        <label><span>{t('roomAnomaly')}</span>
          <select value={value.anomaly} disabled={disabled} data-testid="room-anomaly" onChange={e => onChange({ anomaly: e.target.value })}>
            <option value="random">{t('roomAnomalyRandom')}</option>
            <option value="none">{t('roomAnomalyNone')}</option>
            {AB_ANOMALIES.map(id => <option key={id} value={id}>{t(`abAnomaly_${id}`)}</option>)}
          </select>
          <AnomalyChip id={value.anomaly} name={value.anomaly === 'random' ? t('roomAnomalyRandom') : value.anomaly === 'none' ? t('roomAnomalyNone') : t(`abAnomaly_${value.anomaly}`)} /></label>
        <label><span>{t('roomTimer')}</span>
          <select value={value.timer} disabled={disabled} data-testid="room-timer" onChange={e => onChange({ timer: Number(e.target.value) })}>
            {AB_ROOM_TIMERS.map(s => <option key={s} value={s}>{s} {t('secondsShort')}</option>)}
          </select></label>
      </>}
    </div>
  );
}

export function ServerBrowserScreen({ onBack, onJoined }: { onBack: () => void; onJoined: () => void }) {
  const { t, i18n } = useTranslation();
  const sets = useCardSets();
  const [rooms, setRooms] = useState<RoomListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<Filters>(FILTERS);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<RoomSettings>({ ...DEFAULT_ROOM_SETTINGS });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch(`${apiBase}/api/rooms`).then(r => r.ok ? r.json() : []);
      if (Array.isArray(data)) setRooms(data);
    } catch { /* stale list stays */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); const id = setInterval(() => void refresh(), 5000); return () => clearInterval(id); }, [refresh]);

  const visible = useMemo(() => filterRooms(rooms, filters), [rooms, filters]);
  const setName = (id: string) => id ? pickLoc(sets.find(s => s.id === id)?.name ?? { ru: id, en: id }, i18n.language) : t('abCardSetStarter');
  const anomalyName = (r: RoomListing) => r.anomalySetting === 'random' ? t('roomAnomalyRandom') : !r.anomaly ? t('roomAnomalyNone') : t(`abAnomaly_${r.anomaly}`, { defaultValue: r.anomaly });

  async function sit(target: Parameters<typeof autoBattlerSession.connect>[0]) {
    setBusy(true); setError('');
    autoBattlerSession.leave();
    await autoBattlerSession.connect(target);
    const snap = autoBattlerSession.getSnapshot();
    if (snap.status === 'online') { onJoined(); return; }
    setBusy(false);
    setError(t('browserJoinFailed'));
    void refresh();
  }

  return <div className="absolute inset-0 overflow-clip browser-screen" data-testid="server-browser">
    <Backdrop />
    <div className="menu-wash" />
    <TopBar />
    <header className="browser-head">
      <div>
        <h1>{t('browserTitle')} <em className="mode-stamp is-custom" data-testid="browser-mode">{t('abUnranked')}</em></h1>
        <p>{t('browserSubtitle')} · {t('abCustomRewards')}</p>
      </div>
      <div className="browser-actions">
        <InkButton size="sm" onClick={() => void refresh()} disabled={loading} data-testid="browser-refresh">↻ {t('browserRefresh')}</InkButton>
        <InkButton size="sm" tone="blood" onClick={() => setCreating(true)} data-testid="browser-create">+ {t('browserCreate')}</InkButton>
        <InkButton size="sm" tone="ink" onClick={onBack} data-testid="browser-back">↩ {t('browserBack')}</InkButton>
      </div>
    </header>
    <section className="browser-filters" aria-label={t('browserTitle')}>
      <input placeholder={t('browserSearch')} value={filters.search} data-testid="browser-search" onChange={e => setFilters({ ...filters, search: e.target.value })} />
      <label><input type="checkbox" checked={filters.freeOnly} data-testid="browser-free" onChange={e => setFilters({ ...filters, freeOnly: e.target.checked })} />{t('browserFreeOnly')}</label>
      <label><input type="checkbox" checked={filters.showPlaying} onChange={e => setFilters({ ...filters, showPlaying: e.target.checked })} />{t('browserShowPlaying')}</label>
      <select value={filters.bots} data-testid="browser-bots" onChange={e => setFilters({ ...filters, bots: e.target.value as Filters['bots'] })}>
        <option value="any">{t('browserBotsAny')}</option><option value="with">{t('browserBotsWith')}</option><option value="none">{t('browserBotsNone')}</option>
      </select>
      <select value={filters.players} onChange={e => setFilters({ ...filters, players: Number(e.target.value) })}>
        <option value={0}>{t('browserPlayersAny')}</option>
        {Array.from({ length: 7 }, (_, i) => i + 2).map(n => <option key={n} value={n}>{t('browserPlayers')}: {n}</option>)}
      </select>
      <select value={filters.anomaly} onChange={e => setFilters({ ...filters, anomaly: e.target.value })}>
        <option value="">{t('browserAnomalyAny')}</option><option value="random">{t('roomAnomalyRandom')}</option><option value="none">{t('roomAnomalyNone')}</option>
        {AB_ANOMALIES.map(id => <option key={id} value={id}>{t(`abAnomaly_${id}`)}</option>)}
      </select>
      <select value={filters.set} onChange={e => setFilters({ ...filters, set: e.target.value })}>
        <option value="">{t('browserSetAny')}</option><option value="starter">{t('abCardSetStarter')}</option>
        {sets.map(set => <option key={set.id} value={set.id}>{pickLoc(set.name, i18n.language)}</option>)}
      </select>
      <select value={filters.timer} onChange={e => setFilters({ ...filters, timer: Number(e.target.value) })}>
        <option value={0}>{t('browserTimerAny')}</option>
        {AB_ROOM_TIMERS.map(s => <option key={s} value={s}>{s} {t('secondsShort')}</option>)}
      </select>
    </section>
    <section className="browser-list" aria-busy={loading}>
      <table data-testid="browser-table">
        <thead><tr><th>{t('browserRoom')}</th><th>{t('abHost')}</th><th className="num">{t('browserPlayers')}</th><th className="num">{t('browserBots')}</th><th>{t('browserSet')}</th><th>{t('browserAnomaly')}</th><th className="num">{t('browserTimer')}</th><th>{t('browserStatus')}</th><th /></tr></thead>
        <tbody>
          {visible.map(r => <tr key={r.roomId} className={r.status === 'playing' ? 'is-playing' : r.joinable ? '' : 'is-full'} data-testid="browser-row">
            <td className="name">{r.name || '—'}</td>
            <td>{r.host || '—'}</td>
            <td className="num">{r.players}/{r.maxPlayers - r.bots}</td>
            <td className="num">{r.bots}</td>
            <td>{setName(r.setId)}</td>
            <td><AnomalyChip id={r.anomalySetting === 'random' ? 'random' : r.anomaly} name={anomalyName(r)} /></td>
            <td className="num">{r.timer} {t('secondsShort')}</td>
            <td><span className={`browser-status is-${r.status}`}>{r.status === 'playing' ? t('browserPlaying') : r.joinable ? t('browserWaiting') : t('browserFull')}</span></td>
            <td><InkButton size="sm" tone="blood" disabled={!r.joinable || busy} onClick={() => void sit({ kind: 'join', roomId: r.roomId })} data-testid="browser-join">{t('browserJoin')}</InkButton></td>
          </tr>)}
        </tbody>
      </table>
      {!visible.length && <p className="browser-empty" data-testid="browser-empty">{rooms.length ? t('browserNoMatch') : t('browserEmpty')}</p>}
      {error && <p role="alert" className="browser-error">{error}</p>}
    </section>
    {creating && <div className="ab-modal browser-modal" data-testid="room-create">
      <div className="ab-modal-card">
        <h2>{t('roomCreateTitle')} <em className="mode-stamp is-custom">{t('abUnranked')}</em></h2>
        <RoomSettingsForm value={draft} onChange={patch => setDraft({ ...draft, ...patch })} />
        <p className="browser-note">{t('abCustomRewards')}</p>
        <div className="browser-modal-actions">
          <InkButton tone="blood" disabled={busy} onClick={() => void sit({ kind: 'create', settings: draft })} data-testid="room-create-submit">{t('roomCreate')}</InkButton>
          <InkButton onClick={() => setCreating(false)}>{t('cancel')}</InkButton>
        </div>
        {error && <p role="alert" className="browser-error">{error}</p>}
      </div>
    </div>}
  </div>;
}
