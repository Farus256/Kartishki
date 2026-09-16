import { useEffect, useState } from 'react';
import type { CardSet } from '@kartishki/shared';
import { serverOrigin } from './serverUrl';
const apiBase = serverOrigin();

/** The Workshop set the player picked ('' = starter tavern). It follows them everywhere: menu, music, levels, tables. */
export const AB_SET_KEY = 'kartishki-ab-set';
const CHANGED = 'card-set-changed';

export function chosenCardSet(): string { try { return localStorage.getItem(AB_SET_KEY) ?? ''; } catch { return ''; } }
export function rememberCardSet(setId: string): void {
  try { if (setId) localStorage.setItem(AB_SET_KEY, setId); else localStorage.removeItem(AB_SET_KEY); } catch { /* optional */ }
  window.dispatchEvent(new Event(CHANGED));
}

const cache = new Map<string, Promise<CardSet | null>>();
function loadSet(id: string): Promise<CardSet | null> {
  if (!cache.has(id)) cache.set(id, fetch(`${apiBase}/api/card-sets/${id}`).then(r => r.ok ? r.json() : null).then((data: { set?: CardSet } | null) => data?.set ?? null).catch(() => null));
  return cache.get(id)!;
}
/** A published set changed on the server (the editor republished it): forget the cached copy. */
export function forgetCardSet(id: string): void { cache.delete(id); }

/** The full picked set (null for the starter tavern or while loading); re-reads when the pick changes. */
export function useActiveCardSet(): CardSet | null {
  const [set, setSet] = useState<CardSet | null>(null);
  useEffect(() => {
    let live = true;
    const read = () => { const id = chosenCardSet(); if (!id) { setSet(null); return; } void loadSet(id).then(data => { if (live && chosenCardSet() === id) setSet(data); }); };
    read();
    window.addEventListener(CHANGED, read);
    window.addEventListener('storage', read);
    return () => { live = false; window.removeEventListener(CHANGED, read); window.removeEventListener('storage', read); };
  }, []);
  return set;
}
