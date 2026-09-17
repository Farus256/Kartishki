import { useEffect, useRef } from 'react';
import { mountAura, mountBoardAmbience, mountFrameFx } from './auras';

/** Drop inside a .ab-hero-face: mounts the procedural aura (and the frame's own motion, if the skin has one) on the portrait it sits in. */
export function Aura({ id, skin, paused = false, still = false }: { id?: string; skin?: string; /** One frozen frame instead of a running canvas (gallery and reel tiles). */ still?: boolean; /** Unmounts the layers while the portrait is covered (the dock under the combat table): a canvas repainting under a big overlay is the one thing that costs frames. */ paused?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => { const host = ref.current?.parentElement; if (!host || !id || paused) return; return mountAura(host, id, still); }, [id, paused, still]);
  useEffect(() => { const host = ref.current?.parentElement; if (!host || !skin || paused) return; return mountFrameFx(host, skin, still); }, [skin, paused, still]);
  return <span ref={ref} hidden data-aura={id || undefined} />;
}

/** Drop inside the table stage: ambient particles for the equipped board preset. */
export function BoardAmbience({ id }: { id?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => { const host = ref.current?.parentElement; if (!host || !id) return; return mountBoardAmbience(host, id); }, [id]);
  return <span ref={ref} hidden data-ambience={id || undefined} />;
}
