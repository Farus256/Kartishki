import { Client, type Room } from '@colyseus/sdk';
import {
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
} from '@kartishki/shared';
import { playerSession } from './playerSession';
import { serverOrigin } from './serverUrl';

const RECONNECT_KEY = 'kartishki-ab-reconnect';

export type AbMinion = {
  id: string; cardId: string; baseId: string; kind: string;
  attack: number; health: number; maxHealth: number; tavernTier: number;
  keywords: string[]; golden: boolean; owner: string;
};

export type AbPower = {
  id: string; isPassive: boolean; goldCost: number; isExhausted: boolean;
  targeted: boolean; targetDomain: string;
};

export type AbPlayer = {
  sessionId: string; displayName: string;
  heroId: string; portraitKey: string; health: number; maxHealth: number;
  power: AbPower; gold: number; tavernTier: number; upgradeCost: number;
  board: AbMinion[]; hand: AbMinion[];
  tavern: { offers: AbMinion[]; frozen: boolean; size: number };
  nextOpponentId: string; swords: boolean; eliminated: boolean; placement: number;
  recruitReady: boolean; lastCombatResult: string; lastCombatDamage: number;
  tripleSerial: number;
  lastCombatSummary: string; discoverOpen: boolean; pendingDiscover: AbMinion[];
};

export type AbCombatBoards = { playerA: string; playerB: string; a: AbMinion[]; b: AbMinion[] };

export type AbSnapshot = {
  status: 'offline' | 'connecting' | 'online';
  phase: string; turn: number; revision: number; recruitSeconds: number; heroSeconds: number; sessionId: string; error: string; winnerId: string;
  players: AbPlayer[];
  catalog: AutoBattlerCatalog;
  heroOffers: AutoBattlerHeroDef[];
  discover: DiscoverOptionsMessage | null;
  combat: CombatEventsMessage | null;
  combatBoards: AbCombatBoards | null;
  pairing: { playerA: string; playerB: string; ghost: boolean }[];
};

const empty = (): AbSnapshot => ({
  status: 'offline', phase: 'LOBBY', turn: 0, revision: 0, recruitSeconds: 0, heroSeconds: 0, sessionId: '', error: '', winnerId: '',
  players: [], catalog: starterAutoBattlerCatalog, heroOffers: [], discover: null, combat: null, combatBoards: null, pairing: [],
});

function toMinion(m: AutoBattlerMinionState): AbMinion {
  return {
    id: m.id, cardId: m.cardId, baseId: m.baseId, kind: m.kind,
    attack: m.attack, health: m.health, maxHealth: m.maxHealth, tavernTier: m.tavernTier,
    keywords: [...m.keywords], golden: m.golden, owner: m.owner,
  };
}

function toPlayer(p: AutoBattlerPlayerState): AbPlayer {
  return {
    sessionId: p.sessionId, displayName: p.displayName || p.sessionId.slice(0, 8),
    heroId: p.hero.heroId, portraitKey: p.hero.portraitKey,
    health: p.hero.health, maxHealth: p.hero.maxHealth,
    power: {
      id: p.hero.power.id, isPassive: p.hero.power.isPassive, goldCost: p.hero.power.goldCost,
      isExhausted: p.hero.power.isExhausted, targeted: p.hero.power.targeted, targetDomain: p.hero.power.targetDomain,
    },
    gold: p.gold, tavernTier: p.tavernTier, upgradeCost: p.upgradeCost,
    board: [...(p.board ?? [])].map(toMinion), hand: [...(p.hand ?? [])].map(toMinion),
    tavern: { offers: [...(p.tavern.offers ?? [])].map(toMinion), frozen: p.tavern.frozen, size: p.tavern.size },
    nextOpponentId: p.nextOpponentId, swords: p.swords, eliminated: p.eliminated, placement: p.placement,
    recruitReady: p.recruitReady, lastCombatResult: p.lastCombatResult, lastCombatDamage: p.lastCombatDamage,
    lastCombatSummary: p.lastCombatSummary, discoverOpen: p.discoverOpen,
    pendingDiscover: [...(p.pendingDiscover ?? [])].map(toMinion), tripleSerial: p.tripleSerial,
  };
}

