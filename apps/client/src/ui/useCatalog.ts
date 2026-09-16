import { useEffect, useState } from 'react';
import { defaultShop, resolveLeveling, resolveMenuMusic, resolveShop, starterAutoBattlerHeroes, type AutoBattlerHeroDef, type CardDefinition, type CardSetSummary, type Catalog, type MenuMusicTrack, type PlayerLeveling, type ShopConfig, starterLeveling } from '@kartishki/shared';
import { serverOrigin } from '../serverUrl';
import { useActiveCardSet } from '../activeCardSet';

export const apiBase = serverOrigin();

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

/** The level ladder: the picked card set's own when it has one, else the server's. */
export function usePlayerLeveling(): PlayerLeveling {
  const [table, setTable] = useState(starterLeveling);
  const set = useActiveCardSet();
  useEffect(() => {
    let live = true;
    void loadCatalog().then(data => { if (live) setTable(resolveLeveling(data.playerLeveling)); });
    return () => { live = false; };
  }, []);
  // A set's ladder is used as-is: its row count is its level count.
  return set?.theme?.leveling ? { ...set.theme.leveling, battlegroundsElo: table.battlegroundsElo } : table;
}

export function menuTrackUrl(url: string) {
  return new URL(url, `${apiBase}/`).href;
}

/** Menu playlist: the picked card set's own when it has one, else the server's. */
export function useMenuTracks(): MenuMusicTrack[] {
  const [tracks, setTracks] = useState<MenuMusicTrack[]>([]);
  const set = useActiveCardSet();
  useEffect(() => {
    let live = true;
    void loadCatalog().then(data => { if (live) setTracks(resolveMenuMusic(data.menuMusic).tracks); });
    return () => { live = false; };
  }, []);
  return set?.theme?.menuMusic?.length ? set.theme.menuMusic : tracks;
}

export function useAbHeroes(): AutoBattlerHeroDef[] {
  const [heroes, setHeroes] = useState<AutoBattlerHeroDef[]>(starterAutoBattlerHeroes);
  useEffect(() => {
    let live = true;
    void loadCatalog().then(data => { if (live && data.autoBattlerHeroes?.length) setHeroes(data.autoBattlerHeroes); });
    return () => { live = false; };
  }, []);
  return heroes;
}

/** Workshop sets published on this server (summaries only; the room loads the full set). */
export function useCardSets(): CardSetSummary[] {
  const [sets, setSets] = useState<CardSetSummary[]>([]);
  useEffect(() => {
    let live = true;
    void fetch(`${apiBase}/api/card-sets`).then(r => r.ok ? r.json() : []).then(data => { if (live && Array.isArray(data)) setSets(data); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return sets;
}

export function useShopConfig(): ShopConfig {
  const [shop, setShop] = useState(defaultShop);
  useEffect(() => {
    let live = true;
    void loadCatalog().then(data => { if (live) setShop(resolveShop(data.shop)); });
    return () => { live = false; };
  }, []);
  return shop;
}
