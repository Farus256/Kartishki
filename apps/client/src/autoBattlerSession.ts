import i18n from '@kartishki/i18n';
import { Client, type Room } from '@colyseus/sdk';
import {
  AUTO_BATTLER,
  AUTO_BATTLER_CLIENT_EVENTS as EV,
  AUTO_BATTLER_MESSAGES as MSG,
  AutoBattlerRoomState,
  starterAutoBattlerCatalog,
  type ActionErrorPayload,
  type AutoBattlerCatalog,
  type AutoBattlerHeroDef,
  type AutoBattlerMinionState,
  type AutoBattlerPlayerState,
  type BattlegroundsRewards,
  type CombatEventsMessage,
  type DiscoverOptionsMessage,
  type RoomSettings,
} from '@kartishki/shared';
import { playerSession } from './playerSession';
import { chosenCardSet, rememberCardSet } from './activeCardSet';
import { serverOrigin } from './serverUrl';
import { applyOptimistic, type OptimisticIntent } from './battlegrounds/abOptimistic';

const RECONNECT_KEY = 'kartishki-ab-reconnect';



export type AbMinion = {
  id: string; cardId: string; baseId: string; kind: string;
  attack: number; health: number; maxHealth: number; tavernTier: number;
  keywords: string[]; /** Replicated with the minion; combat boards and test fixtures may omit it. */ tribes?: string[]; golden: boolean; owner: string;
  /** Tavern price of this offer (spells carry their own; see AutoBattlerMinionState.cost). Absent off the counter. */
  cost?: number;
};

export type AbPower = {
  id: string; isPassive: boolean; goldCost: number; isExhausted: boolean;
  targeted: boolean; targetDomain: string;
};

export type AbPlayer = {
  sessionId: string; displayName: string;
  heroId: string; portraitKey: string; skin: string; slam?: string; aura?: string; nameFx?: string; cardBack?: string; /** Public hand size (the hand itself is owner-only). */ handCount?: number; /** Tribe of the board's last fight (server-side, see boardMainTribe). */ mainTribe?: string; health: number; maxHealth: number;
  power: AbPower; gold: number; tavernTier: number; upgradeCost: number;
  board: AbMinion[]; hand: AbMinion[];
  tavern: { offers: AbMinion[]; frozen: boolean; size: number };
  nextOpponentId: string; swords: boolean; eliminated: boolean; placement: number;
  /** Server-driven seat (no person behind it); the UI tags it. */
  isBot?: boolean;
  recruitReady: boolean; lastCombatResult: string; lastCombatDamage: number; lastCombatOpponentId: string;
  tripleSerial: number;
  lastActionId: number;
  buyCost: number; rerollCost: number; sellReward: number; freeRerolls: number;
  lastCombatSummary: string; discoverOpen: boolean; pendingDiscover: AbMinion[];
  /** Wedge the wheel-of-fate anomaly landed on this turn ('' outside that anomaly). */
  wheelBonus: string;
};

export type AbCombatBoards = { playerA: string; playerB: string; a: AbMinion[]; b: AbMinion[] };

export type AbSnapshot = {
  status: 'offline' | 'connecting' | 'online';
  phase: string; turn: number; revision: number; recruitSeconds: number; heroSeconds: number; phaseEndsAt: number; sessionId: string; error: string; winnerId: string; anomalyId: string; cancelled: boolean; setId: string; /** Tribes in play at this table (neutral always plays). */ tribes: string[];
  players: AbPlayer[];
  catalog: AutoBattlerCatalog;
  heroOffers: AutoBattlerHeroDef[];
  discover: DiscoverOptionsMessage | null;
  combat: CombatEventsMessage | null;
  combatBoards: AbCombatBoards | null;
  pairing: { playerA: string; playerB: string; ghost: boolean }[];
  /** 'ranked' (rating on) or 'custom' (server-browser room: no rating, reduced payouts). */
  mode?: 'ranked' | 'custom';
  /** Custom room settings as the server holds them; hostId tells who may edit and start. */
  room?: { name: string; hostId: string; maxPlayers: number; bots: number; anomaly: string; timer: number };
};

/** Where connect() sits down: the ranked queue (default), a fresh custom room, or an existing one from the browser. */
export type AbTarget = { kind: 'ranked' } | { kind: 'create'; settings: Partial<RoomSettings> } | { kind: 'join'; roomId: string };

