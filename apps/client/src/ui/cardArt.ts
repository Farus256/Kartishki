import { useEffect, useState } from 'react';
import { renderPhoto } from '@kartishki/shared/photo';
import type { CardDefinition } from '@kartishki/shared';

// The ink filter is expensive, so every distinct art setting is processed once per session.
const cache = new Map<string, Promise<string>>();

export function cardArt(art: CardDefinition['art'], size = 256) {
  const key = `${size}:${JSON.stringify(art)}`;
  if (!cache.has(key)) cache.set(key, renderPhoto(art, size).then(canvas => canvas.toDataURL()));
  return cache.get(key)!;
}

export function useCardArt(art: CardDefinition['art'], size = 256) {
  const [src, setSrc] = useState<string>();
  const key = `${size}:${JSON.stringify(art)}`;
  useEffect(() => {
    let live = true;
    void cardArt(art, size).then(url => { if (live) setSrc(url); }).catch(() => {});
    return () => { live = false; };
  }, [key]);
  return src;
}
