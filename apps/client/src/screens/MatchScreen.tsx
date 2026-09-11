import { useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Board } from '../Board';
import { session } from '../session';
import { InkButton, spring } from '../ui/InkButton';

export function MatchScreen({ onLeave }: { onLeave: () => void }) {
  const { t } = useTranslation();
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const yours = state.activePlayer === state.sessionId;
  return (
    <div className="absolute inset-0 bg-paper">
      <header className="flex h-[78px] items-center gap-5 border-b-[4px] border-ink px-8">
        <span className={`connection ${state.status} font-mono text-[12px]`} role="status">{t(state.status)}</span>
        <span className="font-hand text-[26px]">{t('turn', { turn: state.turn })} · {t(state.phase)}</span>
        {state.status === 'active' && <span className="font-mono text-[12px] text-blood">{t(yours ? 'yours' : 'theirs')}</span>}
        <div className="ml-auto flex gap-3">
          <InkButton size="sm" tone="blood" disabled={state.status !== 'active' || !yours} onClick={session.advance}>{t('advance')}</InkButton>
          <InkButton size="sm" onClick={() => { session.leave(); onLeave(); }}>{t('leave')}</InkButton>
        </div>
      </header>

      <div className="absolute top-[78px] right-0 bottom-0 left-0">
        <Board />
      </div>

      <AnimatePresence>
        {state.status === 'finished' && (
          <motion.div className="absolute inset-0 z-50 grid place-items-center bg-black/75"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="ink-edge border-[4px] border-blood bg-paper px-16 py-12 text-center"
              initial={{ scale: 0.5, rotate: -8 }} animate={{ scale: 1, rotate: -1 }} transition={spring}>
              <p className="result font-hand text-[64px] text-blood">
                {t(!state.winner ? 'draw' : state.winner === state.sessionId ? 'win' : 'loss')}
              </p>
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
