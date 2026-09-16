import { randomInt } from 'node:crypto';
import { CloseCode, Room, ServerError, type Client } from '@colyseus/core';
import { MATCH_RULES, MatchState, PlayerState, starterHeroes, type HeroDefinition } from '@kartishki/shared';
import { Battle } from './Battle';
import { catalogStore } from './catalog';
import { PlayerError, type PlayerStore } from './players';

type MatchAuth = { playerId?: string; cards?: string[] };

/**
 * One duel. Hero pick, mulligan and every turn run on the room clock (MATCH_RULES) so a stalled opponent never
 * holds the table; a dropped socket gets a reconnection window, a consented leave is a concession.
 */
export class MatchRoom extends Room<{ state: MatchState }> {
  protected playerStore?: PlayerStore;
  private selectedDecks = new Map<string, string[]>();
  private playerIds = new Map<string, string>();
  private settled = false;
  maxClients = 2;
  state = new MatchState();
  private catalog = catalogStore.snapshot();
  private heroOffers = new Map<string, HeroDefinition[]>();
  private readyClients = new Set<string>();
  private deadline?: { clear(): void };
  private testMode = process.env.AB_TEST_MODE === '1' && process.env.NODE_ENV !== 'production';
  private turnMs: number = MATCH_RULES.TURN_MS;
  private pickMs: number = MATCH_RULES.HERO_MS;
  private battle = new Battle(this.state, this.catalog.cards, event => { for (const client of this.clients) if (this.readyClients.has(client.sessionId)) client.send('event', event); }, this.catalog.heroes ?? starterHeroes);
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
  onCreate(options: { turnMs?: unknown; pickMs?: unknown } = {}) {
    this.clock.start();
    this.state.catalogVersion = this.catalog.version;
    // Tests shorten the clocks; a real table always plays the standard pace.
    if (this.testMode && typeof options.turnMs === 'number' && Number.isFinite(options.turnMs)) this.turnMs = Math.max(200, Math.floor(options.turnMs));
    if (this.testMode && typeof options.pickMs === 'number' && Number.isFinite(options.pickMs)) this.pickMs = Math.max(200, Math.floor(options.pickMs));
    for (const action of ['play', 'attack', 'power'] as const) {
      this.onMessage(action, (client, input: unknown) => {
        if (!this.battle[action](client.sessionId, input)) client.send('actionError', 'rejected');
        else { this.syncHands(); this.afterAction(); }
      });
    }
    this.onMessage('advance', (client, input: unknown) => {
      if (!this.battle.advance(client.sessionId, input)) { client.send('actionError', 'rejected'); return; }
      this.syncHands(); this.startTurnClock(); this.afterAction();
    });
    this.onMessage('mulligan', (client, input: unknown) => {
      if (!this.battle.mulligan(client.sessionId, input)) { client.send('actionError', 'rejected'); return; }
      this.syncHands();
      if ([...this.state.players.values()].every(p => p.mulliganDone)) this.beginMatch();
    });
    this.onMessage('chooseHero', (client, input: unknown) => {
      const player = this.state.players.get(client.sessionId);
      const id = input && typeof input === 'object' && 'heroId' in input ? input.heroId : '';
      const hero = this.heroOffers.get(client.sessionId)?.find(h => h.id === id);
      if (this.state.status !== 'selecting' || !player || player.heroId || !hero) { client.send('actionError', 'rejected'); return; }
      this.applyHero(player, hero);
      if ([...this.state.players.values()].every(p => p.heroId)) this.beginMulligan();
    });
    this.onMessage('ready', client => { if (this.readyClients.has(client.sessionId)) return; this.readyClients.add(client.sessionId); client.send('catalog', this.catalog); client.send('heroOffers', this.heroOffers.get(client.sessionId) ?? []); this.syncHands(); });
  }
  onDispose() { this.deadline?.clear(); }
  private applyHero(player: InstanceType<typeof PlayerState>, hero: HeroDefinition) {
    player.heroId = hero.id; player.health = player.maxHealth = hero.health; this.state.revision++;
  }
  private clock_(ms: number, fn: () => void) {
    this.deadline?.clear();
    this.state.phaseEndsAt = Date.now() + ms;
    this.deadline = this.clock.setTimeout(fn, ms);
  }
  private beginSelection() {
    void this.lock();
    this.state.status = 'selecting';
    this.state.revision++;
    // A pick that never comes takes the first offer.
    this.clock_(this.pickMs, () => {
      if (this.state.status !== 'selecting') return;
      for (const [id, player] of this.state.players) { const offer = this.heroOffers.get(id)?.[0]; if (!player.heroId && offer) this.applyHero(player, offer); }
      this.beginMulligan();
    });
  }
  private beginMulligan() {
    if (this.state.status !== 'selecting') return;
    // Who goes first is a coin flip; the other side pockets The Coin.
    const ids = [...this.state.players.keys()];
    this.state.first = ids[randomInt(ids.length)]!;
    this.state.activePlayer = this.state.first;
    this.state.status = 'mulligan';
    this.state.revision++;
    this.battle.start(this.selectedDecks);
    this.syncHands();
    this.clock_(this.testMode ? Math.min(MATCH_RULES.MULLIGAN_MS, this.pickMs) : MATCH_RULES.MULLIGAN_MS, () => { if (this.state.status === 'mulligan') this.beginMatch(); });
  }
  private beginMatch() {
    if (this.state.status !== 'mulligan') return;
    this.battle.finishMulligan();
    this.syncHands();
    this.startTurnClock();
    this.afterAction();
  }
  /** The turn clock: when it runs out the active player's turn ends on its own (the rope burns its last ROPE_MS). */
  private startTurnClock() {
    if (this.state.status !== 'active') return;
    this.clock_(this.turnMs, () => {
      if (this.state.status !== 'active') return;
      if (this.battle.advance(this.state.activePlayer, { expectedRevision: this.state.revision })) { this.syncHands(); this.startTurnClock(); this.afterAction(); }
    });
  }
  private afterAction() {
    if (this.state.status === 'finished') { this.deadline?.clear(); this.state.phaseEndsAt = 0; void this.persistResult(); }
  }
  onJoin(client: Client, _options?: unknown, auth: MatchAuth = {}) {
    if (auth.playerId) {
      if ([...this.playerIds.values()].includes(auth.playerId)) throw new ServerError(409,'alreadyInMatch');
      this.playerIds.set(client.sessionId,auth.playerId);
      this.selectedDecks.set(client.sessionId,auth.cards!);
    }
    this.state.players.set(client.sessionId, new PlayerState());
    const pool = [...(this.catalog.heroes ?? starterHeroes)];
    for (let i = pool.length - 1; i > 0; i--) { const j = randomInt(i + 1); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
    this.heroOffers.set(client.sessionId, pool.slice(0, 2));
    if (this.state.players.size === 2) this.beginSelection();
  }
  onReconnect(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
    // The client's ready handshake asks for the catalog, offers and hand again once its handlers are attached.
    this.readyClients.delete(client.sessionId);
  }
  async onLeave(client: Client, code?: number) {
    this.readyClients.delete(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    const live = this.state.status === 'active' || this.state.status === 'selecting' || this.state.status === 'mulligan';
    if (player && live && code !== CloseCode.CONSENTED) {
      player.connected = false;
      try {
        await this.allowReconnection(client, MATCH_RULES.RECONNECT_S);
        player.connected = true;
        return;
      } catch { /* the window closed: the seat is conceded below */ }
    }
    this.heroOffers.delete(client.sessionId);
    if (live && this.state.status !== 'finished') {
      // The seat stays on the table (portrait, final numbers); the other side wins.
      this.state.status = 'finished';
      if (player) player.connected = false;
      this.state.winner = [...this.state.players.keys()].find(id => id !== client.sessionId) ?? '';
      this.state.revision++;
      this.afterAction();
    } else if (this.state.status !== 'finished') this.state.players.delete(client.sessionId);
    this.playerIds.delete(client.sessionId);
    this.selectedDecks.delete(client.sessionId);
  }
  private async persistResult() {
    if (this.settled || this.state.status !== 'finished' || !this.playerStore) return;
    const pair = [...this.playerIds.entries()];
    if (!pair.length) return;
    this.settled = true;
    try {
      if (pair.length === 2) {
        const winnerPlayer = this.state.winner ? this.playerIds.get(this.state.winner) ?? '' : '';
        const rewards = await this.playerStore.settleMatch(pair[0]![1], pair[1]![1], winnerPlayer);
        for (const [sessionId, playerId] of pair) {
          const row = rewards[playerId], client = this.clients.find(item => item.sessionId === sessionId);
          if (row && client) client.send('rewards', row);
        }
      } else {
        const [sessionId, playerId] = pair[0]!;
        const score = !this.state.winner ? 0.5 : this.playerIds.get(this.state.winner) === playerId ? 1 : 0;
        const row = await this.playerStore.settleVs(playerId, score);
        const client = this.clients.find(item => item.sessionId === sessionId);
        if (client) client.send('rewards', row);
      }
    } catch (error) {
      this.settled = false;
      console.error('Failed to persist match result', error);
    }
  }
}

export function matchRoomWithPlayers(store: PlayerStore) {
  return class extends MatchRoom { protected playerStore = store; };
}
