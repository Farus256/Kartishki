import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AUTO_BATTLER } from '@kartishki/shared';
import type { AbPlayer } from '../autoBattlerSession';
import { stageBox, type Box } from './tableFx';

const SEEN_KEY = 'ab-hints-seen';
const IDLE_MS = 8000;

type Hint = { id: 'buy' | 'play' | 'end'; from: Box; to: Box; text: string };

function seen(): boolean { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } }
function markSeen(): void { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* optional */ } }

/**
 * First three turns of a first game: a hand-drawn arrow from the first tavern minion to the hero
 * (buy), from the first hand card to the board (play), and a nudge on the end-turn button when idle.
 */
export function NewbieHints({ me, turn, recruit, dragging }: { me: AbPlayer; turn: number; recruit: boolean; dragging: boolean }) {
  const { i18n } = useTranslation();
  const ru = i18n.language.startsWith('ru');
  const [hint, setHint] = useState<Hint | null>(null);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef({ buy: false, play: false });
  const active = recruit && !dragging && turn > 0 && turn <= 3 && !seen();

  useEffect(() => { if (turn > 3 && !seen()) markSeen(); }, [turn]);
  useEffect(() => { if (me.hand.length) done.current.buy = true; if (me.board.length) done.current.play = true; }, [me.hand.length, me.board.length]);

  // Idle nudge on "В бой": reset on any pointer or key activity.
  useEffect(() => {
    if (!active) { setIdle(false); return; }
    const arm = () => { setIdle(false); if (idleTimer.current) clearTimeout(idleTimer.current); idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS); };
    arm();
    window.addEventListener('pointerdown', arm);
    window.addEventListener('keydown', arm);
    return () => { window.removeEventListener('pointerdown', arm); window.removeEventListener('keydown', arm); if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [active, turn, me.gold, me.hand.length, me.board.length]);

  // Measure anchors in stage px; re-measure while visible since rows re-center as they change.
  useEffect(() => {
    if (!active) { setHint(null); return; }
    const measure = () => {
      const q = (sel: string) => document.querySelector<HTMLElement>(sel);
      const canBuy = me.gold >= me.buyCost && me.tavern.offers.length > 0 && !me.hand.length && !done.current.buy;
      const canPlay = me.hand.length > 0 && me.board.length < AUTO_BATTLER.BOARD_LIMIT && !done.current.play;
      let next: Hint | null = null;
      if (canBuy) {
        const from = stageBox(q('.ab-tavern-row .ab-minion')), to = stageBox(q('[data-testid="ab-hero"] .ab-hero-face'));
        if (from && to) next = { id: 'buy', from, to, text: ru ? 'Перетащи существо к герою, чтобы купить' : 'Drag a minion to your hero to buy it' };
      } else if (canPlay) {
        const from = stageBox(q('.ab-hand .ab-minion')), to = stageBox(q('[data-testid="ab-board"]'));
        if (from && to) next = { id: 'play', from, to: { x: to.x + to.w / 2 - 75, y: to.y, w: 150, h: to.h }, text: ru ? 'Перетащи карту на стол' : 'Drag the card onto the table' };
      } else if (idle || (me.gold < me.buyCost && !me.hand.length)) {
        // Early turns have a Ready button in the header; later the hourglass alone runs the phase, so point at it once when idle.
        const ready = turn <= AUTO_BATTLER.EARLY_READY_TURNS ? stageBox(q('[data-testid="ab-ready"]')) : null;
        const to = ready ?? stageBox(q('.ab-clock'));
        if (to) next = { id: 'end', from: to, to, text: ready ? (ru ? 'Готов? Жми «Готов» — бой начнётся раньше' : 'Done? Press Ready to fight sooner') : (ru ? 'Ход закончится, когда сгорит песок' : 'The turn ends when the sand runs out') };
      }
      setHint(current => current && next && current.id === next.id && Math.abs(current.from.x - next.from.x) < 1 && Math.abs(current.to.x - next.to.x) < 1 ? current : next);
    };
    measure();
    const timer = setInterval(measure, 400);
    return () => clearInterval(timer);
  }, [active, idle, ru, turn, me.gold, me.hand.length, me.board.length, me.tavern.offers.length]);

  if (!active || !hint) return null;
  const a = { x: hint.from.x + hint.from.w / 2, y: hint.from.y + hint.from.h / 2 };
  const b = { x: hint.to.x + hint.to.w / 2, y: hint.to.y + hint.to.h / 2 };
  const arrow = hint.id !== 'end';
  const mid = { x: (a.x + b.x) / 2 + (b.y > a.y ? 60 : -60), y: (a.y + b.y) / 2 };
  return (
    <div className="ab-hints" aria-hidden data-hint={hint.id}>
      {arrow && (
        <svg className="ab-hint-arrow" viewBox="0 0 1600 900" preserveAspectRatio="none">
          <path className="ab-hint-line" d={`M ${a.x} ${a.y} Q ${mid.x} ${mid.y} ${b.x} ${b.y}`} />
          <circle className="ab-hint-dot" r="10"><animateMotion dur="1.4s" repeatCount="indefinite" path={`M ${a.x} ${a.y} Q ${mid.x} ${mid.y} ${b.x} ${b.y}`} /></circle>
        </svg>
      )}
      {!arrow && <i className="ab-hint-ring" style={{ left: hint.to.x - 10, top: hint.to.y - 10, width: hint.to.w + 20, height: hint.to.h + 20 }} />}
      <span className="ab-hint-label" style={{ left: arrow ? mid.x : hint.to.x - 200, top: arrow ? mid.y - 18 : hint.to.y + 16 }}>{hint.text}</span>
    </div>
  );
}
