import { useLayoutEffect, useRef, type RefObject } from 'react';
import { AB_LAYOUT } from './battlegroundsLayout';

type Box = { x: number; y: number; w: number; h: number };

function boxOf(el: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** FLIP-lerp minion tiles between shop, hand and board. No teleports. */
export function useCardLerp(
  root: RefObject<HTMLElement | null>,
  token: string,
  flights?: RefObject<Map<string, DOMRect>>,
) {
  const prev = useRef(new Map<string, Box>());
  useLayoutEffect(() => {
    const node = root.current;
    if (!node || node.classList.contains('is-combat')) {
      prev.current = new Map();
      return;
    }
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      prev.current = new Map();
      return;
    }
    const next = new Map<string, Box>();
    node.querySelectorAll<HTMLElement>('[data-ab-id]').forEach(el => {
      if (el.closest('.ab-drag-ghost') || el.closest('.ab-drag-hold') || el.closest('.ab-combat')) return;
      const id = el.dataset.abId;
      if (!id) return;
      const here = boxOf(el);
      next.set(id, here);
      if (el.classList.contains('is-lifted') || el.classList.contains('is-shop-lift')) return;
      const flight = flights?.current.get(id);
      if (flight) flights?.current.delete(id);
      const from = flight ? { x: flight.left, y: flight.top, w: flight.width, h: flight.height } : prev.current.get(id);
      if (!from) return;
      const zoom = here.w / Math.max(1, el.offsetWidth);
      const dx = (from.x - here.x) / zoom;
      const dy = (from.y - here.y) / zoom;
      const sx = from.w / Math.max(1, here.w);
      const sy = from.h / Math.max(1, here.h);
      const far = Math.abs(dy) > 24 || Math.abs(dx) > 40 || Math.abs(sx - 1) > 0.08;
      if (!far) return;
      el.getAnimations().forEach(animation => animation.cancel());
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
          { transform: 'none' },
        ],
        { duration: Math.abs(dy) > 24 ? AB_LAYOUT.FLY_MS : AB_LAYOUT.SLIDE_MS, easing: 'cubic-bezier(.2,.75,.2,1)' },
      );
    });
    prev.current = next;
  }, [token, root, flights]);
}
