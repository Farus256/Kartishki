import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

export type Deadline = { endsAt: number; totalMs: number };

/**
 * Local deadline for the running phase. Colyseus only patches whole seconds, and a stalled
 * patch used to freeze the fuse; pinning the deadline once per phase lets the client tick alone.
 * Skew is measured on the first patch of the phase, where recruitSeconds is exact.
 */
export function useDeadline(phase: string, turn: number, phaseEndsAt: number, serverSecs: number, active: boolean): Deadline {
  const pin = useRef({ key: '', endsAt: 0, totalMs: 1000 });
  const key = `${phase}|${turn}|${phaseEndsAt}`;
  const secs = Math.max(0, serverSecs);
  // Whole-second patches wobble by up to a second; anything beyond that is a real drift (lag, sleep) — re-pin.
  const drifted = Math.abs(pin.current.endsAt - Date.now() - secs * 1000) > 1500;
  if (active && (pin.current.key !== key || drifted)) {
    pin.current = { key, endsAt: Date.now() + secs * 1000, totalMs: pin.current.key === key ? Math.max(pin.current.totalMs, secs * 1000) : Math.max(1000, secs * 1000) };
  }
  return pin.current;
}

/** Seconds left, re-rendering only this component once per second; sand ratio painted per frame via onFrame. */
function useCountdown(deadline: Deadline, active: boolean, onFrame?: (ratio: number) => void) {
  const [secs, setSecs] = useState(() => Math.ceil(Math.max(0, deadline.endsAt - Date.now()) / 1000));
  const frameCb = useRef(onFrame);
  frameCb.current = onFrame;
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let shown = -1;
    const paint = () => {
      const remaining = Math.max(0, deadline.endsAt - Date.now());
      frameCb.current?.(Math.max(0, Math.min(1, remaining / deadline.totalMs)));
      const next = Math.ceil(remaining / 1000);
      if (next !== shown) { shown = next; setSecs(next); }
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [active, deadline]);
  return active ? secs : 0;
}

/** The fuse only lights for the final seconds and burns toward the clock: the remaining rope is anchored at the clock's side. */
export const FUSE_SECONDS = 10;

export function FuseRope({ deadline, active }: { deadline: Deadline; active: boolean }) {
  const { t } = useTranslation();
  const fill = useRef<HTMLDivElement>(null);
  const secs = useCountdown(deadline, active, ratio => { if (fill.current) fill.current.style.width = `${Math.min(1, ratio * deadline.totalMs / (FUSE_SECONDS * 1000)) * 100}%`; });
  if (!active || secs <= 0 || secs > FUSE_SECONDS) return null;
  return (
    <div className="ab-rope is-short" data-testid="ab-rope" aria-label={t('abTimer', { n: secs })}>
      {/* Sparks (i) fly up off the ember; ash flakes (em) drift back along the burnt rope and sink. */}
      <div ref={fill} className="ab-rope-remaining" style={{ width: `${Math.min(1, Math.max(0, deadline.endsAt - Date.now()) / (FUSE_SECONDS * 1000)) * 100}%` }}><span className="ab-rope-ember"><i /><i /><i /><em /><em /><em /><em /></span></div>
    </div>
  );
}

export function SandClock({ deadline, active, urgent }: { deadline: Deadline; active: boolean; urgent: boolean }) {
  const { t } = useTranslation();
  const clock = useRef<HTMLDivElement>(null);
  const secs = useCountdown(deadline, active, ratio => {
    const el = clock.current;
    if (!el) return;
    el.style.setProperty('--sand', String(ratio));
    el.dataset.running = ratio > 0 ? '1' : '0';
  });
  const label = active ? t('abTimer', { n: secs }) : '—';
  return (
    <div ref={clock} className={`ab-clock ${urgent && secs <= 5 ? 'is-critical' : urgent && secs <= 10 ? 'is-urgent' : ''}`} data-testid="ab-timer" aria-label={label} data-running="0" style={{ '--sand': 0 } as CSSProperties}>
      <svg viewBox="0 0 60 80" aria-hidden><g stroke="#2a1a10" strokeWidth="4" strokeLinejoin="round"><path d="M10 6h40M10 74h40M14 6c0 20 14 26 16 34-2 8-16 14-16 34M46 6c0 20-14 26-16 34 2 8 16 14 16 34" fill="none" /><path className="ab-clock-sand" d="M17 10h26c0 12-9 22-13 30-4-8-13-18-13-30Z" fill="#e8c27a" stroke="none" /><path className="ab-clock-stream" d="M30 42v26" stroke="#e8c27a" strokeWidth="3" strokeDasharray="3 4" /><path className="ab-clock-heap" d="M16 70h28c0-10-8-16-14-22-6 6-14 12-14 22Z" fill="#e8c27a" stroke="none" /></g></svg>
      <b>{label}</b>
    </div>
  );
}
