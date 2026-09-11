import { useEffect, useState, useSyncExternalStore } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { DAILY_REWARD } from '@kartishki/shared';
import { playerSession } from '../playerSession';
import { Backdrop } from '../ui/Backdrop';
import { BeerBottle } from '../ui/BeerBottle';
import { InkButton, spring } from '../ui/InkButton';
import { TopBar } from '../ui/TopBar';

type Props = { onPlay: () => void; onDeck: () => void; onShop: () => void; onSettings: () => void; onExit: () => void };
function untilMidnight() {
  // The account API uses PostgreSQL CURRENT_DATE (UTC), so the countdown uses UTC too.
  const now = new Date();
  const ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
  return [Math.floor(ms / 3600000), Math.floor(ms / 60000) % 60, Math.floor(ms / 1000) % 60].map(n => String(n).padStart(2, '0')).join(':');
}
export function MainMenuScreen({ onPlay, onDeck, onShop, onSettings, onExit }: Props) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const player = useSyncExternalStore(playerSession.subscribe, playerSession.getSnapshot);
  const profile = player.library?.profile;
  const rank = player.beerRank;
  const dark = rank.league === 'dark';
  const dailyReady = !!profile?.dailyAvailable;
  const [timer, setTimer] = useState(untilMidnight);
  useEffect(() => {
    if (dailyReady || !profile) return;
    const id = setInterval(() => setTimer(untilMidnight()), 1000);
    return () => clearInterval(id);
  }, [dailyReady, profile?.id]);
  const items = [
    { key: 'menuPlay', tone: 'blood' as const, run: onPlay, mark: '⚔', play: true },
    { key: 'menuDeck', tone: 'paper' as const, run: onDeck, mark: '▤' },
    { key: 'menuShop', tone: 'gold' as const, run: onShop, mark: '$' },
    { key: 'menuSettings', tone: 'paper' as const, run: onSettings, mark: '⚙' },
    { key: 'menuExit', tone: 'ink' as const, run: onExit, mark: '↩' },
  ];
  return <div className="absolute inset-0 overflow-clip">
    <Backdrop />
    <div className="menu-wash" />
    <TopBar onPlus={onShop} />
    <section className="main-menu-actions" aria-label="Главное меню">
      <p className="menu-kicker">КАРТИШКИ / ПОДВАЛЬНЫЙ КЛУБ</p>
      <div className="menu-buttons">{items.map((item, index) => <motion.div key={item.key}
        initial={reduced ? false : { opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: index * .04 }}>
        <InkButton tone={item.tone} size={item.play ? 'xl' : 'lg'} pulse={item.play && !reduced} glow={item.play} onClick={item.run} className={`menu-action ${item.play ? 'menu-play' : ''}`}>
          <span className="menu-action-icon" aria-hidden>{item.mark}</span><span>{t(item.key)}</span><span className="menu-action-arrow" aria-hidden>↗</span>
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
      <div className="bottle-heading"><span>ТВОЙ РАНГ</span><h1>ОПУСТОШИ БАКЛАЖКУ</h1><p>Меньше пива — выше в лиге.</p></div>
      <div className="bottle-halo" aria-hidden />
      <BeerBottle remainingMl={rank.remainingMl} league={rank.league} />
      <div className="bottle-rank-copy">
        <span className="beer-league-badge" data-testid="beer-league">{dark ? 'II / ЛИГА «ТЁМНОЕ»' : 'I / ЛИГА «СВЕТЛОЕ»'}</span>
        <div role="status" className="beer-volume" aria-live="polite">
          <p>Осталось осушить:</p><strong data-testid="beer-volume">{rank.remainingMl.toLocaleString('ru-RU')}<small>мл</small></strong><span>/ 2000 мл</span>
        </div>
        <p className="beer-rank-status">{rank.remainingMl === 0 ? 'Баклажка осушена. Вершина элитной лиги!' : rank.remainingMl === 2000 ? 'Полная до краёв. Дно лиги.' : rank.remainingMl === 1500 ? 'Калибровочная отметка' : 'Каждый глоток — ближе к вершине.'}</p>
        <div className="beer-rules"><p><b>↘ ПОБЕДА</b><span>Отпиваешь. Ранг растёт.</span></p><p><b>↗ ПОРАЖЕНИЕ</b><span>Штрафной долив. До 2000 мл.</span></p></div>
        <div className="beer-next"><span>{dark ? 'СВЕТЛОЕ ОСУШЕНО ✓' : 'СЛЕДУЮЩАЯ ЛИГА'}</span><b>{dark ? 'Тёмное — элитная лига' : 'ТЁМНОЕ / при 0 мл'}</b><small>{dark ? 'Новая баклажка: старт с 1500 мл' : 'Новая баклажка тёмного: 1500 мл'}</small></div>
        <p className="beer-elo">{profile ? `ELO ${profile.elo} · 1 пункт = 10 мл` : 'Гостевая калибровка · 1500 мл'}</p>
      </div>
      <p className="bottle-footnote">2000 мл — дно <span>← ОПУСТОШАЙ →</span> 0 мл — вершина</p>
    </section>
  </div>;
}
