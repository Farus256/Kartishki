import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { MATCH_RULES } from '@kartishki/shared';
import { audioManager } from '../AudioManager';
import { FUSE_SECONDS, FuseRope, SandClock, useDeadline } from '../battlegrounds/PhaseClock';
import { equippedBoard, onBoardChange } from '../cosmeticsLocal';
import { DuelBoard } from '../duel/DuelBoard';
import { DUEL } from '../duel/duelLayout';
import { Mulligan } from '../duel/Mulligan';
import { HeroPortrait } from '../ui/HeroPortrait';
import { playerSession } from '../playerSession';
import { session } from '../session';
import { GameCursor } from '../ui/GameCursor';
import { InkButton } from '../ui/InkButton';
import '../battlegrounds/battlegrounds.css';
import '../battlegrounds/fx-cards.css';
import '../battlegrounds/fx-table.css';
import '../battlegrounds/fx-combat.css';
import '../battlegrounds/fx-polish.css';
import '../duel/duel.css';

/** The 1v1 duel on the Battlegrounds table: same wood, same gems, same fuse — Hearthstone-standard rules underneath. */
export function MatchScreen({ onLeave }: { onLeave: () => void }) {
  const { t } = useTranslation();
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const player = useSyncExternalStore(playerSession.subscribe, playerSession.getSnapshot);
  useSyncExternalStore(onBoardChange, () => equippedBoard().id);
  const screenRef = useRef<HTMLDivElement>(null);
  const [stamp, setStamp] = useState<{ text: string; tone: 'mine' | 'theirs'; serial: number } | null>(null);
  const [hint, setHint] = useState('');
  // The result waits for the last blow to land and the portrait to fall before the stamp drops.
  const [settled, setSettled] = useState(false);
  const me = state.players.find(p => p.id === state.sessionId);
  const yours = state.status === 'active' && state.activePlayer === state.sessionId;
  const reward = player.lastReward;
  const eloDelta = reward ? reward.elo - reward.previousElo : 0;
  // One stamp per turn change, in sync with the server's turn event.
  useEffect(() => {
    if (state.status !== 'active' || !state.turn) return;
    setStamp({ text: t(yours ? 'yours' : 'theirs'), tone: yours ? 'mine' : 'theirs', serial: state.turn });
    const timer = setTimeout(() => setStamp(null), 1500);
    return () => clearTimeout(timer);
  }, [state.turn, state.activePlayer, state.status, t]);
  useEffect(() => { if (!hint) return; const timer = setTimeout(() => setHint(''), 2600); return () => clearTimeout(timer); }, [hint]);
  useEffect(() => {
    if (state.status !== 'finished') { setSettled(false); return; }
    const timer = setTimeout(() => {
      setSettled(true);
      audioManager.play(!state.winner ? 'card_place' : state.winner === state.sessionId ? 'coins_win' : 'ab_stamp');
      playerSession.finishMatch(!state.winner ? 'draw' : state.winner === state.sessionId ? 'win' : 'loss');
    }, state.turn ? 1400 : 0);
    return () => clearTimeout(timer);
  }, [state.status, state.winner, state.sessionId, state.turn]);
  useEffect(() => { if (state.error && state.error !== 'rejected') return; if (state.error) audioManager.play('ab_error'); }, [state.error]);
  useEffect(() => { void session.connect(true); }, []);

  const clockActive = state.status === 'active' || state.status === 'selecting' || state.status === 'mulligan';
  const secs = Math.max(0, Math.ceil((state.phaseEndsAt - Date.now()) / 1000));
  const deadline = useDeadline(state.status, state.turn, state.phaseEndsAt, secs, clockActive);
  // Hearthstone rope: it appears for the last ROPE_MS of a turn and burns down over exactly that span.
  // The rope shows for the last FUSE_SECONDS (PhaseClock), so the warning sound fires at the same moment it lights.
  const ROPE_MS = Math.min(MATCH_RULES.ROPE_MS, FUSE_SECONDS * 1000);
  const rope = useMemo(() => ({ endsAt: deadline.endsAt, totalMs: ROPE_MS }), [deadline]);
  const [roping, setRoping] = useState(false);
  useEffect(() => {
    setRoping(false);
    if (state.status !== 'active') return;
    const timer = setTimeout(() => { setRoping(true); if (yours) audioManager.play('ab_hint'); }, Math.max(0, deadline.endsAt - ROPE_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [deadline, state.status, yours]);
  // Nothing left to do this turn: the end-turn gem glows.
  const idle = yours && !!me && !state.hand.some(h => { const c = state.cards.find(c => c.id === h.cardId); return !!c && c.cost <= me.mana; })
    && !state.minions.some(m => m.owner === me.id && m.ready && m.attack > 0);
  return (
    <div ref={screenRef} className={`ab-screen duel-screen ${yours ? 'is-my-turn' : ''} ${state.status === 'active' ? 'is-active' : ''}`} data-testid="duel-screen" data-board={equippedBoard().id}
      style={{ ...equippedBoard().vars, '--ab-header': `${DUEL.HEADER_H}px` } as CSSProperties}>
      <GameCursor />
      <header className="ab-header">
        <strong className="ab-brand">КАРТИШКИ <i>✳</i></strong>
        <span className={`connection ${state.status}`} role="status">{t(state.status)}</span>
        {state.turn > 0 && <span>{t('turn', { turn: state.turn })}</span>}
        {state.status === 'active' && <span className="duel-header-turn">{t(yours ? 'yours' : 'theirs')}</span>}
        <div className="ml-auto flex gap-2">
          <InkButton size="sm" aria-label={t('settings')} onClick={() => window.dispatchEvent(new Event('open-settings'))}>⚙</InkButton>
          <InkButton size="sm" onClick={() => { session.leave(); onLeave(); }}>{t(state.status === 'active' || state.status === 'mulligan' || state.status === 'selecting' ? 'concede' : 'leave')}</InkButton>
        </div>
      </header>
      <div className="duel-table">
        <DuelBoard onHint={setHint} />
        <FuseRope deadline={rope} active={roping} />
        <aside className="ab-rail duel-rail" data-testid="duel-rail">
          <SandClock deadline={deadline} active={state.status === 'active'} urgent />
          <button type="button" className={`ab-tavern-btn is-end-turn ${yours ? 'is-ready' : ''} ${idle ? 'is-idle' : ''}`} disabled={!yours} onClick={() => session.advance()} data-testid="duel-end-turn" aria-label={t('advance')}>
            <b>{t('advance')}</b>
          </button>
        </aside>
        {state.status !== 'active' && state.status !== 'finished' && !state.players.length && state.status !== 'connecting' && <p className="ab-empty">{t('connectHint')}</p>}
        {state.status === 'connecting' && <p className="ab-empty">{t('connecting')}</p>}
      </div>
      {state.status === 'selecting' && (
        <div className="hero-selection" role="dialog" aria-label={t('abChooseHero')} data-testid="duel-hero-select">
          <h1>{me?.heroId ? t('duelWaitingHero') : t('abChooseHero')}</h1>
          <p>{t('duelHeroHint')}</p>
          <SandClock deadline={deadline} active={!me?.heroId} urgent={false} />
          <div className="hero-offers">{state.heroOffers.map(h => <button key={h.id} disabled={!!me?.heroId} aria-label={t('chooseHeroAria', { name: h.name })} aria-pressed={me?.heroId === h.id} onClick={() => { audioManager.play('ui_select'); session.chooseHero(h.id); }}><HeroPortrait hero={h} cards={state.cards} /></button>)}</div>
        </div>
      )}
      {state.status === 'mulligan' && me && (
        <Mulligan hand={state.hand} cards={state.cards} done={me.mulliganDone} first={state.first === state.sessionId} deadline={deadline} onConfirm={replace => session.mulligan(replace)} />
      )}
      {stamp && <div key={stamp.serial} className={`ab-result-stamp duel-turn-stamp is-${stamp.tone}`} role="status" data-testid="duel-turn-stamp"><b>{stamp.text}</b></div>}
      {hint && <p className="duel-hint" role="status">{hint}</p>}
      {state.error && <p className="battle-error" role="alert">{t(state.error)}</p>}
      {state.status === 'finished' && settled && (
        <div className="ab-modal" data-testid="duel-finished">
          <div className={`ab-modal-card ab-final ${!state.winner ? 'is-out' : state.winner === state.sessionId ? 'is-top1' : 'is-out'}`}>
            <h2 className="result" data-testid="duel-result">{t(!state.winner ? 'draw' : state.winner === state.sessionId ? 'win' : 'loss')}</h2>
            {reward && (
              <div className="ab-final-rewards">
                <div className={`ab-final-reward ${eloDelta >= 0 ? 'is-gain' : 'is-loss'}`}><i>🍺</i><b>{eloDelta > 0 ? '+' : ''}{eloDelta}</b><small>{t('ladderMl')}</small></div>
                {reward.gained > 0 && <div className="ab-final-reward is-gain"><i>$</i><b>+{reward.gained}</b><small>{t('currency')}</small></div>}
              </div>
            )}
            <div className="ab-gameover-actions">
              <InkButton tone="ink" onClick={() => { session.leave(); onLeave(); }}>{t('backToMenu')}</InkButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