const empty = (): AbSnapshot => ({
  status: 'offline', phase: 'LOBBY', turn: 0, revision: 0, recruitSeconds: 0, heroSeconds: 0, phaseEndsAt: 0, sessionId: '', error: '', winnerId: '', anomalyId: '', cancelled: false, setId: '', tribes: [],
  players: [], catalog: starterAutoBattlerCatalog, heroOffers: [], discover: null, combat: null, combatBoards: null, pairing: [],
  mode: 'ranked', room: { name: '', hostId: '', maxPlayers: AUTO_BATTLER.MAX_PLAYERS, bots: 0, anomaly: 'random', timer: 60 },
});

function toMinion(m: AutoBattlerMinionState): AbMinion {
  return {
    id: m.id, cardId: m.cardId, baseId: m.baseId, kind: m.kind,
    attack: m.attack, health: m.health, maxHealth: m.maxHealth, tavernTier: m.tavernTier,
    keywords: [...m.keywords], tribes: [...(m.tribes ?? [])], golden: m.golden, owner: m.owner, cost: m.cost ?? 0,
  };
}

function toPlayer(p: AutoBattlerPlayerState): AbPlayer {
  return {
    sessionId: p.sessionId, displayName: p.displayName || p.sessionId.slice(0, 8),
    heroId: p.hero.heroId, portraitKey: p.hero.portraitKey, skin: p.hero.skin ?? '', slam: p.hero.slam ?? '', aura: p.hero.aura ?? '', cardBack: p.cardBack ?? '', handCount: p.handCount ?? 0, nameFx: p.nameFx ?? '', mainTribe: p.mainTribe ?? '',
    health: p.hero.health, maxHealth: p.hero.maxHealth,
    power: {
      id: p.hero.power.id, isPassive: p.hero.power.isPassive, goldCost: p.hero.power.goldCost,
      isExhausted: p.hero.power.isExhausted, targeted: p.hero.power.targeted, targetDomain: p.hero.power.targetDomain,
    },
    gold: p.gold, tavernTier: p.tavernTier, upgradeCost: p.upgradeCost,
    board: [...(p.board ?? [])].map(toMinion), hand: [...(p.hand ?? [])].map(toMinion),
    tavern: { offers: [...(p.tavern.offers ?? [])].map(toMinion), frozen: p.tavern.frozen, size: p.tavern.size },
    nextOpponentId: p.nextOpponentId, swords: p.swords, eliminated: p.eliminated, placement: p.placement, isBot: p.isBot === true,
    recruitReady: p.recruitReady, lastCombatResult: p.lastCombatResult, lastCombatDamage: p.lastCombatDamage, lastCombatOpponentId: p.lastCombatOpponentId ?? '',
    lastCombatSummary: p.lastCombatSummary, discoverOpen: p.discoverOpen, wheelBonus: p.wheelBonus ?? '',
    pendingDiscover: [...(p.pendingDiscover ?? [])].map(toMinion), tripleSerial: p.tripleSerial,
    lastActionId: p.lastActionId ?? 0,
    buyCost: p.buyCost ?? AUTO_BATTLER.BUY_COST, rerollCost: p.rerollCost ?? AUTO_BATTLER.REROLL_COST, sellReward: p.sellReward ?? AUTO_BATTLER.SELL_REWARD, freeRerolls: p.freeRerolls ?? 0,
  };
}

/** Authoritative server view; `snapshot` is this plus the not-yet-echoed local intents. */
let authoritative = empty();
let snapshot = authoritative;
const listeners = new Set<() => void>();
let room: Room<AutoBattlerRoomState> | undefined;
let generation = 0;
let actionId = Date.now();
let errorTimer: ReturnType<typeof setTimeout> | undefined;
/** Server echo normally lands in one patch; after this the local guess is dropped. */
const OPTIMISTIC_TTL_MS = 4000;
let pending: { actionId: number; at: number; intent: OptimisticIntent }[] = [];
/** Where the last connect() sat down, so a dropped socket re-seats at the same kind of table (a lost custom room is re-joined by id). */
let lastTarget: AbTarget = { kind: 'ranked' };

function overlay(base: AbSnapshot): AbSnapshot {
  if (!pending.length) return base;
  const me = base.players.find(p => p.sessionId === base.sessionId);
  const now = Date.now();
  pending = pending.filter(op => op.actionId > (me?.lastActionId ?? 0) && now - op.at < OPTIMISTIC_TTL_MS);
  if (!me || !pending.length) return base;
  const guessed = pending.reduce((player, op) => applyOptimistic(player, op.intent), me);
  return { ...base, players: base.players.map(p => p === me ? guessed : p) };
}

