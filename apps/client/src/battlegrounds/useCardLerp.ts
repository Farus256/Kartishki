import { useLayoutEffect, useRef, type RefObject } from 'react';
import { AB_LAYOUT } from './battlegroundsLayout';
import { STAGE_W, stageRoot } from '../ui/stageCoords';

type Box = { x: number; y: number; w: number; h: number };

/** Stage pixels, so a viewport rescale between renders is not mistaken for card movement. */
function stageZoom(): number {
  const rect = stageRoot()?.getBoundingClientRect();
  return rect?.width ? rect.width / STAGE_W : 1;
}

function toBox(r: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, zoom: number): Box {
  return { x: r.left / zoom, y: r.top / zoom, w: r.width / zoom, h: r.height / zoom };
}

/**
 * FLIP-lerp minion tiles between shop, hand and board. No teleports.
 * Returns the boxes measured on the previous commit, so a tile that vanished this commit
 * (triple merge, sale) can still be replayed from where it stood.
 */
export function useCardLerp(
  root: RefObject<HTMLElement | null>,
  token: string,
  flights?: RefObject<Map<string, DOMRect>>,
) {
  const prev = useRef(new Map<string, Box>());
  const before = useRef(new Map<string, Box>());
  useLayoutEffect(() => {
    const node = root.current;
    if (!node || node.classList.contains('is-combat')) {
      before.current = prev.current;
      prev.current = new Map();
      return;
    }
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      before.current = prev.current;
      prev.current = new Map();
      return;
    }
    const zoom = stageZoom();
    const next = new Map<string, Box>();
    node.querySelectorAll<HTMLElement>('[data-ab-id]').forEach(el => {
      if (el.closest('.ab-drag-ghost') || el.closest('.ab-drag-hold') || el.closest('.ab-combat')) return;
      const id = el.dataset.abId;
      if (!id) return;
      const here = toBox(el.getBoundingClientRect(), zoom);
      next.set(id, here);
      // Lifted and parked tiles are represented by the drag ghost; they must not fly on their own.
      if (el.classList.contains('is-lifted') || el.classList.contains('is-shop-lift') || el.classList.contains('is-parked')) return;
      const flight = flights?.current.get(id);
      if (flight) flights?.current.delete(id);
      const from = flight ? toBox(flight, zoom) : prev.current.get(id);
      if (!from) return;
      const dx = from.x - here.x;
      const dy = from.y - here.y;
      const sx = from.w / Math.max(1, here.w);
      const sy = from.h / Math.max(1, here.h);
      const far = Math.abs(dy) > 24 || Math.abs(dx) > 10 || Math.abs(sx - 1) > 0.08;
      if (!far) return;
      el.getAnimations().forEach(animation => animation.cancel());
      const flying = Math.abs(dy) > 24;
      // A flight between rows arcs upward like a tossed card; a slide within a row stays flat.
      const frames: Keyframe[] = flying
        ? [
          { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) rotate(0deg)` },
          { transform: `translate(${dx * .5}px, ${Math.min(dy, 0) * .5 - 46}px) scale(${(sx + 1) / 2}, ${(sy + 1) / 2}) rotate(${dx > 0 ? -6 : 6}deg)`, offset: .5 },
          { transform: 'none' },
        ]
        : [{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transform: 'none' }];
      el.animate(frames, { duration: flying ? AB_LAYOUT.FLY_MS : AB_LAYOUT.SLIDE_MS, easing: 'cubic-bezier(.2,.75,.2,1)' });
    });
    before.current = prev.current;
    prev.current = next;
  }, [token, root, flights]);
  return before;
}
