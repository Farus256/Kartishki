import { Room, ServerError, type Client } from '@colyseus/core';
import { MatchState, PlayerState } from '@kartishki/shared';
import { Battle } from './Battle';
import { catalogStore } from './catalog';
import { PlayerError, type PlayerStore } from './players';

type MatchAuth = { playerId?: string; cards?: string[] };

export class MatchRoom extends Room<{ state: MatchState }> {
  protected playerStore?: PlayerStore;
  private selectedDecks = new Map<string, string[]>();
  private playerIds = new Map<string, string>();
  private settled = false;
  maxClients = 2;
  state = new MatchState();
  private catalog = catalogStore.snapshot();
  private readyClients = new Set<string>();
  private battle = new Battle(this.state, this.catalog.cards, event => { for (const client of this.clients) if (this.readyClients.has(client.sessionId)) client.send('event', event); });
  private syncHands() { for (const client of this.clients) if (this.readyClients.has(client.sessionId)) client.send('hand', { revision: this.state.revision, cards: this.battle.hands.get(client.sessionId) ?? [] }); }
  async onAuth(_client: Client, options: { playerToken?: unknown; deckId?: unknown } = {}): Promise<MatchAuth> {
    if (options.playerToken === undefined && options.deckId === undefined) return {};
    try {
      if (!this.playerStore) throw new PlayerError('loginRequired',401);
      const playerId = await this.playerStore.authenticate(options.playerToken);
      return { playerId, cards: await this.playerStore.matchDeck(playerId,options.deckId,this.catalog.cards) };
    } catch (error) {
      if (error instanceof PlayerError) throw new ServerError(error.status,error.code);
      throw error;
    }
  }
  onCreate() {
    this.state.catalogVersion = this.catalog.version;
    for (const action of ['advance', 'play', 'attack'] as const) {
      this.onMessage(action, (client, input: unknown) => {
        if (!this.battle[action](client.sessionId, input)) client.send('actionError', 'rejected');
        else { this.syncHands(); void this.persistResult(); }
      });
    }
    this.onMessage('ready', client => { if (this.readyClients.has(client.sessionId)) return; this.readyClients.add(client.sessionId); client.send('catalog', this.catalog); this.syncHands(); });
  }
  onJoin(client: Client, _options?: unknown, auth: MatchAuth = {}) {
    if (auth.playerId) {
      if ([...this.playerIds.values()].includes(auth.playerId)) throw new ServerError(409,'alreadyInMatch');
      this.playerIds.set(client.sessionId,auth.playerId);
      this.selectedDecks.set(client.sessionId,auth.cards!);
    }
    this.state.players.set(client.sessionId, new PlayerState());
    if (this.state.players.size === 2) {
      void this.lock();
      this.state.status = 'active';
      this.state.activePlayer = this.state.players.keys().next().value!;
      this.state.turn = 1;
      this.state.players.get(this.state.activePlayer)!.mana = 1;
      this.battle.start(this.selectedDecks);
      this.state.revision++;
      this.syncHands();
    }
  }
  onLeave(client: Client) {
    this.readyClients.delete(client.sessionId);
    if (this.state.status === 'active') {
      this.state.status = 'finished';
      this.state.players.delete(client.sessionId);
      this.state.winner = this.state.players.keys().next().value ?? '';
      this.state.revision++;
      void this.persistResult();
    } else this.state.players.delete(client.sessionId);
    this.playerIds.delete(client.sessionId);
    this.selectedDecks.delete(client.sessionId);
  }
  private async persistResult() {
    if (this.settled || this.state.status !== 'finished' || !this.playerStore) return;
    const pair = [...this.playerIds.entries()];
    if (pair.length !== 2) return;
    this.settled = true;
    const winnerPlayer = this.state.winner ? this.playerIds.get(this.state.winner) ?? '' : '';
    try {
      const rewards = await this.playerStore.settleMatch(pair[0][1], pair[1][1], winnerPlayer);
      for (const [sessionId, playerId] of pair) {
        const row = rewards[playerId], client = this.clients.find(item => item.sessionId === sessionId);
        if (row && client) client.send('rewards', row);
      }
    } catch (error) { console.error('Failed to persist match result', error); }
  }
}

export function matchRoomWithPlayers(store: PlayerStore) {
  return class extends MatchRoom { protected playerStore = store; };
}