const publish = (patch: Partial<AbSnapshot>) => { authoritative = { ...authoritative, ...patch }; snapshot = overlay(authoritative); listeners.forEach(fn => fn()); };
const sendIntent = (message: string, data: Record<string, unknown> = {}, intent?: OptimisticIntent) => {
  if (!room) return;
  const id = ++actionId;
  room.send(message, { ...data, turn: snapshot.turn, actionId: id });
  if (intent && snapshot.phase === 'RECRUIT_PHASE') { pending.push({ actionId: id, at: Date.now(), intent }); publish({}); }
};
const dropOptimistic = () => { if (pending.length) { pending = []; publish({}); } };

function sync(joined: Room<AutoBattlerRoomState>) {
  if (room !== joined) return;
  const s = joined.state;
  publish({
    status: 'online', phase: s.phase, turn: s.turn, revision: s.revision, recruitSeconds: s.recruitSeconds,
    phaseEndsAt: s.phaseEndsAt ?? 0,
    sessionId: joined.sessionId, winnerId: s.winnerId, heroSeconds: s.heroSeconds, anomalyId: s.anomalyId ?? '', cancelled: s.cancelled === true, setId: s.setId ?? '', tribes: s.tribes ? [...s.tribes] : [],
    players: [...s.players.values()].map(toPlayer),
    pairing: [...(s.pairing ?? [])].map(p => ({ playerA: p.playerA, playerB: p.playerB, ghost: p.ghost })),
    mode: s.mode === 'custom' ? 'custom' : 'ranked',
    room: { name: s.room?.name ?? '', hostId: s.room?.hostId ?? '', maxPlayers: s.room?.maxPlayers ?? AUTO_BATTLER.MAX_PLAYERS, bots: s.room?.bots ?? 0, anomaly: s.room?.anomaly ?? 'random', timer: s.room?.timer ?? 60 },
    discover: null,
  });
}

