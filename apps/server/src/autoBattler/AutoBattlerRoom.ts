import { randomInt } from 'node:crypto';
import { StateView } from '@colyseus/schema';
import { catalogStore } from '../catalog';
import { CloseCode, Room, ServerError, type Client } from '@colyseus/core';
import {
  AB_ANOMALIES,
  AUTO_BATTLER,
  catalogFromCardSet,
  pickMatchTribes,
  restrictCatalogToTribes,
  AUTO_BATTLER_CLIENT_EVENTS as EV,
  AUTO_BATTLER_MESSAGES as MSG,
  AutoBattlerPlayerState,
  AutoBattlerRoomState,
  CombatPairState,
  battlegroundsCurrencyReward,
  DEFAULT_BATTLEGROUNDS_ELO,
  HeroState,
  battlegroundsXp,
  beerMlForPlace,
  initialUpgradeCost,
  resolveAutoBattlerCatalog,
  resolveLeveling,
  tavernSizeForTier,
  type ActionErrorCode,
  type AutoBattlerCatalog,
  type AutoBattlerHeroDef,
  type BattlegroundsRewards,
  type CombatEvent,
  type CombatEventsMessage,
  type DiscoverOptionsMessage,
  boardMainTribe,
} from '@kartishki/shared';
import { PlayerError, type PlayerStore } from '../players';
import { resolveCombat, snapshotBoard } from './combat';
import { errorPayload, ok } from './errors';
import { createDefaultRegistry } from './keywords';
import { abLog } from './logger';
import { planPairing } from './pairing';
import { applyPlayerDamage } from './playerDamage';
import { SharedMinionPool } from './pool';
import { DEFAULT_RULES, type TavernRules } from './effects';
import {
  beginRecruitTurn,
  endRecruitTurn,
  returnOwnedMinionsToPool,
  tryBuy,
  tryDiscoverPick,
  tryFreeze,
  tryHeroPower,
  tryMoveBoard,
  tryPlayCard,
  tryReroll,
  trySell,
  tryTierUp,
} from './recruit';
import { createRng, hashSeed } from './rng';
import type { ActionResult } from './errors';

function readString(input: unknown, key: string): string | undefined {
  if (!input || typeof input !== 'object' || !(key in input)) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' && value ? value : undefined;
}

