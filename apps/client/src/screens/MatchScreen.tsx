import { useEffect, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { HeroPortrait } from '../ui/HeroPortrait';
import { Board } from '../Board';
import { playerSession } from '../playerSession';
import { session } from '../session';
import { GameCursor } from '../ui/GameCursor';
import { InkButton, spring } from '../ui/InkButton';

export function MatchScreen({ onLeave }: { onLeave: () => void }) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const player = useSyncExternalStore(playerSession.subscribe, playerSession.getSnapshot);
  const [banner, setBanner] = useState('');
  useEffect(() => { if (state.status !== 'active') return; setBanner(t(state.activePlayer === state.sessionId ? 'yours' : 'theirs')); const timer = setTimeout(() => setBanner(''), 1800); return () => clearTimeout(timer); }, [state.turn, state.activePlayer, state.status, t]);
  useEffect(() => {
    if (state.status !== 'finished') return;
    playerSession.finishMatch(!state.winner ? 'draw' : state.winner === state.sessionId ? 'win' : 'loss');
  }, [state.status, state.winner, state.sessionId]);
  const yours = state.activePlayer === state.sessionId;
  const me = state.players.find(p => p.id === state.sessionId);
  const hero = state.heroes.find(h => h.id === me?.heroId);
  const reward = player.lastReward;
  const eloDelta = reward ? reward.elo - reward.previousElo : 0;
  return (
    <div className="battle-screen absolute inset-0">
      <GameCursor />
      <header className="battle-header flex h-[78px] items-center gap-6 px-8">
        <span className={`connection ${state.status} font-hand text-[22px]`} role="status">{t(state.status)}</span>
        <span className="font-hand text-[28px]">{t('turn', { turn: state.turn })}</span>
        {state.status === 'active' && <span className="font-hand text-[22px] text-blood">{t(yours ? 'yours' : 'theirs')}</span>}
        <div className="ml-auto flex gap-3">
          <InkButton size="sm" aria-label={t('settings')} onClick={() => window.dispatchEvent(new Event('open-settings'))}>⚙</InkButton>
          <InkButton size="sm" onClick={() => { session.leave(); onLeave(); }}>{t('leave')}</InkButton>
        </div>
      </header>

      <div className="absolute top-[78px] right-0 bottom-0 left-0">
        <Board />
      </div>

      {state.status === 'active' && (
        <div className="battle-rail">
          <button className="end-turn-button" disabled={!yours} onClick={session.advance}>{t('advance')}</button>
          {hero && me && <button className="hero-power-button" disabled={!yours || me.powerUsed || me.mana < hero.ability.cost || hero.ability.effectId === 'heal' && me.health >= me.maxHealth || hero.ability.effectId === 'summon' && state.minions.filter(m => m.owner === me.id).length >= 7} onClick={() => hero.ability.effectId === 'damage' ? window.dispatchEvent(new Event('hero-power-target')) : session.power()}><b>{hero.ability.name}</b><span>{me.powerUsed ? 'Использовано' : `◆ ${hero.ability.cost}`}</span></button>}
        </div>
      )}
      {state.status === 'selecting' && <div className="hero-selection" role="dialog" aria-label="Выбор героя"><h1>{me?.heroId ? 'Ждём выбор соперника' : 'Выберите героя'}</h1><p>Один герой на весь матч. Способность доступна раз за ход.</p><div className="hero-offers">{state.heroOffers.map(h => <button key={h.id} disabled={!!me?.heroId} aria-label={`Выбрать героя ${h.name}`} aria-pressed={me?.heroId === h.id} onClick={() => session.chooseHero(h.id)}><HeroPortrait hero={h} cards={state.cards} /></button>)}</div></div>}
      {state.error && <p className="battle-error" role="alert">{t(state.error)}</p>}
      <AnimatePresence>{banner && <motion.div key={`${state.turn}-${state.activePlayer}`} className="turn-banner" initial={reduced ? false : { opacity: 0, scale: .85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} role="status">{banner}</motion.div>}</AnimatePresence>
      <AnimatePresence>
        {state.status === 'finished' && (
          <motion.div className="absolute inset-0 z-50 grid place-items-center bg-black/75"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="ink-edge border-[4px] border-blood bg-paper px-16 py-12 text-center"
              initial={{ scale: 0.5, rotate: -8 }} animate={{ scale: 1, rotate: -1 }} transition={spring}>
              <p className="result font-hand text-[64px] text-blood">
                {t(!state.winner ? 'draw' : state.winner === state.sessionId ? 'win' : 'loss')}
              </p>
              {reward && (
                <p className="mt-3 font-hand text-[28px] text-ink">
                  {t('elo')} {reward.previousElo} → {reward.elo}
                  <span className="ml-3">{eloDelta > 0 ? `+${eloDelta}` : eloDelta}</span>
                  {reward.gained > 0 && <span className="ml-3">+{reward.gained} $</span>}
                </p>
              )}
              <div className="mt-6 flex justify-center">
                <InkButton tone="ink" onClick={() => { session.leave(); onLeave(); }}>{t('backToMenu')}</InkButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