export const autoBattlerSession = {
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  getSnapshot: () => snapshot,
  /** Sits down at the ranked queue, creates a custom room, or joins one by id (see AbTarget). Idempotent while seated. */
  async connect(target: AbTarget = { kind: 'ranked' }) {
    if (room || snapshot.status === 'connecting') return;
    lastTarget = target;
    const attempt = ++generation;
    publish({ ...empty(), status: 'connecting' });
    try {
      const client = new Client(serverOrigin());
      const name = playerSession.getSnapshot().library?.profile.username ?? i18n.t('guest');
      let table = '';
      try { table = sessionStorage.getItem('kartishki-ab-table') ?? ''; } catch { /* optional */ }
      let joined: Room<AutoBattlerRoomState>;
      const token = sessionStorage.getItem(RECONNECT_KEY);
      const join = (auth: { playerToken?: string }) => target.kind === 'create'
        ? client.create<AutoBattlerRoomState>('autoBattler', { displayName: name, mode: 'custom', room: target.settings, ...auth }, AutoBattlerRoomState)
        : target.kind === 'join'
          ? client.joinById<AutoBattlerRoomState>(target.roomId, { displayName: name, ...auth }, AutoBattlerRoomState)
          : client.joinOrCreate<AutoBattlerRoomState>('autoBattler', { displayName: name, mode: 'ranked', table, set: chosenCardSet(), ...auth }, AutoBattlerRoomState);
      try {
        joined = token ? await client.reconnect<AutoBattlerRoomState>(token, AutoBattlerRoomState) : await join(playerSession.authOptions());
      } catch {
        try {
          joined = await join(playerSession.authOptions());
        } catch (error) {
          // Same account in a second tab (local testing): sit down as a guest instead of bouncing.
          if (!(error instanceof Error && error.message.includes('alreadyInMatch'))) throw error;
          joined = await join({});
        }
      }
      if (attempt !== generation) { await joined.leave(); return; }
      room = joined;
      try { sessionStorage.setItem(RECONNECT_KEY, joined.reconnectionToken); } catch { /* optional */ }
      joined.onStateChange(() => sync(joined));
      joined.onMessage(EV.catalog, (catalog: AutoBattlerCatalog) => { if (room === joined) publish({ catalog }); });
      joined.onMessage(EV.heroOffers, (heroOffers: AutoBattlerHeroDef[]) => { if (room === joined) publish({ heroOffers }); });
      joined.onMessage(EV.discoverOptions, (discover: DiscoverOptionsMessage) => { if (room === joined) publish({ discover }); });
      joined.onMessage(EV.rewards, (rewards: BattlegroundsRewards) => { if (room === joined) playerSession.finishBattlegrounds(rewards); });
      joined.onMessage(EV.combatEvents, (combat: CombatEventsMessage) => {
        if (room !== joined) return;
        const visual = (m: CombatEventsMessage['boards']['a'][number]): AbMinion => ({ ...m, kind: 'minion', maxHealth: m.health });
        publish({
          combat,
          combatBoards: { playerA: combat.playerA, playerB: combat.playerB, a: combat.boards.a.map(visual), b: combat.boards.b.map(visual) },
        });
      });
      joined.onMessage(EV.actionError, (payload: ActionErrorPayload | string) => {
        if (room !== joined) return;
        const code = typeof payload === 'string' ? payload : payload.code;
        pending = [];
        publish({ error: code === 'REJECTED' ? 'rejected' : code });
        clearTimeout(errorTimer);
        errorTimer = setTimeout(() => { if (room === joined) publish({ error: '' }); }, 2800);
      });
      joined.onError(() => { if (room === joined) publish({ error: 'connectionError' }); });
      joined.onLeave(code => {
        if (room !== joined) return;
        room = undefined;
        pending = [];
        if (code === 4000) {
          try { sessionStorage.removeItem(RECONNECT_KEY); } catch { /* optional */ }
          publish(empty());
          return;
        }
        publish({ status: 'offline' });
        void autoBattlerSession.connect(lastTarget.kind === 'create' ? { kind: 'join', roomId: joined.roomId } : lastTarget);
      });
      sync(joined);
      joined.send(MSG.ready);
    } catch {
      if (attempt === generation) publish({ ...empty(), error: 'connectionError' });
    }
  },
  startGame() { room?.send(MSG.startGame); },
  /** Host only, lobby only; the server re-validates every field. */
  updateRoomSettings(patch: Partial<RoomSettings>) { room?.send(MSG.roomSettings, patch); },
  /** Pick a set for the next table: leave the current lobby and sit down at one matched by the new set. */
  chooseCardSet(setId: string) {
    rememberCardSet(setId);
    autoBattlerSession.leave();
    void autoBattlerSession.connect();
  },
  chooseHero(heroId: string) { room?.send(MSG.chooseHero, { heroId }); },
  buy(offerId: string) {
    sendIntent(MSG.buy, { offerId }, { type: 'buy', id: offerId });
  },
  sell(minionId: string) { sendIntent(MSG.sell, { minionId }, { type: 'sell', id: minionId }); },
  reroll() { sendIntent(MSG.reroll); },
  freeze() { sendIntent(MSG.freeze); },
  tierUp() { sendIntent(MSG.tierUp); },
  playCard(cardId: string, boardIndex?: number) {
    sendIntent(MSG.playCard, boardIndex === undefined ? { cardId } : { cardId, boardIndex }, { type: 'play', id: cardId, index: boardIndex });
  },
  moveBoard(minionId: string, toIndex: number) { sendIntent(MSG.moveBoard, { minionId, toIndex }, { type: 'move', id: minionId, index: toIndex }); },
  heroPower(targetId?: string) { sendIntent(MSG.heroPower, targetId ? { targetId } : {}); },
  endRecruit() { sendIntent(MSG.endRecruit); },
  cancelRecruit() { sendIntent(MSG.cancelRecruit); },
  discoverPick(optionId: string) { sendIntent(MSG.discoverPick, { optionId }); },
  clearCombat() { publish({ combat: null, combatBoards: null }); },
  /** Forget local guesses and show the server truth (used when a gesture is abandoned). */
  dropOptimistic,
  leave() {
    clearTimeout(errorTimer);
    generation++;
    pending = [];
    try { sessionStorage.removeItem(RECONNECT_KEY); } catch { /* optional */ }
    const previous = room;
    room = undefined;
    void previous?.leave();
    publish(empty());
  },
  debug(patch: { gold?: number; health?: number; tier?: number }) {
    if (import.meta.env.DEV) room?.send('debug', patch);
  },
};
