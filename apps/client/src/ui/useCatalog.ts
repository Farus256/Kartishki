import { useEffect, useState } from 'react';
import { resolveLeveling, resolveMenuMusic, type CardDefinition, type Catalog, type MenuMusicTrack, type PlayerLeveling, starterLeveling } from '@kartishki/shared';

export const apiBase = (import.meta.env.VITE_SERVER_URL ?? 'http://127.0.0.1:2567').replace(/^ws/, 'http');

let pending: Promise<Catalog> | undefined;
function loadCatalog(): Promise<Catalog> {
  pending ??= fetch(`${apiBase}/api/catalog`).then(r => r.json()).catch(() => ({ version: 0, cards: [] }));
  return pending;
}

/** Published card definitions, fetched once and shared by every screen. */
export function useCatalog() {
  const [cards, setCards] = useState<CardDefinition[]>([]);
  useEffect(() => {
    let live = true;
    void loadCatalog().then(data => { if (live) setCards(data.cards ?? []); });
    return () => { live = false; };
  }, []);
  return cards;
}

export function usePlayerLeveling(): PlayerLeveling {
  const [table, setTable] = useState(starterLeveling);
  useEffect(() => {
    let live = true;
    void loadCatalog().then(data => { if (live) setTable(resolveLeveling(data.playerLeveling)); });
    return () => { live = false; };
  }, []);
  return table;
}

export function menuTrackUrl(url: string) {
  return url.startsWith('http') ? url : `${apiBase}${url}`;
}

export function useMenuTracks(): MenuMusicTrack[] {
  const [tracks, setTracks] = useState<MenuMusicTrack[]>([]);
  useEffect(() => {
    let live = true;
    void loadCatalog().then(data => { if (live) setTracks(resolveMenuMusic(data.menuMusic).tracks); });
    return () => { live = false; };
  }, []);
  return tracks;
}
