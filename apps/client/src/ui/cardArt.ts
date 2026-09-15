import { useEffect, useState } from 'react';
import { renderPhoto } from '@kartishki/shared/photo';
import type { CardDefinition } from '@kartishki/shared';

// Distinct art settings share one processed data URL per session.
const cache = new Map<string, Promise<string>>();
// Settled URLs, so a tile that mounts mid-gesture (drag ghost, combat card) paints the final art on its first frame.
const ready = new Map<string, string>();

export function cardArt(art: CardDefinition['art'], size = 256) {
  const key = `${size}:${JSON.stringify(art)}`;
  if (!cache.has(key)) {
    if (cache.size >= 256) { const oldest = cache.keys().next().value!; cache.delete(oldest); ready.delete(oldest); }
    cache.set(key, renderPhoto(art, size).then(canvas => { const url = canvas.toDataURL(); ready.set(key, url); return url; }).catch(error => { cache.delete(key); throw error; }));
  }
  return cache.get(key)!;
}

export function useCardArt(art: CardDefinition['art'], size = 256) {
  const key = `${size}:${JSON.stringify(art)}`;
  const [src, setSrc] = useState<string | undefined>(() => ready.get(key));
  useEffect(() => {
    const settled = ready.get(key);
    setSrc(settled);
    if (settled) return;
    let live = true;
    const timer = setTimeout(() => { void cardArt(art, size).then(url => { if (live) setSrc(url); }).catch(() => {}); }, 50);
    return () => { live = false; clearTimeout(timer); };
  }, [key]);
  return src;
}
