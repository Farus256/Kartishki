import { Client, type Room } from '@colyseus/sdk';
import { MatchState, coinCard, type CardDefinition, type HandCard, type Catalog, type GameEvent, type MatchRewards, type HeroDefinition, starterHeroes } from '@kartishki/shared';
import { playerSession } from './playerSession';
import { serverOrigin } from './serverUrl';
export type Minion = { id: string; cardId: string; owner: string; attack: number; health: number; maxHealth: number; shield: boolean; ready: boolean };
export type Player = { id: string; heroId: string; maxHealth: number; powerUsed: boolean; health: number; mana: number; maxMana: number; handCount: number; deckCount: number; mulliganDone: boolean; connected: boolean };
export type Snapshot = { status: string; phase: string; turn: number; revision: number; activePlayer: string; first: string; phaseEndsAt: number; sessionId: string; error: string; winner: string; players: Player[]; minions: Minion[]; hand: HandCard[]; cards: CardDefinition[]; heroes: HeroDefinition[]; heroOffers: HeroDefinition[] };
const empty = (): Snapshot => ({ status: 'offline', phase: 'start', turn: 0, revision: 0, activePlayer: '', first: '', phaseEndsAt: 0, sessionId: '', error: '', winner: '', players: [], minions: [], hand: [], cards: [], heroes: [], heroOffers: [] });
/** A dropped socket may come back within the server's grace window; the token survives a page reload. */
const RECONNECT_KEY = 'kartishki-match-reconnect';
let snapshot = empty();
const listeners = new Set<() => void>();
const events = new Set<(event: GameEvent) => void>();
let room: Room<MatchState> | undefined;
let generation = 0;
const publish = (patch: Partial<Snapshot>) => { snapshot = { ...snapshot, ...patch }; listeners.forEach(fn => fn()); };
const forget = () => { try { sessionStorage.removeItem(RECONNECT_KEY); } catch { /* optional */ } };
export const session = {
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  onEvent(fn: (event: GameEvent) => void) { events.add(fn); return () => { events.delete(fn); }; },
  getSnapshot: () => snapshot,
  /** True when a reconnection token is waiting: the menu jumps straight back to the table. */
  canResume(): boolean { try { return !!sessionStorage.getItem(RECONNECT_KEY); } catch { return false; } },
  /** resumeOnly: reclaim a seat from the stored token but never queue for a new match (page reload, socket drop). */
  async connect(resumeOnly = false) {
    if (room || snapshot.status === 'connecting') return;
    if (resumeOnly && !session.canResume()) return;
    const attempt = ++generation;
    publish({ ...empty(), status: 'connecting' });
    try {
      const client = new Client(serverOrigin());
      let token = '';
      try { token = sessionStorage.getItem(RECONNECT_KEY) ?? ''; } catch { /* optional */ }
      let joined: Room<MatchState>;
      try { joined = token ? await client.reconnect<MatchState>(token, MatchState) : await client.joinOrCreate<MatchState>('match', playerSession.matchOptions(), MatchState); }
      catch (error) {
        if (!token) throw error;
        forget();
        if (resumeOnly) { if (attempt === generation) publish(empty()); return; }
        joined = await client.joinOrCreate<MatchState>('match', playerSession.matchOptions(), MatchState);
      }
      if (attempt !== generation) { await joined.leave(); return; }
      room = joined;
      try { sessionStorage.setItem(RECONNECT_KEY, joined.reconnectionToken); } catch { /* optional */ }
      const sync = () => {
        if (room !== joined) return;
        const s = joined.state;
        publish({ status: s.status, phase: s.phase, turn: s.turn, revision: s.revision, activePlayer: s.activePlayer, first: s.first ?? '', phaseEndsAt: s.phaseEndsAt ?? 0, sessionId: joined.sessionId, winner: s.winner,
          players: [...s.players].map(([id,p]) => ({ id, heroId: p.heroId, maxHealth: p.maxHealth, powerUsed: p.powerUsed, health: p.health, mana: p.mana, maxMana: p.maxMana ?? p.mana, handCount: p.handCount, deckCount: p.deckCount, mulliganDone: p.mulliganDone === true, connected: p.connected !== false })),
          minions: [...s.minions.values()].map(m => ({ id: m.id, cardId: m.cardId, owner: m.owner, attack: m.attack, health: m.health, maxHealth: m.maxHealth, shield: m.shield, ready: m.ready })), error: '' });
        if (s.status === 'finished') forget();
      };
      joined.onStateChange(sync);
      // The Coin is rendered like any card but never comes from the catalog.
      joined.onMessage('catalog', (catalog: Catalog) => { if (room === joined) publish({ cards: catalog.cards.some(c => c.id === coinCard.id) ? catalog.cards : [...catalog.cards, coinCard], heroes: catalog.heroes ?? starterHeroes }); });
      joined.onMessage('heroOffers', (heroOffers: HeroDefinition[]) => { if (room === joined) publish({ heroOffers }); });
      joined.onMessage('hand', (hand: { cards: HandCard[] }) => { if (room === joined) publish({ hand: hand.cards }); });
      let eventId = 0;
      joined.onMessage('event', (event: GameEvent) => { if (room === joined && event.id > eventId) { eventId = event.id; events.forEach(fn => fn(event)); } });
      joined.onMessage('rewards', (rewards: MatchRewards) => { if (room === joined) playerSession.patchProfile(rewards); });
      joined.onMessage('actionError', () => { if (room === joined) publish({ error: 'rejected' }); });
      joined.onError(() => { if (room === joined) publish({ error: 'connectionError' }); });
      joined.onLeave(code => {
        if (room !== joined) return;
        room = undefined;
        if (snapshot.status === 'finished') { forget(); return; }
        // A consented or clean close is final; an abnormal one keeps the token and reclaims the seat while the server waits
        // (connect() publishes 'connecting', so the table stays on screen instead of falling back to the menu).
        if (code === 4000 || code === 1000 || !session.canResume()) { forget(); publish(empty()); return; }
        void session.connect(true);
      });
      sync(); joined.send('ready');
    } catch (error) { forget(); if (attempt === generation) publish({ ...empty(), error: error instanceof Error && ['chooseDeck','loginRequired','invalidDeck','cardsNotOwned','alreadyInMatch'].includes(error.message) ? error.message : 'connectionError' }); }
  },
  chooseHero(heroId: string) { room?.send('chooseHero', { heroId }); },
  mulligan(replace: string[]) { room?.send('mulligan', { replace }); },
  power(targetId?: string) { room?.send('power', { targetId, expectedRevision: snapshot.revision }); },
  advance() { room?.send('advance', { expectedRevision: snapshot.revision }); },
  play(instanceId: string) { room?.send('play', { instanceId, expectedRevision: snapshot.revision }); },
  attack(attackerId: string, targetId: string) { room?.send('attack', { attackerId, targetId, expectedRevision: snapshot.revision }); },
  leave() { generation++; forget(); const previous = room; room = undefined; void previous?.leave(); publish(empty()); },
};