function readNumber(input: unknown, key: string): number | undefined {
  if (!input || typeof input !== 'object' || !(key in input)) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export class AutoBattlerRoom extends Room<{ state: AutoBattlerRoomState }> {
  protected playerStore?: PlayerStore;
  maxClients = AUTO_BATTLER.MAX_PLAYERS;
  state = new AutoBattlerRoomState();
  private readonly playerIds = new Map<string, string>();
  private readonly settledIds = new Set<string>();
  /** Seats forfeited by walking out (consented leave or reconnection grace expired), not by dying. */
  private readonly leftIds = new Set<string>();

  /** One catalog clone per room: the tavern and the leveling table are both read from it. */
  private readonly published = catalogStore.snapshot();
  /** The starter tavern, or the Workshop set the table was created with (see onCreate). */
  private catalog: AutoBattlerCatalog = resolveAutoBattlerCatalog(this.published);
  /** 1st-place beer from the editor's leveling table; last place loses as much. */
  private readonly ratingAmount = resolveLeveling(this.published.playerLeveling).battlegroundsElo ?? DEFAULT_BATTLEGROUNDS_ELO;
  private pool = new SharedMinionPool(this.catalog);
  private registry = createDefaultRegistry(this.catalog.minions);
  /** Per seat: bought heroes and the equipped skin of the account behind it (guests get the free roster, no skin). */
  private readonly seatCosmetics = new Map<string, { heroSkin: string; heroSlam: string; nameFx: string; portraitFx: string; cardBack: string }>();
  private readonly heroOffers = new Map<string, AutoBattlerHeroDef[]>();
  private readonly readyClients = new Set<string>();
  private readonly lastBoards = new Map<string, ReturnType<typeof snapshotBoard>>();
  private readonly lastCombat = new Map<string, CombatEventsMessage>();
  private serial = 0;
  private recruitMs: number = AUTO_BATTLER.RECRUIT_MS;
  private heroMs: number = AUTO_BATTLER.HERO_SELECT_MS;
  private debug = false;
  private testCombatMs?: number;
  private testMode = false;
  private recruitDeadline?: { clear(): void };
  private recruitTicker?: { clear(): void };
  private heroDeadline?: { clear(): void };
  private heroTicker?: { clear(): void };
  private combatDeadline?: { clear(): void };
  private readonly actionSequences = new Map<string, Set<number>>();

  private nextId = () => `ab${++this.serial}`;

  private defFor = (baseId: string) => this.catalog.minions.find(item => item.id === baseId);

  /** The table's anomaly as concrete rules (see AB_ANOMALIES). */
  private rules(): TavernRules {
    const id = this.state.anomalyId;
    return {
      ...DEFAULT_RULES,
      tavernBonus: id === 'ab-anomaly-big-tavern' ? 2 : 0,
      rerollCost: id === 'ab-anomaly-free-refresh' ? 0 : DEFAULT_RULES.rerollCost,
      goldCap: id === 'ab-anomaly-deep-pockets' ? 12 : DEFAULT_RULES.goldCap,
      sellReward: id === 'ab-anomaly-fence' ? 2 : DEFAULT_RULES.sellReward,
      upgradeDiscount: id === 'ab-anomaly-back-room' ? 1 : 0,
      damageCap: id === 'ab-anomaly-bloodbath' ? false : DEFAULT_RULES.damageCap,
      combatKeyword: id === 'ab-anomaly-plated' ? 'divineShield' : id === 'ab-anomaly-second-wind' ? 'reborn' : undefined,
      tripleSize: id === 'ab-anomaly-golden-age' ? 2 : 3,
      spellSlots: id === 'ab-anomaly-spell-market' ? 2 : 0,
      spellDiscount: id === 'ab-anomaly-spell-market' ? 1 : 0,
      handGrowth: id === 'ab-anomaly-long-night' ? 1 : 0,
      endTurnTimes: id === 'ab-anomaly-overtime' ? 2 : 1,
      battlecryEcho: id === 'ab-anomaly-double-trouble' ? 1 : 0,
      wheel: id === 'ab-anomaly-wheel-of-fate',
    };
  }

  private deps(player: AutoBattlerPlayerState) {
    return {
      player,
      pool: this.pool,
      rng: createRng(hashSeed(['recruit', this.state.combatSeed, this.state.turn, this.state.revision, player.sessionId, this.serial])),
      nextId: this.nextId,
      registry: this.registry,
      defFor: this.defFor,
      rules: this.rules(),
    };
  }

  onCreate(options: { recruitMs?: unknown; heroMs?: unknown; debug?: unknown; table?: unknown; anomaly?: unknown; set?: unknown; tribes?: unknown } = {}) {
    this.clock.start();
    // A table may play a published Workshop set instead of the starter tavern; an unknown id falls back silently.
    const set = typeof options.set === 'string' && options.set ? catalogStore.cardSet(options.set) : undefined;
    if (set) {
      this.catalog = catalogFromCardSet(set, this.catalog.version, this.catalog.heroes);
      this.pool = new SharedMinionPool(this.catalog);
      this.registry = createDefaultRegistry(this.catalog.minions);
      this.state.setId = set.id;
    }
    this.setMetadata({ table: typeof options.table === 'string' ? options.table.slice(0, 64) : '', set: set?.id ?? '' });
    const testMode = process.env.AB_TEST_MODE === '1' && process.env.NODE_ENV !== 'production';
    const requested = testMode && typeof options.recruitMs === 'number' && Number.isFinite(options.recruitMs) ? options.recruitMs : AUTO_BATTLER.RECRUIT_MS;
    this.recruitMs = Math.min(120_000, Math.max(200, Math.floor(requested)));
    const heroRequested = testMode && typeof options.heroMs === 'number' && Number.isFinite(options.heroMs) ? options.heroMs : AUTO_BATTLER.HERO_SELECT_MS;
    this.heroMs = Math.min(120_000, Math.max(200, Math.floor(heroRequested)));
    this.debug = options.debug === true && process.env.AB_DEBUG === '1' && process.env.NODE_ENV !== 'production';
    this.testMode = testMode;
    if (testMode) this.testCombatMs = Number(process.env.AB_TEST_COMBAT_MS ?? 80) || 80;
    this.state.catalogVersion = this.catalog.version;
    this.state.combatSeed = randomInt(1, 0xffffffff);
    // One seeded rule twist per table, visible from the lobby on.
    this.state.anomalyId = AB_ANOMALIES[createRng(hashSeed(['anomaly', this.state.combatSeed])).int(AB_ANOMALIES.length)] ?? '';
    // Tests pin the twist ('' = none) so turn-one gold and prices are predictable.
    if (testMode && typeof options.anomaly === 'string') this.state.anomalyId = options.anomaly;
    // Hearthstone rule: a handful of the tavern's tribes play at this table; the rest sit out (tests may pin the list).
    const pinned = testMode && Array.isArray(options.tribes) ? options.tribes.filter((id): id is string => typeof id === 'string') : undefined;
    const tribes = pinned ?? pickMatchTribes(this.catalog, createRng(hashSeed(['tribes', this.state.combatSeed])).int);
    this.catalog = restrictCatalogToTribes(this.catalog, tribes);
    this.pool = new SharedMinionPool(this.catalog);
    this.registry = createDefaultRegistry(this.catalog.minions);
    for (const id of tribes) this.state.tribes.push(id);
    this.pool.syncToState(this.state);
    abLog('room.create', { seed: this.state.combatSeed, anomaly: this.state.anomalyId });
    const recruit = (message: string, act: (player: AutoBattlerPlayerState, input: unknown, client: Client) => ActionResult, whenReady = false) => {
      this.onMessage(message, (client, input: unknown) => {
        const turn = readNumber(input, 'turn');
        const actionId = readNumber(input, 'actionId');
        if (turn !== this.state.turn || !Number.isSafeInteger(actionId) || actionId! < 1) { this.reject(client, 'ACTION_TOO_LATE'); return; }
        const seen = this.actionSequences.get(client.sessionId) ?? new Set<number>();
        if (seen.has(actionId!) || seen.size >= 2048) { this.reject(client, 'REJECTED'); return; }
        seen.add(actionId!); this.actionSequences.set(client.sessionId, seen);
        this.recruitAction(client, player => act(player, input, client), whenReady, actionId);
      });
    };

    this.onMessage(MSG.ready, (client: Client) => {
      if (this.readyClients.has(client.sessionId)) return;
      this.readyClients.add(client.sessionId);
      this.pushPrivate(client);
    });

    this.onMessage(MSG.startGame, (client: Client) => {
      if (this.state.phase !== 'LOBBY' || !this.state.players.has(client.sessionId)) {
        this.reject(client, 'WRONG_PHASE');
        return;
      }
      if (this.state.players.size < AUTO_BATTLER.MIN_PLAYERS) {
        this.reject(client, 'REJECTED');
        return;
      }
      this.beginHeroSelection();
    });

    this.onMessage(MSG.chooseHero, (client: Client, input: unknown) => {
      const player = this.state.players.get(client.sessionId);
      const heroId = readString(input, 'heroId');
      const hero = heroId ? this.heroOffers.get(client.sessionId)?.find(item => item.id === heroId) : undefined;
      if (this.state.phase !== 'HERO_SELECTION' || !player || player.hero.heroId || !hero) {
        this.reject(client, player?.hero.heroId ? 'REJECTED' : 'WRONG_PHASE');
        return;
      }
      this.applyHero(player, hero);
      this.state.revision++;
      if (this.everyoneHasHero()) this.beginRecruit();
    });

    recruit(MSG.buy, (player, input) => tryBuy(this.deps(player), readString(input, 'offerId') ?? ''));
    recruit(MSG.sell, (player, input) => trySell(this.deps(player), readString(input, 'minionId') ?? ''));
    recruit(MSG.reroll, player => tryReroll(this.deps(player)));
    recruit(MSG.freeze, player => tryFreeze(player));
    recruit(MSG.tierUp, player => tryTierUp(player));
    recruit(MSG.heroPower, (player, input) => tryHeroPower(this.deps(player), readString(input, 'targetId')));
    recruit(MSG.moveBoard, (player, input) => tryMoveBoard(player, readString(input, 'minionId') ?? '', readNumber(input, 'toIndex') ?? NaN));

    recruit(MSG.playCard, (player, input, client) => {
        if(input && typeof input==='object' && 'boardIndex' in input && readNumber(input,'boardIndex')===undefined)return {ok:false,code:'INVALID_MOVE'};
        const result = tryPlayCard(this.deps(player), readString(input, 'cardId') ?? '', readNumber(input, 'boardIndex'));
        if (result.ok && result.discover) this.sendDiscover(client, player);
        return result;
    });

    recruit(MSG.discoverPick, (player, input, client) => {
        const result = tryDiscoverPick(this.deps(player), readString(input, 'optionId') ?? '');
        return result;
    });

    recruit(MSG.endRecruit, player => {
      if (!player.recruitReady) {
        player.recruitReady = true;
        if (this.allRecruitLocked()) this.beginCombat();
      }
      return ok();
    });
    recruit(MSG.cancelRecruit, player => {
      player.recruitReady = false;
      return ok();
    }, true);

    if (this.debug) {
      this.onMessage('debug', (client, input: unknown) => {
        const player = this.state.players.get(client.sessionId);
        if (!player || !input || typeof input !== 'object') return;
        const gold = readNumber(input, 'gold');
        const health = readNumber(input, 'health');
        const tier = readNumber(input, 'tier');
        if (gold !== undefined) player.gold = Math.max(0, Math.min(AUTO_BATTLER.GOLD_CAP, gold));
        if (health !== undefined) player.hero.health = Math.max(1, Math.min(player.hero.maxHealth, health));
        if (tier !== undefined) {
          player.tavernTier = Math.max(1, Math.min(AUTO_BATTLER.MAX_TIER, Math.floor(tier)));
          player.tavern.size = tavernSizeForTier(player.tavernTier);
        }
        this.state.revision++;
      });
    }
  }

  onDispose() {
    this.clearRecruitClock();
    this.clearHeroClock();
    this.combatDeadline?.clear();
  }

  async onAuth(_client: Client, options: { playerToken?: unknown } = {}): Promise<{ playerId?: string }> {
    if (options.playerToken === undefined || !this.playerStore) return {};
    try {
      return { playerId: await this.playerStore.authenticate(options.playerToken) };
    } catch (error) {
      if (error instanceof PlayerError) throw new ServerError(error.status, error.code);
      throw error;
    }
  }

  async onJoin(client: Client, options: { displayName?: unknown } = {}, auth: { playerId?: string } = {}) {
    const existing = this.state.players.get(client.sessionId);
    if (existing) {
      existing.connected = true;
      this.pushPrivate(client);
      abLog('player.reconnect.join', { id: client.sessionId });
      return;
    }
    if (this.state.phase !== 'LOBBY') throw new ServerError(409, 'matchInProgress');
    if (auth.playerId) {
      if ([...this.playerIds.values()].includes(auth.playerId)) throw new ServerError(409, 'alreadyInMatch');
      this.playerIds.set(client.sessionId, auth.playerId);
    }
    // Equipped cosmetics are read once per seat; a store hiccup seats the player as a guest.
    let cosmetics = { heroSkin: '', heroSlam: '', nameFx: '', portraitFx: '', cardBack: '' };
    if (auth.playerId && this.playerStore) {
      try { cosmetics = await this.playerStore.cosmetics(auth.playerId); } catch (error) { console.error('Failed to read cosmetics', error); }
    }
    if (this.state.phase !== 'LOBBY') { this.playerIds.delete(client.sessionId); throw new ServerError(409, 'matchInProgress'); }
    this.seatCosmetics.set(client.sessionId, cosmetics);
    const player = new AutoBattlerPlayerState();
    player.sessionId = client.sessionId;
    player.displayName = typeof options.displayName === 'string' && options.displayName.trim()
      ? options.displayName.trim().slice(0, 24)
      : client.sessionId.slice(0, 8);
    player.connected = true;
    player.nameFx = cosmetics.nameFx;
    player.cardBack = cosmetics.cardBack;
    player.upgradeCost = initialUpgradeCost(1);
    player.tavern.size = tavernSizeForTier(1);
    this.state.players.set(client.sessionId, player);
    this.grantPrivateView(client, player);
    this.state.playerOrder.push(client.sessionId);
    this.heroOffers.set(client.sessionId, this.dealHeroes(client.sessionId));
    abLog('player.join', { id: client.sessionId, name: player.displayName });
    if (this.state.players.size >= AUTO_BATTLER.MAX_PLAYERS) this.beginHeroSelection();
  }

  onReconnect(client: Client) {
    this.actionSequences.delete(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.connected = true;
      this.grantPrivateView(client, player);
    }
    // The client's ready handshake requests private messages after handlers attach.
    this.readyClients.delete(client.sessionId);
    abLog('player.reconnect', { id: client.sessionId, phase: this.state.phase });
  }

  async onLeave(client: Client, code?: number) {
    this.readyClients.delete(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (this.state.phase === 'LOBBY') {
      this.heroOffers.delete(client.sessionId);
      this.seatCosmetics.delete(client.sessionId);
      this.state.players.delete(client.sessionId);
      this.playerIds.delete(client.sessionId);
      const order = [...this.state.playerOrder].filter(id => id !== client.sessionId);
      while (this.state.playerOrder.length) this.state.playerOrder.pop();
      for (const id of order) this.state.playerOrder.push(id);
      return;
    }

    const consented = code === CloseCode.CONSENTED;
    player.connected = false;
    if (!consented && this.state.phase !== 'GAME_OVER') {
      try {
        await this.allowReconnection(client, AUTO_BATTLER.RECONNECT_GRACE_SECONDS);
        player.connected = true;
        return;
      } catch { /* grace expired: the seat is forfeited below */ }
    }
    if (!player.eliminated && this.state.phase !== 'GAME_OVER') this.eliminate(player, true);
    this.settleAfterLeave();
  }

  /** More than half the table walked out: nobody plays on, nobody is paid. */
  private walkedOut(): boolean {
    return this.leftIds.size * 2 > this.state.players.size;
  }

  private cancelMatch(): void {
    if (this.state.phase === 'GAME_OVER') return;
    this.state.phase = 'GAME_OVER';
    this.state.cancelled = true;
    this.state.winnerId = '';
    this.clearRecruitClock();
    this.clearHeroClock();
    this.combatDeadline?.clear();
    this.state.phaseEndsAt = 0;
    this.state.revision++;
    abLog('game.cancelled', { left: [...this.leftIds] });
  }

  /** A forfeited seat may have been the last thing the phase waited on. */
  private settleAfterLeave(): void {
    if (this.finishIfNeeded()) return;
    if (this.state.phase === 'HERO_SELECTION' && this.everyoneHasHero()) this.beginRecruit();
    else if (this.state.phase === 'RECRUIT_PHASE') {
      this.assignPairing();
      if (this.allRecruitLocked()) this.beginCombat();
    }
  }

  /** Owner-only zones (hand, board, tavern offers, discover): everyone else gets undefined. */
  private grantPrivateView(client: Client, player: AutoBattlerPlayerState): void {
    client.view = new StateView();
    client.view.add(player, 1);
    client.view.add(player.tavern, 1);
  }

  onBeforePatch(): void {
    // The hand itself is owner-only; its size is public so opponents can draw the right number of card backs.
    for (const player of this.state.players.values()) if (player.handCount !== player.hand.length) player.handCount = player.hand.length;
    for (const client of this.clients) {
      const player = this.state.players.get(client.sessionId);
      if (player && client.view) syncPrivateView(client.view, player);
    }
  }

  private pushPrivate(client: Client): void {
    client.send(EV.catalog, this.catalog);
    client.send(EV.heroOffers, this.heroOffers.get(client.sessionId) ?? []);
    const player = this.state.players.get(client.sessionId);
    if (player?.discoverOpen) this.sendDiscover(client, player);
    const combat = this.lastCombat.get(client.sessionId);
    if (combat && (this.state.phase === 'COMBAT_PHASE' || this.state.phase === 'GAME_OVER')) client.send(EV.combatEvents, combat);
  }

  private sendDiscover(client: Client, player: AutoBattlerPlayerState): void {
    const payload: DiscoverOptionsMessage = {
      spellId: AUTO_BATTLER.DISCOVER_SPELL_ID,
      options: [...player.pendingDiscover].map(card => ({
        id: card.id,
        cardId: card.cardId,
        attack: card.attack,
        health: card.health,
        tavernTier: card.tavernTier,
        keywords: [...card.keywords],
      })),
    };
    client.send(EV.discoverOptions, payload);
  }

  private reject(client: Client, code: ActionErrorCode): void {
    client.send(EV.actionError, errorPayload(code));
  }

  private dealHeroes(sessionId: string): AutoBattlerHeroDef[] {
    const rng = createRng(hashSeed(['heroes', this.state.combatSeed, this.serial, this.state.players.size]));
    const pool = [...this.catalog.heroes];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool.slice(0, Math.min(AUTO_BATTLER.HERO_CHOICES, pool.length));
  }

  private applyHero(player: AutoBattlerPlayerState, hero: AutoBattlerHeroDef): void {
    if (!player.hero) player.hero = new HeroState();
    player.hero.heroId = hero.id;
    player.hero.portraitKey = hero.portraitKey;
    player.hero.health = player.hero.maxHealth = hero.health;
    player.hero.power.id = hero.power.id;
    player.hero.power.isPassive = hero.power.isPassive;
    player.hero.power.goldCost = this.state.anomalyId === 'ab-anomaly-cheap-powers' ? 0 : hero.power.goldCost;
    player.hero.power.targeted = hero.power.targeted;
    player.hero.power.targetDomain = hero.power.targetDomain;
    player.hero.power.isExhausted = false;
    const seat = this.seatCosmetics.get(player.sessionId);
    player.hero.skin = seat?.heroSkin ?? '';
    player.hero.slam = seat?.heroSlam ?? '';
    player.hero.aura = seat?.portraitFx ?? '';
    abLog('hero.choice', { id: player.sessionId, hero: hero.id, skin: player.hero.skin });
  }

  private everyoneHasHero(): boolean {
    return [...this.state.players.values()].every(item => item.hero.heroId || item.eliminated);
  }

  private beginHeroSelection(): void {
    if (this.state.phase !== 'LOBBY') return;
    void this.lock();
    this.state.phase = 'HERO_SELECTION';
    this.startHeroClock();
    this.state.revision++;
    abLog('phase.hero', {});
  }

  private startHeroClock(): void {
    this.clearHeroClock();
    this.state.heroSeconds = Math.ceil(this.heroMs / 1000);
    this.state.phaseEndsAt = Date.now() + this.heroMs;
    this.heroTicker = this.clock.setInterval(() => {
      if (this.state.phase !== 'HERO_SELECTION') {
        this.clearHeroClock();
        return;
      }
      this.state.heroSeconds = Math.max(0, Math.ceil((this.state.phaseEndsAt - Date.now()) / 1000));
    }, 1000);
    this.heroDeadline = this.clock.setTimeout(() => this.forceHeroPicks(), this.heroMs);
  }

  private clearHeroClock(): void {
    this.heroDeadline?.clear();
    this.heroTicker?.clear();
    this.heroDeadline = undefined;
    this.heroTicker = undefined;
    this.state.heroSeconds = 0;
  }

  private forceHeroPicks(): void {
    if (this.state.phase !== 'HERO_SELECTION') return;
    for (const player of this.state.players.values()) {
      if (player.hero.heroId || player.eliminated) continue;
      const offer = this.heroOffers.get(player.sessionId)?.[0];
      if (offer) this.applyHero(player, offer);
    }
    if (this.everyoneHasHero()) this.beginRecruit();
  }

  private beginRecruit(): void {
    if (this.state.phase === 'GAME_OVER') return;
    this.clearHeroClock();
    this.state.phase = 'RECRUIT_PHASE';
    this.state.turn += 1;
    this.actionSequences.clear();
    for (const player of this.state.players.values()) {
      if (player.eliminated) continue;
      if (this.state.turn === 1 && this.state.anomalyId === 'ab-anomaly-fast-start') { player.tavernTier = 2; player.upgradeCost = initialUpgradeCost(2); }
      beginRecruitTurn(this.deps(player), this.state.turn);
    }
    this.assignPairing();
    this.pool.syncToState(this.state);
    this.startRecruitClock();
    this.state.revision++;
    abLog('phase.recruit', { turn: this.state.turn });
  }

  private clearRecruitClock(): void {
    this.recruitDeadline?.clear();
    this.recruitTicker?.clear();
    this.recruitDeadline = undefined;
    this.recruitTicker = undefined;
  }

  /** Tests pin the length; a real table grows it every turn so late boards get time to be played. */
  private recruitMsForTurn(): number {
    if (this.testMode) return this.recruitMs;
    return Math.min(AUTO_BATTLER.RECRUIT_MAX_MS, this.recruitMs + Math.max(0, this.state.turn - 1) * AUTO_BATTLER.RECRUIT_STEP_MS);
  }

  private startRecruitClock(): void {
    this.clearRecruitClock();
    const ms = this.recruitMsForTurn();
    this.state.recruitSeconds = Math.ceil(ms / 1000);
    this.state.phaseEndsAt = Date.now() + ms;
    this.recruitTicker = this.clock.setInterval(() => {
      if (this.state.phase !== 'RECRUIT_PHASE') {
        this.clearRecruitClock();
        return;
      }
      this.state.recruitSeconds = Math.max(0, Math.ceil((this.state.phaseEndsAt - Date.now()) / 1000));
    }, 1000);
    this.recruitDeadline = this.clock.setTimeout(() => this.forceEndRecruit(), ms);
  }

  private forceEndRecruit(): void {
    if (this.state.phase !== 'RECRUIT_PHASE') return;
    for (const player of this.state.players.values()) {
      if (!player.eliminated) player.recruitReady = true;
    }
    this.beginCombat();
  }

  private allRecruitLocked(): boolean {
    return [...this.state.players.values()]
      .filter(item => !item.eliminated)
      .every(item => item.recruitReady || !item.connected);
  }

  private recruitAction(client: Client, act: (player: AutoBattlerPlayerState) => ActionResult, whenReady = false, actionId = 0): void {
    const player = this.alive(client.sessionId);
    if (!player) {
      this.reject(client, this.state.players.get(client.sessionId) ? 'PLAYER_DEAD' : 'REJECTED');
      return;
    }
    if (this.state.phase !== 'RECRUIT_PHASE' || Date.now() >= this.state.phaseEndsAt || (player.recruitReady && !whenReady)) {
      this.reject(client, 'ACTION_TOO_LATE');
      return;
    }
    const result = act(player);
    if (!result.ok) {
      this.reject(client, result.code);
      return;
    }
    if (actionId > player.lastActionId) player.lastActionId = actionId;
    this.pool.syncToState(this.state);
    this.state.revision++;
  }

  private alive(sessionId: string): AutoBattlerPlayerState | undefined {
    const player = this.state.players.get(sessionId);
    return player && !player.eliminated ? player : undefined;
  }

  /**
   * Combat is a synchronous while-loop. This method must not schedule
   * setTimeout/setInterval to resolve attacks — only the event list is emitted.
   * Client playback is independent; the server proceeds to the next recruit.
   */
  private beginCombat(): void {
    if (this.state.phase !== 'RECRUIT_PHASE') return;
    this.clearRecruitClock();
    this.state.recruitSeconds = 0;
    this.state.phase = 'COMBAT_PHASE';
    this.state.revision++;
    const rules = this.rules();
    const snapshot = (player: AutoBattlerPlayerState) => {
      const snap = snapshotBoard(player);
      if (rules.combatKeyword) for (const minion of snap.board) if (!minion.keywords.includes(rules.combatKeyword)) minion.keywords.push(rules.combatKeyword);
      return snap;
    };
    const cap = { enabled: rules.damageCap, value: AUTO_BATTLER.DAMAGE_CAP };
    // End-of-turn effects land on the tavern board (permanent). The table shows the pre-effect boards and
    // replays each buff as a STATS event once both sides are revealed; combat resolves on the buffed boards.
    const shownBoards = new Map([...this.state.players.values()].filter(p => !p.eliminated).map(p => [p.sessionId, snapshot(p)]));
    const endTurnEvents = new Map<string, CombatEvent[]>();
    for (const player of this.state.players.values()) {
      if (player.eliminated) continue;
      const events: CombatEvent[] = [];
      endRecruitTurn(this.deps(player), (owner, target) => events.push({ id: 0, kind: 'STATS', sourceId: owner.id, targetId: target.id, attack: target.attack, remainingHealth: target.health }));
      if (events.length) endTurnEvents.set(player.sessionId, events);
    }
    // Capture every player before resolving any pair, so ghosts cannot depend on pair order.
    const previousBoards = new Map(this.lastBoards);
    const currentBoards = new Map([...this.state.players.values()].filter(p => !p.eliminated).map(p => [p.sessionId, snapshot(p)]));
    for (const [id, board] of currentBoards) this.lastBoards.set(id, board);
    let presentationMs = 2500;
    let shortestMs = Infinity;
    const initialHealth = Object.fromEntries([...this.state.players.values()].map(p => [p.sessionId, p.hero.health]));
    // Cards still in hand when the bell rang: opponents see that many backs by the portrait, never the cards.
    const handCounts = Object.fromEntries([...this.state.players.values()].map(p => [p.sessionId, p.hand.length]));

    if (!this.state.pairing.length) this.assignPairing();

    this.state.pairing.forEach((pair, pairIndex) => {
      const playerA = this.state.players.get(pair.playerA);
      const playerB = this.state.players.get(pair.playerB);
      if (!playerA || playerA.eliminated) return;
      const snapA = currentBoards.get(pair.playerA) ?? snapshot(playerA);
      const snapB = pair.ghost
        ? previousBoards.get(pair.playerB) ?? currentBoards.get(pair.playerB) ?? { playerId: pair.playerB, tavernTier: 1, board: [] }
        : playerB && !playerB.eliminated
          ? currentBoards.get(pair.playerB) ?? snapshot(playerB)
          : { playerId: pair.playerB, tavernTier: 1, board: [] };
      this.lastBoards.set(pair.playerA, snapA);
      if (playerB && !pair.ghost) this.lastBoards.set(pair.playerB, snapB);

      const seed = hashSeed([this.state.combatSeed, this.state.turn, pair.playerA, pair.playerB, pairIndex]);
      const result = resolveCombat(snapA, snapB, seed, this.registry, this.defFor);
      const shownA = shownBoards.get(pair.playerA) ?? snapA, shownB = pair.ghost ? snapB : shownBoards.get(pair.playerB) ?? snapB;
      const shownIds = new Set([...shownA.board, ...shownB.board].map(m => m.id));
      const prelude = [...endTurnEvents.get(pair.playerA) ?? [], ...(pair.ghost ? [] : endTurnEvents.get(pair.playerB) ?? [])].filter(e => shownIds.has(e.targetId ?? ''));
      const payload: CombatEventsMessage = {
        turn: this.state.turn,
        pairIndex,
        playerA: pair.playerA,
        playerB: pair.playerB,
        ghost: pair.ghost,
        seed,
        events: [...prelude, ...result.events].map((event, index) => ({ ...event, id: index + 1 })),
        boards: { a: shownA.board, b: shownB.board },
        initialHealth,
        handCounts,
        durationMs: Math.min(AUTO_BATTLER.MAX_COMBAT_MS, 4_500 + prelude.length * 420 + result.events.filter(e => ['ATTACK', 'HUMILIATE', 'BAIT'].includes(e.kind)).length * 2_400 + result.events.length * 250),
        summary: { winnerId: result.winnerId, loserId: result.loserId, damage: result.damage, tie: result.tie },
      };

      if (!result.tie && result.damage > 0) {
        if (result.loserId === pair.playerA) {
          const dmg = applyPlayerDamage(playerA, result.damage, cap);
          payload.events.push({
            id: payload.events.length + 1,
            kind: 'PLAYER_DAMAGE',
            targetId: pair.playerA,
            amount: dmg.applied,
            remainingHealth: playerA.hero.health,
          });
          payload.summary.damage = dmg.applied;
        } else if (!pair.ghost && playerB && result.loserId === pair.playerB) {
          const dmg = applyPlayerDamage(playerB, result.damage, cap);
          payload.events.push({
            id: payload.events.length + 1,
            kind: 'PLAYER_DAMAGE',
            targetId: pair.playerB,
            amount: dmg.applied,
            remainingHealth: playerB.hero.health,
          });
          payload.summary.damage = dmg.applied;
        }
      }

      this.lastCombat.set(pair.playerA, payload);
      presentationMs = Math.max(presentationMs, payload.durationMs);
      shortestMs = Math.min(shortestMs, payload.durationMs);
      if (!pair.ghost) this.lastCombat.set(pair.playerB, payload);
      this.broadcastCombat(pair.playerA, pair.playerB, payload);
      this.writeCombatSummary(playerA, pair.playerB, result.seed, payload.events.length, payload.summary);
      if (playerB && !pair.ghost) this.writeCombatSummary(playerB, pair.playerA, result.seed, payload.events.length, payload.summary);

      playerA.lastOpponentId = pair.playerB;
      if (playerB && !pair.ghost) playerB.lastOpponentId = pair.playerA;
      // Passive hero hooks that key on the outcome (Bounty Hunter's purse).
      this.registry.heroPowers.get(playerA.hero.power.id)?.onCombatEnd?.(playerA, result.winnerId === pair.playerA);
      if (playerB && !pair.ghost) this.registry.heroPowers.get(playerB.hero.power.id)?.onCombatEnd?.(playerB, result.winnerId === pair.playerB);
      abLog('combat.result', { a: pair.playerA, b: pair.playerB, seed, winner: result.winnerId, damage: payload.summary.damage, ghost: pair.ghost });
    });

    const dying = [...this.state.players.values()]
      .filter(player => !player.eliminated && player.hero.health <= 0)
      .sort((a, b) => a.hero.health - b.hero.health || a.sessionId.localeCompare(b.sessionId));
    for (const player of dying) this.eliminate(player);

    const stampMs = this.testCombatMs ? 0 : AUTO_BATTLER.RESULT_STAMP_MS;
    // Nobody waits for the slowest table: recruit opens shortly after the quickest fight; the rest finish on screen while the clock runs.
    if (Number.isFinite(shortestMs)) presentationMs = Math.min(presentationMs, shortestMs + AUTO_BATTLER.COMBAT_GRACE_MS);
    presentationMs = (this.testCombatMs ?? presentationMs) + stampMs;
    this.state.phaseEndsAt = Date.now() + presentationMs;
    // Result is already final. This server clock is a shared presentation window,
    // never an acknowledgement or animation promise supplied by a client.
    this.combatDeadline = this.clock.setTimeout(() => {
      if (!this.finishIfNeeded()) this.beginRecruit();
    }, presentationMs);
  }

  private writeCombatSummary(
    player: AutoBattlerPlayerState,
    opponentId: string,
    seed: number,
    eventCount: number,
    summary: CombatEventsMessage['summary'],
  ): void {
    player.lastCombatOpponentId = opponentId;
    player.mainTribe = boardMainTribe([...player.board]);
    player.lastCombatSeed = seed;
    player.lastCombatEventCount = eventCount;
    player.lastCombatDamage = summary.damage;
    player.lastCombatResult = summary.tie ? 'tie' : summary.winnerId === player.sessionId ? 'win' : 'loss';
    player.lastCombatSummary = `${player.lastCombatResult}:${summary.damage}`;
  }

  private broadcastCombat(a: string, b: string, payload: CombatEventsMessage): void {
    for (const client of this.clients) {
      if (client.sessionId === a || (!payload.ghost && client.sessionId === b)) client.send(EV.combatEvents, payload);
    }
  }

  private assignPairing(): void {
    while (this.state.pairing.length) this.state.pairing.pop();
    const alive = [...this.state.players.values()].filter(player => !player.eliminated);
    for (const player of this.state.players.values()) {
      player.swords = false;
      player.nextOpponentId = '';
      player.combatPairIndex = -1;
    }
    if (alive.length < 2) return;
    const last = new Map(alive.map(player => [player.sessionId, player.lastOpponentId]));
    const rng = createRng(hashSeed(['pair', this.state.combatSeed, this.state.turn]));
    const pairs = planPairing(alive.map(player => player.sessionId), last, rng,
      [...this.state.players.values()].filter(p => p.eliminated && this.lastBoards.has(p.sessionId)).map(p => p.sessionId));
    pairs.forEach((pair, index) => {
      const row = new CombatPairState();
      row.playerA = pair.playerA;
      row.playerB = pair.playerB;
      row.ghost = pair.ghost;
      this.state.pairing.push(row);
      const a = this.state.players.get(pair.playerA);
      const b = this.state.players.get(pair.playerB);
      if (a) {
        a.nextOpponentId = pair.playerB;
        a.swords = true;
        a.combatPairIndex = index;
      }
      if (b && !pair.ghost) {
        b.nextOpponentId = pair.playerA;
        b.swords = true;
        b.combatPairIndex = index;
      }
    });
    abLog('pairing', { pairs });
  }

  private eliminate(player: AutoBattlerPlayerState, left = false): void {
    if (player.eliminated) return;
    if (!this.lastBoards.has(player.sessionId)) this.lastBoards.set(player.sessionId, snapshotBoard(player));
    const remaining = [...this.state.players.values()].filter(item => !item.eliminated).length;
    player.eliminated = true;
    player.placement = remaining;
    player.swords = false;
    player.nextOpponentId = '';
    player.recruitReady = true;
    returnOwnedMinionsToPool(player, this.pool);
    this.pool.syncToState(this.state);
    abLog('player.eliminated', { id: player.sessionId, place: remaining, left });
    if (left) {
      // Walk-outs are paid with everyone else at the end, and only if the match is not cancelled.
      this.leftIds.add(player.sessionId);
      if (this.walkedOut()) this.cancelMatch();
      return;
    }
    // The place is final now, so the beer, cash and xp are too — no need to wait for the winner.
    if (!this.state.cancelled) void this.persistRewards([player]);
  }

  private finishIfNeeded(): boolean {
    const alive = [...this.state.players.values()].filter(player => !player.eliminated);
    if (alive.length > 1) return this.state.phase === 'GAME_OVER';
    if (this.state.phase === 'GAME_OVER') return true;
    if (alive[0]) {
      alive[0].placement = 1;
      this.state.winnerId = alive[0].sessionId;
    }
    this.state.phase = 'GAME_OVER';
    this.clearRecruitClock();
    this.clearHeroClock();
    this.combatDeadline?.clear();
    this.state.phaseEndsAt = 0;
    this.state.revision++;
    abLog('game.over', { winner: this.state.winnerId });
    if (!this.state.cancelled) void this.persistRewards();
    return true;
  }

  private async persistRewards(only?: AutoBattlerPlayerState[]) {
    if (this.state.cancelled) return;
    const count = this.state.players.size;
    const players = (only ?? [...this.state.players.values()]).filter(player => player.placement > 0 && !this.settledIds.has(player.sessionId));
    if (!players.length) return;
    for (const player of players) this.settledIds.add(player.sessionId);
    const loggedIn = players.flatMap(player => {
      const playerId = this.playerIds.get(player.sessionId);
      return playerId && player.placement > 0 ? [{ playerId, place: player.placement }] : [];
    });
    let persisted: Record<string, { elo: number; currency: number; gained: number; xp: number }> = {};
    try {
      if (this.playerStore && loggedIn.length) persisted = await this.playerStore.settleBattlegrounds(loggedIn, this.ratingAmount, count);
    } catch (error) { console.error('Failed to persist battlegrounds result', error); }
    for (const player of players) {
      if (player.placement < 1) continue;
      const client = this.clients.find(item => item.sessionId === player.sessionId);
      if (!client) continue;
      const playerId = this.playerIds.get(player.sessionId);
      const row = playerId ? persisted[playerId] : undefined;
      const beerMlGain = beerMlForPlace(player.placement, count, this.ratingAmount);
      const eloDelta = beerMlGain;
      const xpGain = battlegroundsXp(player.placement, count);
      const payload: BattlegroundsRewards = {
        place: player.placement, eloDelta, xpGain, beerMlGain,
        elo: row?.elo ?? 0, currency: row?.currency ?? 0, gained: row?.gained ?? battlegroundsCurrencyReward(player.placement, count), xp: row?.xp ?? 0,
      };
      client.send(EV.rewards, payload);
    }
  }
}

export function autoBattlerRoomWithPlayers(store: PlayerStore) {
  return class extends AutoBattlerRoom { protected playerStore = store; };
}

/**
 * @colyseus/schema 5.0.x ships a minion pushed into a view-filtered array without its nested
 * keyword/tribe arrays; an explicit view.add(minion) after the push does. Run before every patch.
 */
export function syncPrivateView(view: StateView, player: AutoBattlerPlayerState): void {
  for (const list of [player.hand, player.board, player.tavern.offers, player.pendingDiscover]) {
    for (const minion of list) if (!view.has(minion.keywords) || !view.has(minion.tribes)) view.add(minion);
  }
}
