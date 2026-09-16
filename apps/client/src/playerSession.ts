import { addBeerMl, beerMlForPlace, beerMlForResult, calibratedRank, isBeerRank, rankFromMl, type BeerRank } from './beerRank';
import { MATCH_DRAW_XP, MATCH_LOSS_XP, MATCH_WIN_XP, XP_AWARDS, type BattlegroundsRewards, type CaseResult, type MatchRewards, type PackResult, type PlayerLibrary, type PlayerLogin, type PlayerSettings, type SavedDeck, type ShopAction, type ShopResult } from '@kartishki/shared';
import { applyPlayerSettings, currentLocalSettings } from './applySettings';
import { serverOrigin } from './serverUrl';

const endpoint = serverOrigin();
const GUEST_RANK_KEY = 'kartishki-beer-rank-v2:guest';
const GUEST_XP_KEY = 'kartishki-player-xp-v1:guest';
export type MatchReward = { elo: number; previousElo: number; gained: number; xpGain?: number };
function loadGuestRank(): BeerRank {
  try { const stored: unknown = JSON.parse(localStorage.getItem(GUEST_RANK_KEY) ?? 'null'); if (isBeerRank(stored)) return stored; } catch { /* keep the calibrated guest bottle */ }
  return calibratedRank();
}
let token = localStorage.getItem('playerToken') ?? '';
function loadGuestXp(): number {
  try { const n = Number(localStorage.getItem(GUEST_XP_KEY)); if (Number.isInteger(n) && n >= 0) return n; } catch { /* keep zero until a write succeeds */ }
  return 0;
}
let snapshot: { beerRank: BeerRank; xp: number; library?: PlayerLibrary; selectedDeck: string; loading: boolean; error: string; lastReward?: MatchReward } = { beerRank: token ? calibratedRank() : loadGuestRank(), xp: token ? 0 : loadGuestXp(), selectedDeck: '', loading: !!token, error: '' };
const listeners = new Set<() => void>();
const publish = (patch: Partial<typeof snapshot>) => { snapshot = { ...snapshot,...patch }; listeners.forEach(fn => fn()); };
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${endpoint}/api/players${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type':'application/json' } : {}) }, ...(body !== undefined ? { body:JSON.stringify(body) } : {}) });
  if (!response.ok) { const data = await response.json().catch(()=>({})); throw new Error(data.error ?? 'playerServerError'); }
  return response.status === 204 ? undefined as T : response.json();
}
function rankFor(profile: PlayerLibrary['profile']) {
  return rankFromMl(profile.beerMl ?? 0, profile.elo);
}
function setLibrary(library: PlayerLibrary, syncSettings = false) {
  const xp = Number(library.profile.xp ?? 0);
  const next = { ...library, profile: { ...library.profile, xp } };
  if (syncSettings && next.profile.settings) applyPlayerSettings(next.profile.settings);
  const preferred = snapshot.selectedDeck || next.profile.settings?.selectedDeck || '';
  const selectedDeck = next.decks.some(d=>d.id===preferred) ? preferred : next.decks[0]?.id ?? '';
  publish({ library: next, selectedDeck, beerRank: rankFor(next.profile), xp });
}
function addCopies(library: PlayerLibrary, ids: string[], currency: number): PlayerLibrary {
  const collection = library.collection.map(row => ({ ...row }));
  for (const id of ids) {
    if (!collection.some(item => item.cardId === id)) collection.push({ cardId: id, copies: 1 });
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
  selectDeck(id: string) { publish({ selectedDeck:id }); if (token) void playerSession.saveSettings({ selectedDeck: id }); },
  async saveSettings(patch: Partial<PlayerSettings>) {
    if (!token || !snapshot.library) return false;
    try { setLibrary(await request<PlayerLibrary>('/settings', 'POST', patch), true); return true; }
    catch (error) { publish({ error: error instanceof Error ? error.message : 'playerServerError' }); return false; }
  },
  patchProfile(rewards: MatchRewards) {
    if (!snapshot.library) return;
    const previousElo = snapshot.library.profile.beerMl ?? 0;
    setLibrary({ ...snapshot.library, profile: { ...snapshot.library.profile, elo: rewards.elo, currency: rewards.currency, xp: rewards.xp ?? snapshot.library.profile.xp, beerMl: rewards.beerMl ?? snapshot.library.profile.beerMl } });
    publish({ lastReward: { elo: rewards.beerMl, previousElo, gained: rewards.gained } });
  },
  addXp(amount: number) {
    if (!(XP_AWARDS as readonly number[]).includes(amount)) return;
    if (snapshot.library) {
      const xp = (snapshot.library.profile.xp ?? 0) + amount;
      setLibrary({ ...snapshot.library, profile: { ...snapshot.library.profile, xp } });
      if (token) void request<PlayerLibrary>('/xp', 'POST', { amount }).then(setLibrary).catch(() => {});
      return;
    }
    const xp = snapshot.xp + amount;
    try { localStorage.setItem(GUEST_XP_KEY, String(xp)); } catch { /* keep session xp in memory */ }
    publish({ xp });
  },
  finishMatch(result: 'win' | 'loss' | 'draw') {
    if (snapshot.library || snapshot.lastReward) return;
    const previousElo = snapshot.beerRank.remainingMl;
    const score = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
    const beerRank = addBeerMl(snapshot.beerRank, beerMlForResult(score));
    const elo = beerRank.remainingMl;
    const xp = snapshot.xp + (result === 'win' ? MATCH_WIN_XP : result === 'draw' ? MATCH_DRAW_XP : MATCH_LOSS_XP);
    try { localStorage.setItem(GUEST_RANK_KEY, JSON.stringify(beerRank)); localStorage.setItem(GUEST_XP_KEY, String(xp)); } catch { /* memory rank still updates */ }
    publish({ beerRank, xp, lastReward: { elo, previousElo, gained: 0 } });
  },
  finishBattlegrounds(rewards: BattlegroundsRewards) {
    if (snapshot.lastReward) return;
    if (snapshot.library && (rewards.xp > 0 || rewards.elo > 0 || rewards.beerMl > 0 || rewards.currency > 0 || rewards.gained > 0)) {
      const previousElo = snapshot.library.profile.beerMl ?? 0;
      setLibrary({ ...snapshot.library, profile: { ...snapshot.library.profile, elo: rewards.elo, currency: rewards.currency, xp: rewards.xp, beerMl: rewards.beerMl ?? snapshot.library.profile.beerMl } });
      publish({ lastReward: { elo: rewards.beerMl, previousElo, gained: rewards.gained, xpGain: rewards.xpGain } });
      return;
    }
    if (snapshot.library) return;
    const previousElo = snapshot.beerRank.remainingMl;
    const beerRank = addBeerMl(snapshot.beerRank, rewards.beerMlGain ?? beerMlForPlace(rewards.place, 8));
    const elo = beerRank.remainingMl;
    const xp = snapshot.xp + rewards.xpGain;
    try { localStorage.setItem(GUEST_RANK_KEY, JSON.stringify(beerRank)); localStorage.setItem(GUEST_XP_KEY, String(xp)); } catch { /* memory rank still updates */ }
    publish({ beerRank, xp, lastReward: { elo, previousElo, gained: rewards.gained, xpGain: rewards.xpGain } });
  },
  authOptions() { return token ? { playerToken: token } : {}; },
  clearMatchReward() { publish({ lastReward: undefined }); },
  async authenticate(action: 'register'|'login', username: string, password: string) {
    await run(async()=>{
      const result = await request<PlayerLogin>(`/${action}`,'POST',{username,password});
      token=result.token; localStorage.setItem('playerToken',token);
      if (action === 'register') {
        setLibrary(result.library);
        await playerSession.saveSettings(currentLocalSettings());
      } else setLibrary(result.library, true);
    });
  },
  async refresh() { await run(async()=>setLibrary(await request<PlayerLibrary>('/me'), true)); },
  async logout() { await run(async()=>{ await request('/logout','POST'); token=''; localStorage.removeItem('playerToken'); publish({library:undefined,selectedDeck:'',beerRank:loadGuestRank(), xp: loadGuestXp(), lastReward: undefined}); }); },
  async claimDaily() { await run(async()=>setLibrary(await request<PlayerLibrary>('/daily','POST',{}))); },
  /** Buys a table preset, hero frame or premium hero once; prices live on the server. */
  async buyCosmetic(itemId: string) {
    if (!token || !snapshot.library) return false;
    let ok = false;
    await run(async()=>{ setLibrary(await request<PlayerLibrary>('/unlocks','POST',{ itemId })); ok = true; });
    return ok;
  },
  async changeCurrency(delta: number) {
    if (!token || !snapshot.library || !Number.isInteger(delta)) return false;
    if (!delta) return true;
    try { setLibrary(await request<PlayerLibrary>('/wallet', 'POST', { delta })); return true; }
    catch (error) { publish({ error: error instanceof Error ? error.message : 'playerServerError' }); return false; }
  },
  async openPack() {
    let result: PackResult | undefined;
    await run(async()=>{ result = await request<PackResult>('/packs','POST',{}); setLibrary({ ...addCopies(snapshot.library!, result.cards.map(card => card.id), result.currency), profile: { ...snapshot.library!.profile, currency: result.currency, xp: result.xp } }); });
    return result;
  },
  async openCase() {
    let result: CaseResult | undefined;
    await run(async()=>{ result = await request<CaseResult>('/cases','POST',{}); setLibrary({ ...addCopies(snapshot.library!, [result.prize.id], result.currency), profile: { ...snapshot.library!.profile, currency: result.currency, xp: result.xp } }); });
    return result;
  },
  grantXp(amount: number) {
    if (!Number.isInteger(amount) || amount <= 0 || snapshot.library) return;
    const xp = snapshot.xp + amount;
    try { localStorage.setItem(GUEST_XP_KEY, String(xp)); } catch { /* keep session xp in memory */ }
    publish({ xp });
  },
  async shop(action: ShopAction) {
    if (!token || !snapshot.library) return;
    let payload: { result: ShopResult; library: PlayerLibrary } | undefined;
    await run(async () => { payload = await request<{ result: ShopResult; library: PlayerLibrary }>('/shop', 'POST', action); setLibrary(payload.library); });
    return payload;
  },
  async saveDeck(deck: { id?: string; name: string; cards: string[]; version?: number }) {
    await run(async()=>{
      const saved = await request<SavedDeck>('/decks','PUT',deck);
      const library=snapshot.library!;
      setLibrary({...library,decks:[...library.decks.filter(d=>d.id!==saved.id),saved]});
      publish({selectedDeck:saved.id});
      void playerSession.saveSettings({ selectedDeck: saved.id });
    });
  },
  async deleteDeck(deck: SavedDeck) {
    await run(async()=>{
      await request(`/decks/${deck.id}`,'DELETE',{version:deck.version});
      setLibrary({...snapshot.library!,decks:snapshot.library!.decks.filter(d=>d.id!==deck.id)});
      if (snapshot.selectedDeck) void playerSession.saveSettings({ selectedDeck: snapshot.selectedDeck });
    });
  },
  matchOptions() {
    if (!token) return {};
    if (!snapshot.library || !snapshot.selectedDeck) throw new Error('chooseDeck');
    return { playerToken:token,deckId:snapshot.selectedDeck };
  },
};
if (token) {
  void request<PlayerLibrary>('/me').then(library => setLibrary(library, true)).catch(error=>{
    if (error.message === 'loginRequired') { token=''; localStorage.removeItem('playerToken'); }
    publish({error:error.message});
  }).finally(()=>publish({loading:false}));
}
