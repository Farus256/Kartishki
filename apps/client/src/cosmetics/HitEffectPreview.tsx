import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AutoBattlerHeroDef } from '@kartishki/shared';
import { AbHeroFace } from '../battlegrounds/AbHeroFace';
import { HIT_EFFECTS, playHitEffect } from './hitEffects';
import { STRIKES, type Pose } from './strikeMotion';
import { Aura } from './Aura';
import { playSlamSound } from './vfxAudio';

type Phase = 'wind' | 'hit' | 'recoil' | 'rest';
const PHASES: Phase[] = ['wind', 'hit', 'recoil', 'rest'];

/**
 * Two portraits and a looping duel: the striker winds up, lunges, the paid effect lands on the victim,
 * both settle, a beat, repeat. The same renderer combat uses, so what you see is what you get.
 * Under the stage a four-step strip (wind-up · impact · recoil · recover) lights up with the phase that is
 * playing, and each portrait keeps a ground shadow that shrinks when it leaves the floor.
 */
export function HitEffectPreview({ id, striker, victim, size = 'md', loop = true, skin = '', aura = '' }: { id: string; striker?: AutoBattlerHeroDef; victim?: AutoBattlerHeroDef; size?: 'sm' | 'md' | 'lg'; loop?: boolean; skin?: string; aura?: string }) {
  const { t } = useTranslation();
  const strikerRef = useRef<HTMLDivElement>(null);
  const victimRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLElement>(null);
  const [replay, setReplay] = useState(0);
  const [phase, setPhase] = useState<Phase | null>(null);
  useEffect(() => {
    const a = strikerRef.current, b = victimRef.current;
    if (!a || !b) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let alive = true;
    let hit: ReturnType<typeof playHitEffect> | undefined;
    const timers: number[] = [];
    const wait = (ms: number) => new Promise<void>(resolve => { timers.push(window.setTimeout(resolve, ms)); });
    /** Step a pose function over `ms` on rAF, writing transform/opacity; resolves when done or when the preview unmounts. */
    const drive = (el: HTMLElement, ms: number, pose: (u: number) => Pose, dashPx: number) => new Promise<void>(resolve => {
      const t0 = performance.now();
      const step = () => {
        if (!alive) { resolve(); return; }
        const u = Math.min(1, (performance.now() - t0) / ms), q = pose(u);
        el.style.transform = `translate(${q.ax * dashPx}px,${q.side}px) rotate(${q.r}deg) scale(${q.s})`;
        el.style.opacity = q.alpha == null ? '' : String(q.alpha);
        // Ground shadow: slides with the striker, shrinks and fades the higher it leaves the floor (side < 0 is up).
        const sh = shadowRef.current;
        if (sh) { const lift = Math.max(0, -q.side) / 120; sh.style.transform = `translate(${q.ax * dashPx}px,0) scale(${1 - lift * .6})`; sh.style.opacity = String((q.alpha ?? 1) * (.7 - lift * .5)); }
        if (u < 1) frames.push(requestAnimationFrame(step)); else resolve();
      };
      frames.push(requestAnimationFrame(step));
    });
    const frames: number[] = [];
    // Lunge just far enough to land on the victim's near edge, whatever the stage size.
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const dash = Math.max(30, (rb.left - ra.right + ra.width * .08) / (ra.width / (a.offsetWidth || ra.width)));
    const cycle = async () => {
      while (alive) {
        if (document.hidden) { await wait(500); continue; }
        if (!id) { setPhase(null); await wait(800); continue; }
        if (reduced) {
          setPhase('hit');
          hit = playHitEffect(b, id, { reduced: true, dir: { x: 1, y: .2 } });
          await hit;
          setPhase('rest');
          if (!loop) return;
          await wait(1400);
          continue;
        }
        // The bought style's own approach (strikeMotion.ts), stepped on rAF; contact lands on its last frame.
        const strike = STRIKES[HIT_EFFECTS[id]?.motion ?? 'punch'];
        a.dataset.slamLive = id;
        setPhase('wind');
        await drive(a, strike.approachMs, u => strike.pose(u, 1), dash);
        if (!alive) return;
        setPhase('hit');
        hit = playHitEffect(b, id, { dir: { x: 1, y: .2 } });
        playSlamSound(id);
        await wait(120);
        setPhase('recoil');
        const last = strike.pose(1, 1);
        await drive(a, strike.retreatMs, u => { const e = 1 - (1 - u) ** 3; return { ax: last.ax * (1 - e), side: last.side * (1 - e), r: last.r * (1 - e), s: 1 + (last.s - 1) * (1 - e), alpha: last.alpha == null ? undefined : last.alpha + (1 - last.alpha) * e }; }, dash);
        a.style.transform = ''; a.style.opacity = '';
        if (shadowRef.current) { shadowRef.current.style.transform = ''; shadowRef.current.style.opacity = ''; }
        setPhase('rest');
        await hit;
        delete a.dataset.slamLive;
        if (!loop) return;
        await wait(1100);
      }
    };
    void cycle();
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      frames.forEach(cancelAnimationFrame);
      a.style.transform = ''; a.style.opacity = '';
      if (shadowRef.current) { shadowRef.current.style.transform = ''; shadowRef.current.style.opacity = ''; }
      hit?.cancel();
      delete a.dataset.slamLive;
    };
  }, [id, loop, replay]);
  return <div className={`hit-preview is-${size}`} data-testid="hit-preview" data-phase={phase ?? undefined}>
    <div className="hit-preview-floor" aria-hidden><i ref={shadowRef} className="hit-preview-shadow is-striker" /><i className="hit-preview-shadow is-victim" /></div>
    <div ref={strikerRef} className="ab-hero-face frame-preview hit-preview-striker" data-skin={skin} data-aura={aura || undefined}><AbHeroFace id={striker?.id ?? 'ab-hero-captain'} art={striker?.art} /><Aura id={aura} skin={skin} /></div>
    <div ref={victimRef} className="ab-hero-face frame-preview hit-preview-victim"><AbHeroFace id={victim?.id ?? 'ab-hero-bartender'} art={victim?.art} /></div>
    {size === 'lg' && <ol className="hit-preview-phases" aria-hidden>{PHASES.map(p => <li key={p} className={phase === p ? 'is-on' : ''}>{t(`cosmeticsPhase_${p}`)}</li>)}</ol>}
    <button type="button" className="hit-preview-replay" onClick={() => setReplay(n => n + 1)}>{t('cosmeticsReplay')}</button>
  </div>;
}
