import { useEffect, useState } from 'react';
import type { CardDefinition } from '@kartishki/shared';

export const apiBase = (import.meta.env.VITE_SERVER_URL ?? 'http://127.0.0.1:2567').replace(/^ws/, 'http');

let pending: Promise<CardDefinition[]> | undefined;

/** Published card definitions, fetched once and shared by every screen. */
export function useCatalog() {
  const [cards, setCards] = useState<CardDefinition[]>([]);
  useEffect(() => {
    pending ??= fetch(`${apiBase}/api/catalog`).then(r => r.json()).then(data => data.cards ?? []).catch(() => []);
    let live = true;
    void pending.then(list => { if (live) setCards(list); });
    return () => { live = false; };
  }, []);
  return cards;
}