let snapshot = empty();
const listeners = new Set<() => void>();
let room: Room<AutoBattlerRoomState> | undefined;
let generation = 0;
let actionId = Date.now();
let errorTimer: ReturnType<typeof setTimeout> | undefined;
const sendIntent = (message: string, data: Record<string, unknown> = {}) => room?.send(message, { ...data, turn: snapshot.turn, actionId: ++actionId });

const publish = (patch: Partial<AbSnapshot>) => { snapshot = { ...snapshot, ...patch }; listeners.forEach(fn => fn()); };

function sync(joined: Room<AutoBattlerRoomState>) {
  if (room !== joined) return;
  const s = joined.state;
  publish({
    status: 'online', phase: s.phase, turn: s.turn, revision: s.revision, recruitSeconds: s.recruitSeconds,
    sessionId: joined.sessionId, winnerId: s.winnerId, heroSeconds: s.heroSeconds,
    players: [...s.players.values()].map(toPlayer),
    pairing: [...(s.pairing ?? [])].map(p => ({ playerA: p.playerA, playerB: p.playerB, ghost: p.ghost })),
    discover: null,
  });
}

export const autoBattlerSession = {
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  getSnapshot: () => snapshot,
  async connect() {
    if (room || snapshot.status === 'connecting') return;
    const attempt = ++generation;
    publish({ ...empty(), status: 'connecting' });
    try {
      const client = new Client(serverOrigin());
      const name = playerSession.getSnapshot().library?.profile.username ?? 'Гость';
      let table = '';
      try { table = sessionStorage.getItem('kartishki-ab-table') ?? ''; } catch { /* optional */ }
      let joined: Room<AutoBattlerRoomState>;
      const token = sessionStorage.getItem(RECONNECT_KEY);
      try {
        joined = token
          ? await client.reconnect<AutoBattlerRoomState>(token, AutoBattlerRoomState)
          : await client.joinOrCreate<AutoBattlerRoomState>('autoBattler', { displayName: name, table, ...playerSession.authOptions() }, AutoBattlerRoomState);
      } catch {
        joined = await client.joinOrCreate<AutoBattlerRoomState>('autoBattler', { displayName: name, table, ...playerSession.authOptions() }, AutoBattlerRoomState);
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
        publish({ error: code === 'REJECTED' ? 'rejected' : code });
        clearTimeout(errorTimer);
        errorTimer = setTimeout(() => { if (room === joined) publish({ error: '' }); }, 2800);
      });
      joined.onError(() => { if (room === joined) publish({ error: 'connectionError' }); });
      joined.onLeave(code => {
        if (room !== joined) return;
        room = undefined;
        if (code === 4000) {
          try { sessionStorage.removeItem(RECONNECT_KEY); } catch { /* optional */ }
          publish(empty());
          return;
        }
        publish({ status: 'offline' });
        void autoBattlerSession.connect();
      });
      sync(joined);
      joined.send(MSG.ready);
    } catch {
      if (attempt === generation) publish({ ...empty(), error: 'connectionError' });
    }
  },
  startGame() { room?.send(MSG.startGame); },
  chooseHero(heroId: string) { room?.send(MSG.chooseHero, { heroId }); },
  buy(offerId: string) {
    sendIntent(MSG.buy, { offerId });
  },
  sell(minionId: string) { sendIntent(MSG.sell, { minionId }); },
  reroll() { sendIntent(MSG.reroll); },
  freeze() { sendIntent(MSG.freeze); },
  tierUp() { sendIntent(MSG.tierUp); },
  playCard(cardId: string, boardIndex?: number) {
    sendIntent(MSG.playCard, boardIndex === undefined ? { cardId } : { cardId, boardIndex });
  },
  moveBoard(minionId: string, toIndex: number) { sendIntent(MSG.moveBoard, { minionId, toIndex }); },
  heroPower(targetId?: string) { sendIntent(MSG.heroPower, targetId ? { targetId } : {}); },
  endRecruit() { sendIntent(MSG.endRecruit); },
  discoverPick(optionId: string) { sendIntent(MSG.discoverPick, { optionId }); },
  clearCombat() { publish({ combat: null, combatBoards: null }); },
  leave() {
    clearTimeout(errorTimer);
    generation++;
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
