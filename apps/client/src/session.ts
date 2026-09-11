import { Client, type Room } from '@colyseus/sdk';
import { MatchState, type CardDefinition, type HandCard, type Catalog, type GameEvent, type MatchRewards } from '@kartishki/shared';
import { playerSession } from './playerSession';
export type Minion = { id: string; cardId: string; owner: string; attack: number; health: number; maxHealth: number; shield: boolean; ready: boolean };
export type Player = { id: string; health: number; mana: number; handCount: number; deckCount: number };
export type Snapshot = { status: string; phase: string; turn: number; revision: number; activePlayer: string; sessionId: string; error: string; winner: string; players: Player[]; minions: Minion[]; hand: HandCard[]; cards: CardDefinition[] };
const empty = (): Snapshot => ({ status: 'offline', phase: 'start', turn: 0, revision: 0, activePlayer: '', sessionId: '', error: '', winner: '', players: [], minions: [], hand: [], cards: [] });
let snapshot = empty();
const listeners = new Set<() => void>();
const events = new Set<(event: GameEvent) => void>();
let room: Room<MatchState> | undefined;
let generation = 0;
const publish = (patch: Partial<Snapshot>) => { snapshot = { ...snapshot, ...patch }; listeners.forEach(fn => fn()); };
export const session = {
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  onEvent(fn: (event: GameEvent) => void) { events.add(fn); return () => { events.delete(fn); }; },
  getSnapshot: () => snapshot,
  async connect() {
    if (room || snapshot.status === 'connecting') return;
    const attempt = ++generation;
    publish({ ...empty(), status: 'connecting' });
    try {
      const joined = await new Client(import.meta.env.VITE_SERVER_URL ?? 'http://127.0.0.1:2567').joinOrCreate<MatchState>('match', playerSession.matchOptions(), MatchState);
      if (attempt !== generation) { await joined.leave(); return; }
      room = joined;
      const sync = () => {
        if (room !== joined) return;
        const s = joined.state;
        publish({ status: s.status, phase: s.phase, turn: s.turn, revision: s.revision, activePlayer: s.activePlayer, sessionId: joined.sessionId, winner: s.winner,
          players: [...s.players].map(([id,p]) => ({ id, health: p.health, mana: p.mana, handCount: p.handCount, deckCount: p.deckCount })),
          minions: [...s.minions.values()].map(m => ({ id: m.id, cardId: m.cardId, owner: m.owner, attack: m.attack, health: m.health, maxHealth: m.maxHealth, shield: m.shield, ready: m.ready })), error: '' });
      };
      joined.onStateChange(sync);
      joined.onMessage('catalog', (catalog: Catalog) => { if (room === joined) publish({ cards: catalog.cards }); });
      joined.onMessage('hand', (hand: { cards: HandCard[] }) => { if (room === joined) publish({ hand: hand.cards }); });
      let eventId = 0;
      joined.onMessage('event', (event: GameEvent) => { if (room === joined && event.id > eventId) { eventId = event.id; events.forEach(fn => fn(event)); } });
      joined.onMessage('rewards', (rewards: MatchRewards) => { if (room === joined) playerSession.patchProfile(rewards); });
      joined.onMessage('actionError', () => { if (room === joined) publish({ error: 'rejected' }); });
      joined.onError(() => { if (room === joined) publish({ error: 'connectionError' }); });
      joined.onLeave(() => { if (room === joined) { room = undefined; publish(empty()); } });
      sync(); joined.send('ready');
    } catch (error) { if (attempt === generation) publish({ ...empty(), error: error instanceof Error && ['chooseDeck','loginRequired','invalidDeck','cardsNotOwned','alreadyInMatch'].includes(error.message) ? error.message : 'connectionError' }); }
  },
  advance() { room?.send('advance', { expectedRevision: snapshot.revision }); },
  play(instanceId: string) { room?.send('play', { instanceId, expectedRevision: snapshot.revision }); },
  attack(attackerId: string, targetId: string) { room?.send('attack', { attackerId, targetId, expectedRevision: snapshot.revision }); },
  leave() { generation++; const previous = room; room = undefined; void previous?.leave(); publish(empty()); },
};
