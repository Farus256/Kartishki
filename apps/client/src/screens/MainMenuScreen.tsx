import { useEffect, useState, useSyncExternalStore } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { DAILY_REWARD, levelFromXp, type LadderRow } from '@kartishki/shared';
import { playerSession } from '../playerSession';
import { Backdrop } from '../ui/Backdrop';
import { MenuFotoWallpaper } from '../ui/MenuFotoWallpaper';
import { BeerBottle } from '../ui/BeerBottle';
import { InkButton, spring } from '../ui/InkButton';
import { TopBar } from '../ui/TopBar';
import { apiBase, usePlayerLeveling } from '../ui/useCatalog';
import { useServerReady } from '../ui/useServerReady';
import { GAME_VERSION } from '../version';

type Props = { onPlay: () => void; onBattlegrounds: () => void; onDeck: () => void; onShop: () => void; onSettings: () => void; onExit: () => void };
const TROPHY = { 1: '#c9a227', 2: '#9aa0a6', 3: '#b87333' } as const;
function Trophy({ place }: { place: 1 | 2 | 3 }) {
  return <svg className="menu-ladder-trophy" viewBox="0 0 20 22" aria-hidden>
    <path fill={TROPHY[place]} stroke="#302b22" strokeWidth="1.1"
      d="M5 1.6h10v1.6h2.4v2.6c0 1.5-1.1 2.8-2.6 3.1A4.7 4.7 0 0 1 11 12.6V14h2.2v1.7H6.8V14H9v-1.4A4.7 4.7 0 0 1 5.2 8.9C3.7 8.6 2.6 7.3 2.6 5.8V3.2H5V1.6z" />
    <path fill={TROPHY[place]} stroke="#302b22" strokeWidth="1.1" d="M7.2 16.6h5.6v1.4H7.2zM5.6 18.6h8.8v1.5H5.6z" />
  </svg>;
}
function useLadder(ready: boolean) {
  const [rows, setRows] = useState<LadderRow[]>([]);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    void fetch(`${apiBase}/api/players/ladder`).then(r => r.ok ? r.json() : []).then(data => {
      if (live && Array.isArray(data)) setRows(data);
    }).catch(() => {});
    return () => { live = false; };
  }, [ready]);
  return rows;
}
function untilMidnight() {
  // The account API uses PostgreSQL CURRENT_DATE (UTC), so the countdown uses UTC too.
  const now = new Date();
  const ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
  return [Math.floor(ms / 3600000), Math.floor(ms / 60000) % 60, Math.floor(ms / 1000) % 60].map(n => String(n).padStart(2, '0')).join(':');
}
export function MainMenuScreen({ onPlay, onBattlegrounds, onDeck, onShop, onSettings, onExit }: Props) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const player = useSyncExternalStore(playerSession.subscribe, playerSession.getSnapshot);
  const profile = player.library?.profile;
  const rank = player.beerRank;
  const dark = rank.league === 'dark';
  const serverReady = useServerReady();
  // The module-load /me fails while a sleeping backend wakes; fetch it again once /health answers.
  useEffect(() => {
    if (serverReady && !player.library && !player.loading && playerSession.authOptions().playerToken) void playerSession.refresh();
  }, [serverReady]);
  const ladder = useLadder(serverReady);
  const leveling = usePlayerLeveling();
  const dailyReady = !!profile?.dailyAvailable;
  const [timer, setTimer] = useState(untilMidnight);
  useEffect(() => {
    if (dailyReady || !profile) return;
    const id = setInterval(() => setTimer(untilMidnight()), 1000);
    return () => clearInterval(id);
  }, [dailyReady, profile?.id]);
  const items = [
    { key: 'menuPlay', tone: 'blood' as const, run: onPlay, mark: '⚔', play: true },
    { key: 'menuBattlegrounds', tone: 'blood' as const, run: onBattlegrounds, mark: '🍺' },
    { key: 'menuDeck', tone: 'paper' as const, run: onDeck, mark: '▤' },
    { key: 'menuShop', tone: 'gold' as const, run: onShop, mark: '$' },
    { key: 'menuSettings', tone: 'paper' as const, run: onSettings, mark: '⚙' },
    { key: 'menuExit', tone: 'ink' as const, run: onExit, mark: '↩' },
  ];
  return <div className="absolute inset-0 overflow-clip">
    <div className="absolute inset-0" inert={!serverReady} aria-busy={!serverReady}>
    <Backdrop />
    <MenuFotoWallpaper />
    <div className="menu-wash" />
    <TopBar onPlus={onShop} />
    <section className="main-menu-actions" aria-label="Главное меню">
      <div className="menu-buttons">{items.map((item, index) => <motion.div key={item.key}
        initial={reduced ? false : { opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: index * .04 }}>
        <InkButton tone={item.tone} size={item.play ? 'xl' : 'lg'} pulse={item.play && !reduced} glow={item.play} onClick={item.run} className={`menu-action ${item.play ? 'menu-play' : ''}`}>
          <span className="menu-action-icon" aria-hidden>{item.mark}</span><span>{t(item.key)}</span><span className="menu-action-arrow" aria-hidden>↗</span>
          {item.play && <em className="menu-beta" aria-hidden>{t('menuBeta')}</em>}
        </InkButton>
      </motion.div>)}</div>
      <div className="menu-daily" data-testid="daily-reward">
        <span className="daily-stamp" aria-hidden>+{DAILY_REWARD}<small>USD / ДЕНЬ</small></span>
        <div className="daily-action">
          <InkButton tone="gold" disabled={!dailyReady || player.loading} onClick={() => void playerSession.claimDaily()} className="daily-button">
            {t('dailyLabel')}
          </InkButton>
          <p>{!profile ? 'Войди в аккаунт, чтобы забрать награду' : dailyReady ? `$ ${DAILY_REWARD} — награда аккаунта` : `${t('dailyNextLabel')}: ${timer}`}</p>
        </div>
      </div>
      {player.error && <p role="alert" className="menu-error">{t(player.error)}</p>}
    </section>
    <section className={`menu-bottle-panel ${dark ? 'is-dark' : ''}`} aria-label="Ранг игрока">
      <div className="bottle-stage">
        <div className="bottle-halo" aria-hidden />
        <BeerBottle remainingMl={rank.remainingMl} league={rank.league} />
      </div>
    </section>
    <section className="menu-ladder" data-testid="menu-ladder" aria-label={t('menuLadder')}>
      <h2>{t('menuLadder')}</h2>
      <table>
        <thead>
          <tr>
            <th className="place" scope="col" />
            <th scope="col">{t('ladderNick')}</th>
            <th className="lvl" scope="col">{t('ladderLevel')}</th>
            <th className="ml" scope="col">{t('ladderMl')}</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 10 }, (_, index) => {
            const row = ladder[index];
            const place = index + 1;
            const medal = row && (place === 1 || place === 2 || place === 3) ? place : 0;
            return <tr key={row ? `${row.username}-${place}` : `empty-${place}`} className={!row ? 'is-empty' : medal ? `is-${['', 'gold', 'silver', 'bronze'][medal]}` : undefined}>
              <td className="place">{medal ? <Trophy place={medal} /> : place}</td>
              <td className="nick">{row?.username ?? ''}</td>
              <td className="lvl">{row ? levelFromXp(row.xp, leveling).level : ''}</td>
              <td className="ml">{row ? row.remainingMl.toLocaleString('ru-RU') : ''}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </section>
    <span className="menu-version" data-testid="menu-version">{GAME_VERSION}</span>
    </div>
    {!serverReady && <div className="menu-server-loading" data-testid="menu-server-loading">
      <div role="status" aria-live="polite" className="menu-server-card">
        <span className="menu-server-spinner" aria-hidden />
        <h2>{t('serverConnecting')}</h2>
        <p>{t('serverWaking')}</p>
      </div>
    </div>}
  </div>;
}
