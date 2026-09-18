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
import { PlayerName } from '../cosmetics/PlayerName';
import { apiBase, menuTrackUrl, useCardSets, usePlayerLeveling } from '../ui/useCatalog';
import { chosenCardSet, rememberCardSet, useActiveCardSet } from '../activeCardSet';
import { pickLoc } from '@kartishki/shared';
import { useServerReady } from '../ui/useServerReady';
import { GAME_VERSION } from '../version';

type Props = { onPlay: () => void; onBattlegrounds: () => void; onBrowser: () => void; onDeck: () => void; onShop: () => void; onEditor: () => void; onCustomize: () => void; onExit: () => void };
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
export function MainMenuScreen({ onPlay, onBattlegrounds, onBrowser, onDeck, onShop, onEditor, onCustomize, onExit }: Props) {
  const { t, i18n } = useTranslation();
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
  const cardSets = useCardSets();
  const activeSet = useActiveCardSet();
  const wallpaper = activeSet?.theme?.wallpaper?.map(menuTrackUrl);
  const dailyReady = !!profile?.dailyAvailable;
  const [timer, setTimer] = useState(untilMidnight);
  useEffect(() => {
    if (dailyReady || !profile) return;
    const id = setInterval(() => setTimer(untilMidnight()), 1000);
    return () => clearInterval(id);
  }, [dailyReady, profile?.id]);
  // Battlefield is the headline (ranked), the server browser sits right under it (custom, unranked); classic 1v1 keeps a
  // plain entry further down so it never competes with the two.
  const items = [
    { key: 'menuBattlegrounds', tone: 'blood' as const, run: onBattlegrounds, mark: '🍺', play: true },
    { key: 'menuBrowser', tone: 'blood' as const, run: onBrowser, mark: '☰' },
    { key: 'menuPlay', tone: 'paper' as const, run: onPlay, mark: '⚔', beta: true },
    { key: 'menuDeck', tone: 'paper' as const, run: onDeck, mark: '▤' },
    { key: 'menuShop', tone: 'gold' as const, run: onShop, mark: '$' },
    // Admin-only: the badge stays on for everyone; non-admins cannot open the editor.
    { key: 'menuEditor', tone: 'paper' as const, run: profile?.isAdmin ? onEditor : () => {}, mark: '✎' },
    // Sound and language live behind the ⚙ in the top bar; the big button is the wardrobe.
    { key: 'menuCustomize', tone: 'paper' as const, run: onCustomize, mark: '✦' },
    { key: 'menuExit', tone: 'ink' as const, run: onExit, mark: '↩' },
  ];
  return <div className="absolute inset-0 overflow-clip">
    <div className="absolute inset-0" inert={!serverReady} aria-busy={!serverReady}>
    <Backdrop />
    <MenuFotoWallpaper fotos={wallpaper} />
    <div className="menu-wash" />
    <TopBar onPlus={onShop} />
    <section className="main-menu-actions" aria-label={t('mainMenuAria')}>
      <div className="menu-buttons">{items.map((item, index) => <motion.div key={item.key}
        initial={reduced ? false : { opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: index * .04 }}>
        <InkButton tone={item.tone} size={item.play ? 'xl' : 'lg'} pulse={item.play && !reduced} glow={item.play} onClick={item.run} className={`menu-action ${item.play ? 'menu-play' : ''}`} data-testid={`menu-${item.key}`}>
          <span className="menu-action-icon" aria-hidden>{item.mark}</span><span>{t(item.key)}</span><span className="menu-action-arrow" aria-hidden>↗</span>
          {item.play && <em className="menu-beta" aria-hidden>{t('abRanked')}</em>}
          {item.beta && <em className="menu-beta menu-soon" aria-hidden>{t('menuBeta')}</em>}
          {item.key === 'menuBrowser' && <em className="menu-beta menu-unranked" aria-hidden>{t('abUnranked')}</em>}
          {(item.key === 'menuEditor' || item.key === 'menuDeck') && <em className="menu-beta menu-soon" data-testid={item.key === 'menuEditor' ? 'menu-notice' : 'menu-deck-notice'}>{t('menuSoon')}</em>}
        </InkButton>
      </motion.div>)}</div>
      {cardSets.length > 0 && <label className="menu-set" data-testid="menu-set">
        <span>{t('abCardSet')}</span>
        <select value={cardSets.some(set => set.id === chosenCardSet()) ? chosenCardSet() : ''} onChange={event => rememberCardSet(event.target.value)}>
          <option value="">{t('abCardSetStarter')}</option>
          {cardSets.map(set => <option key={set.id} value={set.id}>{pickLoc(set.name, i18n.language)}{set.author ? ` · ${set.author}` : ''}</option>)}
        </select>
      </label>}
      <div className="menu-daily" data-testid="daily-reward">
        <span className="daily-stamp" aria-hidden>+{DAILY_REWARD}<small>{t('usdPerDay')}</small></span>
        <div className="daily-action">
          <InkButton tone="gold" disabled={!dailyReady || player.loading} onClick={() => void playerSession.claimDaily()} className="daily-button">
            {t('dailyLabel')}
          </InkButton>
          <p>{!profile ? t('dailyLogin') : dailyReady ? t('dailyAccount', { amount: DAILY_REWARD }) : `${t('dailyNextLabel')}: ${timer}`}</p>
        </div>
      </div>
      {player.error && <p role="alert" className="menu-error">{t(player.error)}</p>}
    </section>
    <section className={`menu-bottle-panel ${dark ? 'is-dark' : ''}`} aria-label={t('playerRank')}>
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
              <td className="nick">{row && <PlayerName fx={row.username === profile?.username ? profile.settings.nameFx : row.nameFx} name={row.username} />}</td>
              <td className="lvl">{row ? levelFromXp(row.xp, leveling).level : ''}</td>
              <td className="ml">{row ? row.elo.toLocaleString('ru-RU') : ''}</td>
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
