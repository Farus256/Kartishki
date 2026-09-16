import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { MATCH_RULES, type GameEvent } from '@kartishki/shared';
import { audioManager } from '../AudioManager';
import { spawnBurst, stageBox } from '../battlegrounds/tableFx';
import { session, type Minion } from '../session';
import { DuelHand } from './DuelHand';
import { DuelHero } from './DuelHero';
import { DuelMinion } from './DuelMinion';
import { centerOf, dust, impact, lunge, pop, rip, shieldPop, walkHome } from './duelFx';
import { DUEL, rowXs } from './duelLayout';
import { useDuelDrag, type DuelAim } from './useDuelDrag';

type Dying = { minion: Minion; x: number; own: boolean };

/**
 * The 1v1 table. State comes from the session snapshot; the presentation reacts to the server's event stream:
 * a blow keeps the struck numbers at their old value until the attacker lands, a death keeps the tile on the
 * table until it has crumbled, a drawn card slides in from the deck.
 */
export function DuelBoard({ onHint }: { onHint?: (hint: string) => void }) {
  const { t, i18n } = useTranslation();
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const field = useRef<HTMLDivElement>(null);
  const tiles = useRef(new Map<string, HTMLDivElement>());
  const heroes = useRef(new Map<string, HTMLDivElement>());
  /** Blows land on the portrait, not the whole hero block. */
  const face = (id: string) => heroes.current.get(id)?.querySelector<HTMLElement>('.duel-hero-face') ?? heroes.current.get(id);
  const entityEl = (id: string | undefined) => (id ? tiles.current.get(id) ?? face(id) : undefined);
  const [holds, setHolds] = useState<Record<string, number>>({});
  const [dying, setDying] = useState<Dying[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const cards = useMemo(() => new Map(state.cards.map(c => [c.id, c])), [state.cards]);
  const me = state.players.find(p => p.id === state.sessionId);
  const foe = state.players.find(p => p.id !== state.sessionId);
  const myTurn = state.status === 'active' && state.activePlayer === state.sessionId;
  const mine = state.minions.filter(m => m.owner === state.sessionId);
  const theirs = state.minions.filter(m => m.owner !== state.sessionId);
  const myHero = state.heroes.find(h => h.id === me?.heroId);
  const boardFull = mine.length >= MATCH_RULES.BOARD_LIMIT;

  const legalTargets = useCallback((aim: DuelAim): Set<string> => {
    if (aim.kind === 'hand' || !foe) return new Set();
    if (aim.kind === 'power') return new Set([...theirs.map(m => m.id), foe.id]);
    const taunts = theirs.filter(m => cards.get(m.cardId)?.properties.includes('taunt'));
    return new Set(taunts.length ? taunts.map(m => m.id) : [...theirs.map(m => m.id), foe.id]);
  }, [theirs, foe, cards]);
  const drag = useDuelDrag({
    screenRef: field, legalTargets,
    onPlay: id => { audioManager.play('ab_drop_board'); session.play(id); },
    onAttack: (id, targetId) => { setSelected(null); session.attack(id, targetId); },
    onPower: targetId => { setSelected(null); session.power(targetId); audioManager.play('ab_power'); },
  });
  const aim = drag.view.aim;
  const targets = aim && aim.kind !== 'hand' ? legalTargets(aim) : null;
  useEffect(() => { if (!myTurn) { drag.cancel(); setSelected(null); } }, [myTurn]);

  // Hand cards drawn since the previous render slide in from the deck.
  const knownHand = useRef(new Set<string>());
  const fresh = useMemo(() => { const set = new Set(state.hand.filter(h => !knownHand.current.has(h.instanceId)).map(h => h.instanceId)); knownHand.current = new Set(state.hand.map(h => h.instanceId)); return set; }, [state.hand]);
  // Minions that just appeared get the arrival puff.
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    const now = new Set(state.minions.map(m => m.id));
    if (known.current && field.current) for (const id of now) if (!known.current.has(id)) { const el = tiles.current.get(id); const at = el ? centerOf(field.current, el) : undefined; if (at) dust(field.current, at, 3); }
    known.current = now;
  }, [state.minions]);

  // Health changes nobody animated (battlecries, deathrattles, heals) still get their number pop.
  const previous = useRef(state);
  const held = useRef(new Set<string>());
  useEffect(() => {
    const before = previous.current; previous.current = state;
    if (!field.current || before.status !== 'active') return;
    const was = new Map<string, number>([...before.minions.map(m => [m.id, m.health] as const), ...before.players.map(p => [p.id, p.health] as const)]);
    for (const entity of [...state.minions, ...state.players]) {
      const old = was.get(entity.id);
      if (old === undefined || old === entity.health || held.current.has(entity.id)) continue;
      const el = entityEl(entity.id);
      if (!el) continue;
      const delta = entity.health - old;
      pop(el, delta, false, 900);
      if (delta < 0 && heroes.current.has(entity.id)) impact(field.current, el, -delta, undefined, undefined, true);
    }
  }, [state]);

  // The event stream drives the choreography; tasks run in order so a death waits for the blow that caused it.
  const queue = useRef(Promise.resolve());
  const chain = (task: () => Promise<void> | void) => { queue.current = queue.current.then(task).catch(() => {}); };
  useEffect(() => session.onEvent((event: GameEvent) => {
    const f = field.current; if (!f) return;
    const snapshot = session.getSnapshot();
    if (event.kind === 'attack') {
      const source = snapshot.minions.find(m => m.id === event.source);
      const targetMinion = snapshot.minions.find(m => m.id === event.target);
      const targetHero = snapshot.players.find(p => p.id === event.target);
      const hold: Record<string, number> = {};
      if (source) hold[source.id] = source.health;
      if (targetMinion) hold[targetMinion.id] = targetMinion.health; else if (targetHero) hold[targetHero.id] = targetHero.health;
      for (const id of Object.keys(hold)) held.current.add(id);
      setHolds(h => ({ ...h, ...hold }));
      const damage = event.amount ?? source?.attack ?? 0;
      const retaliation = targetMinion?.attack ?? 0;
      const shielded = { source: !!source?.shield, target: !!targetMinion?.shield };
      chain(async () => {
        const attacker = tiles.current.get(event.source), victim = entityEl(event.target);
        const from = centerOf(f, attacker), to = centerOf(f, victim);
        if (attacker && from && to) await lunge(f, attacker, from, to);
        const now = session.getSnapshot();
        // By now the patch has landed: a minion that died is gone from the state, a hero at 0 stays.
        const gone = (id: string) => !now.minions.some(m => m.id === id);
        if (victim) {
          if (shielded.target && !now.minions.find(m => m.id === event.target)?.shield) shieldPop(f, victim);
          else { impact(f, victim, damage, from, to, !!targetHero); if (damage) pop(victim, -damage, targetHero ? (now.players.find(p => p.id === event.target)?.health ?? 1) <= 0 : gone(event.target ?? '')); }
        }
        if (attacker && retaliation > 0) {
          if (shielded.source && !now.minions.find(m => m.id === event.source)?.shield) shieldPop(f, attacker);
          else { impact(f, attacker, retaliation, to, from); pop(attacker, -retaliation, gone(event.source)); }
        }
        for (const id of Object.keys(hold)) held.current.delete(id);
        setHolds(h => { const next = { ...h }; for (const id of Object.keys(hold)) delete next[id]; return next; });
        if (attacker) await walkHome(f, attacker);
      });
    } else if (event.kind === 'death') {
      const minion = snapshot.minions.find(m => m.id === event.source);
      const el = tiles.current.get(event.source);
      if (minion && el) {
        const own = minion.owner === snapshot.sessionId;
        setDying(list => [...list, { minion: { ...minion }, x: el.offsetLeft, own }]);
        chain(async () => {
          const tile = tiles.current.get(event.source);
          if (tile) await rip(f, tile);
          setDying(list => list.filter(item => item.minion.id !== event.source));
        });
      }
    } else if (event.kind === 'spawn') {
      audioManager.play('ab_summon');
    } else if (event.kind === 'draw') {
      audioManager.play('card_flip');
    } else if (event.kind === 'burn') {
      audioManager.play('card_remove');
      const deck = heroes.current.get(event.source)?.querySelector('.duel-deck');
      const at = deck ? stageBox(deck) : null;
      if (at) spawnBurst({ x: at.x + at.w / 2, y: at.y + at.h / 2, w: 10, h: 10 }, '#ff7b3a', 14);
      const burnt = snapshot.cards.find(c => c.id === event.cardId); onHint?.(t('cardBurned', { name: burnt?.name[i18n.language] || burnt?.name.ru || '' }));
    } else if (event.kind === 'fatigue') {
      const hero = face(event.source);
      if (hero) { impact(f, hero, event.amount ?? 1, undefined, undefined, true); pop(hero, -(event.amount ?? 1)); held.current.add(event.source); window.setTimeout(() => held.current.delete(event.source), 200); }
      onHint?.(t('fatigueHint', { n: event.amount ?? 1 }));
    } else if (event.kind === 'coin') {
      audioManager.play('ab_coin');
      const purse = heroes.current.get(event.source)?.querySelector('.duel-mana');
      const at = purse ? stageBox(purse) : null;
      if (at) spawnBurst({ x: at.x + at.w / 2, y: at.y + at.h / 2, w: 10, h: 10 }, '#ffd76a', 16);
    } else if (event.kind === 'power') {
      audioManager.play('ab_power');
      const targetEl = entityEl(event.target);
      const heroEl = heroes.current.get(event.source);
      const targetHero = snapshot.players.find(p => p.id === event.target);
      if (targetEl && event.target !== event.source && event.amount) {
        const from = centerOf(f, heroEl?.querySelector('.ab-power') ?? heroEl), to = centerOf(f, targetEl);
        const prev = snapshot.minions.find(m => m.id === event.target)?.health ?? targetHero?.health;
        if (prev !== undefined) { held.current.add(event.target!); setHolds(h => ({ ...h, [event.target!]: prev })); }
        chain(async () => {
          if (from && to) spawnBurst({ x: from.x, y: from.y + DUEL.HEADER_H, w: 10, h: 10 }, '#9ef0ff', 12);
          await new Promise(resolve => window.setTimeout(resolve, 220));
          const now = session.getSnapshot();
          const wasShield = snapshot.minions.find(m => m.id === event.target)?.shield;
          if (wasShield && !now.minions.find(m => m.id === event.target)?.shield) shieldPop(f, targetEl); else { impact(f, targetEl, event.amount ?? 0, from, to, !!targetHero); pop(targetEl, -(event.amount ?? 0)); }
          held.current.delete(event.target!);
          setHolds(h => { const next = { ...h }; delete next[event.target!]; return next; });
        });
      }
    } else if (event.kind === 'turn') {
      audioManager.play('ab_end_turn');
    }
  }), [t, onHint]);

  const enemyHeroTarget = !!targets && !!foe && targets.has(foe.id);
  const targeting = !!targets;
  const onMinionClick = (m: Minion, own: boolean) => {
    if (drag.didDrag()) return;
    if (!own) { if (drag.clickTarget(m.id)) return; }
    if (own && myTurn && m.ready && m.attack > 0) {
      if (aim?.kind === 'minion' && aim.id === m.id) { if (!drag.justArmed()) { drag.cancel(); setSelected(null); } return; }
      setSelected(m.id); drag.select({ kind: 'minion', id: m.id }, tiles.current.get(m.id));
    }
  };
  const powerReady = !!me && !!myHero && myTurn && !me.powerUsed && me.mana >= myHero.ability.cost
    && !(myHero.ability.effectId === 'heal' && me.health >= me.maxHealth) && !(myHero.ability.effectId === 'summon' && boardFull);
  const onPower = () => {
    if (!myHero || !me) return;
    if (myHero.ability.effectId !== 'damage') { session.power(); audioManager.play('ab_power'); return; }
    if (aim?.kind === 'power') { if (!drag.justArmed()) drag.cancel(); return; }
    drag.select({ kind: 'power', id: me.id }, heroes.current.get(me.id)?.querySelector<HTMLElement>('.ab-power'));
  };
  const tile = (m: Minion, x: number, own: boolean, isDying = false) => {
    const card = cards.get(m.cardId); if (!card) return null;
    // A dying tile keeps the held (pre-blow) number until the hit lands, then shows zero while it crumbles.
    return <DuelMinion key={m.id} ref={el => { if (el) tiles.current.set(m.id, el); else tiles.current.delete(m.id); }}
      minion={m} card={card} catalog={state.cards} own={own} x={x} shownHealth={isDying ? holds[m.id] ?? 0 : holds[m.id]}
      canAttack={own && myTurn && m.ready && m.attack > 0 && !isDying}
      selected={selected === m.id}
      target={!!targets?.has(m.id)}
      dim={targeting && !own && !targets?.has(m.id)}
      dying={isDying}
      onPress={event => { if (own) { setSelected(m.id); drag.begin({ kind: 'minion', id: m.id }, event); } }}
      onClick={() => onMinionClick(m, own)} />;
  };
  const dyingIds = new Set(dying.map(d => d.minion.id));
  // One keyed list per row so a tile that starts dying keeps its DOM node (and its running animations).
  const row = (list: Minion[], own: boolean) => {
    const live = list.filter(m => !dyingIds.has(m.id)), xs = rowXs(live.length);
    return [...live.map((m, i) => tile(m, xs[i] ?? 0, own)), ...dying.filter(d => d.own === own).map(d => tile(d.minion, d.x, own, true))];
  };
  return (
    <div ref={field} className={`duel-field ${aim?.kind === 'hand' && drag.view.dragging ? 'is-placing' : ''} ${drag.view.overBoard ? 'is-over-board' : ''} ${targeting ? 'is-targeting' : ''}`} data-testid="duel-field" style={{ '--duel-turn': myTurn ? 1 : 0 } as CSSProperties}>
      {foe && <DuelHero ref={el => { if (el) heroes.current.set(foe.id, el); else heroes.current.delete(foe.id); }} player={foe} hero={state.heroes.find(h => h.id === foe.heroId)} cards={state.cards} own={false}
        shownHealth={holds[foe.id]} target={enemyHeroTarget} dim={targeting && !enemyHeroTarget} powerReady={false} powerAiming={false}
        onClick={() => { if (!drag.didDrag()) drag.clickTarget(foe.id); }} />}
      <section className="duel-row is-foe" data-testid="duel-row-foe" aria-label={t('opponent')}>
        {row(theirs, false)}
      </section>
      <div className="duel-divider" aria-hidden><span>{t('turn', { turn: state.turn })}</span></div>
      <section className="duel-row is-own" data-testid="duel-row-own" data-duel-zone="board" aria-label={t('you')}>
        {row(mine, true)}
        {aim?.kind === 'hand' && drag.view.dragging && !boardFull && <div className="duel-drop-hint">{t('duelDropHere')}</div>}
      </section>
      {me && <DuelHero ref={el => { if (el) heroes.current.set(me.id, el); else heroes.current.delete(me.id); }} player={me} hero={myHero} cards={state.cards} own
        shownHealth={holds[me.id]} target={false} dim={false} powerReady={powerReady} powerAiming={aim?.kind === 'power'}
        onPowerPress={event => drag.begin({ kind: 'power', id: me.id }, event)} onPower={onPower} onClick={() => {}} />}
      {me && <DuelHand hand={state.hand} cards={cards} mana={me.mana} boardFull={boardFull} myTurn={myTurn} liftedId={aim?.kind === 'hand' && drag.view.dragging ? aim.id : null} fresh={fresh}
        onPress={(id, event) => drag.begin({ kind: 'hand', id }, event)}
        onPlay={id => { if (drag.didDrag()) return; audioManager.play('ab_drop_board'); session.play(id); }} />}
      {targeting && <p className="duel-aim-hint" role="status">{aim?.kind === 'power' ? t('abPowerTarget') : t('duelPickTarget')} · Esc</p>}
      {drag.overlay}
    </div>
  );
}

