import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { audioManager } from '../AudioManager';
import { InkButton } from '../ui/InkButton';
import { BackButton } from '../ui/BackButton';
import { spawnBurst } from './tableFx';

type Reward = { elo: number; previousElo: number; gained: number; xpGain?: number };

/** End of a Battlegrounds run: a placement banner (gold / silver / bronze for the podium) and the three rewards. */
export function GameOverCard({ placement, finished, winner, cancelled = false, reward, onAgain, onLeave }: { placement: number; finished: boolean; winner: boolean; /** More than half the table walked out: no place, no rewards. */ cancelled?: boolean; reward?: Reward; onAgain: () => void; onLeave: () => void }) {
  const { t, i18n } = useTranslation();
  const ru = i18n.language.startsWith('ru');
  const place = placement || (winner ? 1 : 0);
  const tier = cancelled ? 'out' : place === 1 ? 'top1' : place === 2 ? 'top2' : place === 3 ? 'top3' : 'out';
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    audioManager.play(tier === 'top1' ? 'case_win' : tier === 'out' ? 'ab_stamp' : 'ab_upgrade');
    if (tier === 'out') return;
    const color = tier === 'top1' ? '#ffd76a' : tier === 'top2' ? '#dfe6ee' : '#d9925a';
    const host = card.current;
    if (!host) return;
    // Bursts live inside the card (the fx layer sits under the modal backdrop).
    const timers = [0, 380, 760, 1200, 1700].map((ms, i) => window.setTimeout(() => spawnBurst({ x: host.offsetWidth * (i % 2 ? .82 : .18), y: 40 + (i % 3) * 30, w: 10, h: 10 }, color, 16, host), ms));
    return () => timers.forEach(clearTimeout);
  }, [tier]);
  const title = cancelled ? (ru ? 'МАТЧ ОТМЕНЁН' : 'MATCH CANCELLED') : tier === 'top1' ? (ru ? 'ПОБЕДА!' : 'VICTORY!') : tier === 'top2' ? (ru ? 'ВТОРОЕ МЕСТО' : 'SECOND PLACE') : tier === 'top3' ? (ru ? 'ТРЕТЬЕ МЕСТО' : 'THIRD PLACE') : finished ? t('abGameOver') : t('abEliminated');
  const beer = reward ? reward.elo - reward.previousElo : 0;
  return (
    <div className="ab-modal" data-testid="ab-gameover">
      <div ref={card} className={`ab-modal-card ab-final is-${tier}`}>
        <div className="ab-final-medal" aria-hidden>
          {tier === 'top1' && <svg viewBox="0 0 120 100"><path d="M10 84h100l-8-52-22 18-20-36-20 36-22-18Z" fill="#ffd76a" stroke="#5a3f12" strokeWidth="5" strokeLinejoin="round" /><circle cx="60" cy="40" r="7" fill="#b32e23" stroke="#5a3f12" strokeWidth="3" /><circle cx="30" cy="52" r="5" fill="#2e8b57" stroke="#5a3f12" strokeWidth="3" /><circle cx="90" cy="52" r="5" fill="#2e8b57" stroke="#5a3f12" strokeWidth="3" /></svg>}
          {tier !== 'top1' && tier !== 'out' && <svg viewBox="0 0 120 120"><path d="M40 6h40l-8 34H48Z" fill="#b32e23" stroke="#2a1a10" strokeWidth="4" /><circle cx="60" cy="74" r="36" fill={tier === 'top2' ? '#dfe6ee' : '#d9925a'} stroke="#2a1a10" strokeWidth="5" /><circle cx="60" cy="74" r="26" fill="none" stroke="#2a1a10" strokeWidth="3" strokeDasharray="4 6" /><text x="60" y="86" textAnchor="middle" fontSize="36" fontFamily="var(--font-stencil)" fill="#2a1a10">{place}</text></svg>}
          {tier === 'out' && <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="44" fill="#5a4a48" stroke="#2a1a10" strokeWidth="5" /><path d="M40 44l40 32M80 44 40 76" stroke="#b32e23" strokeWidth="8" strokeLinecap="round" /></svg>}
        </div>
        <h2>{title}</h2>
        {place > 0 && tier === 'out' && !cancelled && <p className="ab-final-place">{t('abPlace', { n: place })}</p>}
        {cancelled && <p className="ab-final-note">{ru ? 'Больше половины игроков вышли из матча — награды не начисляются.' : 'More than half the table left the match — no rewards are paid.'}</p>}
        {!finished && !reward && !cancelled && <p className="ab-final-note">{ru ? 'Награды придут после финала.' : 'Rewards arrive after the final.'}</p>}
        {reward && !cancelled && (
          <div className="ab-final-rewards">
            <div className={`ab-final-reward ${beer >= 0 ? 'is-gain' : 'is-loss'}`}><i>🍺</i><b>{beer > 0 ? '+' : ''}{beer}</b><small>{ru ? 'мл пива' : 'ml beer'}</small></div>
            <div className="ab-final-reward is-gain"><i>$</i><b>+{reward.gained}</b><small>{ru ? 'наличные' : 'cash'}</small></div>
            <div className="ab-final-reward is-gain"><i>★</i><b>+{reward.xpGain ?? 0}</b><small>{ru ? 'опыта' : 'xp'}</small></div>
          </div>
        )}
        <div className="ab-gameover-actions">
          <InkButton tone="blood" onClick={onAgain}>{t('abPlayAgain')}</InkButton>
          <BackButton onClick={onLeave} size="md" />
        </div>
      </div>
    </div>
  );
}
