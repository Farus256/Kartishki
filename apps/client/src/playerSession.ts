import { calibratedRank, isBeerRank, updateBeerRank, type BeerRank } from './beerRank';
import type { CaseResult, MatchRewards, PackResult, PlayerLibrary, PlayerLogin, SavedDeck } from '@kartishki/shared';

const endpoint = (import.meta.env.VITE_SERVER_URL ?? 'http://127.0.0.1:2567').replace(/^ws/,'http');
let token = localStorage.getItem('playerToken') ?? '';
let snapshot: { beerRank: BeerRank; library?: PlayerLibrary; selectedDeck: string; loading: boolean; error: string } = { beerRank: calibratedRank(), selectedDeck: '', loading: !!token, error: '' };
const listeners = new Set<() => void>();
const publish = (patch: Partial<typeof snapshot>) => { snapshot = { ...snapshot,...patch }; listeners.forEach(fn => fn()); };
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${endpoint}/api/players${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type':'application/json' } : {}) }, ...(body !== undefined ? { body:JSON.stringify(body) } : {}) });
  if (!response.ok) { const data = await response.json().catch(()=>({})); throw new Error(data.error ?? 'playerServerError'); }
  return response.status === 204 ? undefined as T : response.json();
}
const rankCache = new Map<string, BeerRank>();
function rankFor(profile: PlayerLibrary['profile']) {
  const key = 'kartishki-beer-rank-v1:' + profile.id;
  let previous = rankCache.get(profile.id);
  if (!previous) {
    try { const stored: unknown = JSON.parse(localStorage.getItem(key) ?? 'null'); if (isBeerRank(stored)) previous = stored; } catch { /* optional local persistence */ }
  }
  const rank = updateBeerRank(previous ?? calibratedRank(profile.elo), profile.elo);
  rankCache.set(profile.id, rank);
  try { localStorage.setItem(key, JSON.stringify(rank)); } catch { /* keep session progress in memory */ }
  return rank;
}
function setLibrary(library: PlayerLibrary) {
  const selectedDeck = library.decks.some(d=>d.id===snapshot.selectedDeck) ? snapshot.selectedDeck : library.decks[0]?.id ?? '';
  publish({ library, selectedDeck, beerRank: rankFor(library.profile) });
}
function addCopies(library: PlayerLibrary, ids: string[], currency: number): PlayerLibrary {
  const collection = library.collection.map(row => ({ ...row }));
  for (const id of ids) {
    const row = collection.find(item => item.cardId === id);
    if (row) row.copies++; else collection.push({ cardId: id, copies: 1 });
  }
  return { ...library, profile: { ...library.profile, currency }, collection };
}
async function run(action: () => Promise<void>) {
  if (snapshot.loading) return;
  publish({ loading:true,error:'' });
  try { await action(); } catch (error) { publish({error:error instanceof Error?error.message:'playerServerError'}); }
  finally { publish({ loading:false }); }
}
export const playerSession = {
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  getSnapshot: () => snapshot,
  selectDeck(id: string) { publish({ selectedDeck:id }); },
  patchProfile(rewards: MatchRewards) {
    if (!snapshot.library) return;
    setLibrary({ ...snapshot.library, profile: { ...snapshot.library.profile, elo: rewards.elo, currency: rewards.currency } });
  },
  async authenticate(action: 'register'|'login', username: string, password: string) {
    await run(async()=>{ const result = await request<PlayerLogin>(`/${action}`,'POST',{username,password}); token=result.token; localStorage.setItem('playerToken',token); setLibrary(result.library); });
  },
  async refresh() { await run(async()=>setLibrary(await request<PlayerLibrary>('/me'))); },
  async logout() { await run(async()=>{ await request('/logout','POST'); token=''; localStorage.removeItem('playerToken'); publish({library:undefined,selectedDeck:'',beerRank:calibratedRank()}); }); },
  async claimDaily() { await run(async()=>setLibrary(await request<PlayerLibrary>('/daily','POST',{}))); },
  async openPack() {
    let result: PackResult | undefined;
    await run(async()=>{ result = await request<PackResult>('/packs','POST',{}); setLibrary(addCopies(snapshot.library!, result.cards.map(card => card.id), result.currency)); });
    return result;
  },
  async openCase() {
    let result: CaseResult | undefined;
    await run(async()=>{ result = await request<CaseResult>('/cases','POST',{}); setLibrary(addCopies(snapshot.library!, [result.prize.id], result.currency)); });
    return result;
  },
  async saveDeck(deck: { id?: string; name: string; cards: string[]; version?: number }) {
    await run(async()=>{
      const saved = await request<SavedDeck>('/decks','PUT',deck);
      const library=snapshot.library!;
      setLibrary({...library,decks:[...library.decks.filter(d=>d.id!==saved.id),saved]});
      publish({selectedDeck:saved.id});
    });
  },
  async deleteDeck(deck: SavedDeck) { await run(async()=>{ await request(`/decks/${deck.id}`,'DELETE',{version:deck.version}); setLibrary({...snapshot.library!,decks:snapshot.library!.decks.filter(d=>d.id!==deck.id)}); }); },
  matchOptions() {
    if (!token) return {};
    if (!snapshot.library || !snapshot.selectedDeck) throw new Error('chooseDeck');
    return { playerToken:token,deckId:snapshot.selectedDeck };
  },
};
if (token) {
  void request<PlayerLibrary>('/me').then(setLibrary).catch(error=>{
    if (error.message === 'loginRequired') { token=''; localStorage.removeItem('playerToken'); }
    publish({error:error.message});
  }).finally(()=>publish({loading:false}));
}
