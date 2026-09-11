import { useState, useSyncExternalStore } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { playerSession } from '../playerSession';
import { Backdrop } from '../ui/Backdrop';
import { GameCard } from '../ui/GameCard';
import { InkButton, spring } from '../ui/InkButton';
import { useCatalog } from '../ui/useCatalog';
import { showcaseCards } from '../ui/showcase';

export function LandingScreen({ onGuest }: { onGuest: () => void }) {
  const { t } = useTranslation();
  const player = useSyncExternalStore(playerSession.subscribe, playerSession.getSnapshot);
  const catalog = useCatalog();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const promo = showcaseCards(catalog, ['common', 'legendary', 'ultimate']);

  return (
    <div className="absolute inset-0 text-paper">
      <Backdrop tone="noir" />

      <motion.div className="absolute top-[96px] left-[96px] w-[620px]"
        initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: 0.05 }}>
        <span className="font-mono text-[12px] tracking-[6px] text-paper/60">{t('caseFile')}</span>
        <h1 className="mt-1 font-hand text-[104px] leading-none tracking-[4px] text-paper">
          {t('title')}<span className="ml-4 inline-block rotate-12 text-blood">✳</span>
        </h1>
        <p className="mt-2 font-hand text-[28px] text-paper/70">{t('subtitle')}</p>

        <div className="ink-edge mt-8 w-[560px] border-[3px] border-paper/40 bg-black/45 p-6 backdrop-blur-[2px]">
          <div className="flex gap-4">
            <label className="flex-1 font-mono text-[12px] text-paper/70">
              {t('username')}
              <input value={username} maxLength={24} autoComplete="username" onChange={e => setUsername(e.target.value)}
                className="mt-2 w-full border-[2px] border-paper/60 bg-paper/10 px-3 py-2 font-mono text-[14px] text-paper outline-none focus:border-blood" />
            </label>
            <label className="flex-1 font-mono text-[12px] text-paper/70">
              {t('password')}
              <input type="password" value={password} maxLength={128} autoComplete="current-password" onChange={e => setPassword(e.target.value)}
                className="mt-2 w-full border-[2px] border-paper/60 bg-paper/10 px-3 py-2 font-mono text-[14px] text-paper outline-none focus:border-blood" />
            </label>
          </div>
          <div className="mt-5 flex items-center gap-4">
            <InkButton tone="paper" disabled={player.loading} onClick={() => void playerSession.authenticate('login', username, password)}>{t('login')}</InkButton>
            <InkButton tone="blood" disabled={player.loading} onClick={() => void playerSession.authenticate('register', username, password)}>{t('register')}</InkButton>
            <InkButton tone="ink" onClick={onGuest} className="ml-auto border-paper/60">{t('playAsGuest')}</InkButton>
          </div>
          {player.error && <p role="alert" className="mt-4 font-mono text-[12px] text-blood">{t(player.error)}</p>}
          <p className="mt-3 font-mono text-[11px] text-paper/50">{t('guestHint')}</p>
        </div>
      </motion.div>

      <div className="absolute top-[150px] right-[110px] flex items-start gap-[26px]">
        {promo.map((card, index) => (
          <motion.div key={card.id}
            initial={{ opacity: 0, y: 60, rotate: 0 }}
            animate={{ opacity: 1, y: [0, -14, 0], rotate: (index - 1) * 6 }}
            transition={{ opacity: { duration: 0.5, delay: 0.15 * index }, rotate: spring, y: { duration: 4 + index, repeat: Infinity, ease: 'easeInOut', delay: index * 0.4 } }}
          >
            <GameCard card={card} scale={1} />
          </motion.div>
        ))}
      </div>

      <p className="absolute bottom-[42px] left-1/2 -translate-x-1/2 font-mono text-[11px] tracking-[3px] text-paper/45">{t('landingNote')}</p>
    </div>
  );
}
