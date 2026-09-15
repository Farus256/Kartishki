import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { AUTO_BATTLER, goldForTurn } from '@kartishki/shared';
import { autoBattlerSession, type AbMinion, type AbPlayer } from '../autoBattlerSession';
import { audioManager } from '../AudioManager';
import { TripleMerge, type TriplePiece } from '../battlegrounds/TripleMerge';
import { flyClone, stageBox, type Box } from '../battlegrounds/tableFx';
import { STAGE_W, stageRoot } from '../ui/stageCoords';
import { useCatalog } from '../ui/useCatalog';
import { playMinionVoice, setLinkedCards } from '../battlegrounds/voiceLines';
import { NewbieHints } from '../battlegrounds/NewbieHints';
import { AnomalyBadge } from '../battlegrounds/AnomalyBadge';
import { GameOverCard } from '../battlegrounds/GameOverCard';
import { playerSession } from '../playerSession';
import { GameCursor } from '../ui/GameCursor';
import { BoardRow } from '../battlegrounds/BoardRow';
import { BuffFlashProvider } from '../battlegrounds/MinionTile';
import { CombatPlayback } from '../battlegrounds/CombatPlayback';
import { DiscoverModal } from '../battlegrounds/DiscoverModal';
import { HandRow } from '../battlegrounds/HandRow';
import { GoldPurse, HeroDock } from '../battlegrounds/HeroDock';
import { HeroSelect } from '../battlegrounds/HeroSelect';
import { Leaderboard } from '../battlegrounds/Leaderboard';
import { TavernRow } from '../battlegrounds/TavernRow';
import { AbDndProvider } from '../battlegrounds/abDndContext';
import { useAbPointerDnd } from '../battlegrounds/useAbPointerDnd';
import { intentKey, type AbIntent } from '../battlegrounds/pointerDnd';
import { AB_LAYOUT } from '../battlegrounds/battlegroundsLayout';
import { useCardLerp } from '../battlegrounds/useCardLerp';
import { InkButton } from '../ui/InkButton';
import { hidePaperTooltips } from '../ui/PaperTooltip';
import '../battlegrounds/battlegrounds.css';
import '../battlegrounds/fx-cards.css';
import '../battlegrounds/fx-table.css';
import '../battlegrounds/fx-combat.css';
import '../battlegrounds/fx-polish.css';

export function BattlegroundsScreen({ onLeave }: { onLeave: () => void }) {
  const { t } = useTranslation();
  const state = useSyncExternalStore(autoBattlerSession.subscribe, autoBattlerSession.getSnapshot);
  const player = useSyncExternalStore(playerSession.subscribe, playerSession.getSnapshot);
  const reward = player.lastReward;
  const recruitHeroes = useRef(state.players);
  if (state.phase === 'RECRUIT_PHASE' && !state.combat) recruitHeroes.current = state.players;
  const [aim, setAim] = useState<'tavern' | 'board' | null>(null);
  const [playing, setPlaying] = useState(false);
  const lastCombat = useRef<{ combat: NonNullable<typeof state.combat>; boards: NonNullable<typeof state.combatBoards> } | null>(null);
  if (state.combat && state.combatBoards) lastCombat.current = { combat: state.combat, boards: state.combatBoards };
  const combatTable = playing || !!state.combat || state.phase === 'COMBAT_PHASE';
  // Standings drop when the hit lands on screen (CombatPlayback reports it), not when the state arrives.
  const [struck, setStruck] = useState<Record<string, number>>({});
  const leaderboardPlayers = combatTable ? (recruitHeroes.current.length ? recruitHeroes.current : state.players).map(p => {
    const health = struck[p.sessionId] ?? lastCombat.current?.combat.initialHealth?.[p.sessionId] ?? p.health;
    return { ...p, health, eliminated: health <= 0 };
  }) : state.players;
  if (!combatTable && !state.combat) lastCombat.current = null;
  const [selected, setSelected] = useState<string | null>(null);
  const [triple, setTriple] = useState(false);
  const lastTriple = useRef(0);
  const screenRef = useRef<HTMLDivElement>(null);
  const flightFrom = useRef(new Map<string, DOMRect>());
  const me = state.players.find(p => p.sessionId === state.sessionId);
  const cards = useCatalog();
  useEffect(() => { setLinkedCards(cards); }, [cards]);
  const opponent = state.players.find(p => p.sessionId === me?.nextOpponentId);
  useEffect(() => {
    if (me && me.tripleSerial > lastTriple.current) { setTriple(true); lastTriple.current = me.tripleSerial; const timer = setTimeout(() => setTriple(false), 1600); return () => clearTimeout(timer); }
  }, [me?.tripleSerial]);

  useEffect(() => { void autoBattlerSession.connect(); }, []);
  useEffect(() => { if (state.combat) setPlaying(true); }, [state.combat]);

  const inRecruit = state.phase === 'RECRUIT_PHASE' && !!me && !me.eliminated && !playing;
  const recruit = inRecruit && !me!.recruitReady;
  const discover: AbMinion[] = state.discover
    ? state.discover.options.map(option => ({
      id: option.id, cardId: option.cardId, baseId: option.cardId, kind: 'minion',
      attack: option.attack, health: option.health, maxHealth: option.health,
      tavernTier: option.tavernTier, keywords: option.keywords, golden: false, owner: state.sessionId,
    }))
    : me?.pendingDiscover ?? [];
  const dndEnabled = recruit && !discover.length && state.status === 'online' && state.phase !== 'GAME_OVER';

  const dnd = useAbPointerDnd({
    enabled: dndEnabled,
    me,
    catalog: state.catalog,
    screenRef,
    onIntent: (intent: AbIntent) => {
      if (intent.type === 'buy') autoBattlerSession.buy(intent.id);
      else if (intent.type === 'play') { autoBattlerSession.playCard(intent.id, intent.index); playMinionVoice(me?.hand.find(c => c.id === intent.id)?.cardId ?? '', 'spawn'); }
      else if (intent.type === 'move') autoBattlerSession.moveBoard(intent.id, intent.index);
      else if (intent.type === 'sell') autoBattlerSession.sell(intent.id);
      else if (intent.type === 'power') { autoBattlerSession.heroPower(intent.id); setAim(null); audioManager.play('ab_power'); }
    },
  });
  const before = useCardLerp(screenRef, [
    me?.tavern.offers.map(card => card.id).join(','),
    me?.hand.map(card => card.id).join(','),
    me?.board.map(card => card.id).join(','),
    // Re-run when a landed ghost hands over to its tile, so a late echo still flies the tile in.
    dnd.api.draggingId ?? '',
  ].join('|'), flightFrom);

  // Triple: the three consumed copies (measured on the previous commit) fly into the newborn golden card.
  const [merge, setMerge] = useState<{ pieces: TriplePiece[]; to: Box; goldenId: string; serial: number } | null>(null);
  const prevMe = useRef<AbPlayer | undefined>(undefined);
  useLayoutEffect(() => {
    const prev = prevMe.current;
    prevMe.current = me;
    if (!me || !prev || prev.sessionId !== me.sessionId || me.tripleSerial <= prev.tripleSerial) return;
    const nowIds = new Set([...me.board, ...me.hand].map(m => m.id));
    const prevIds = new Set([...prev.board, ...prev.hand].map(m => m.id));
    const born = [...me.hand, ...me.board].find(m => m.golden && !prevIds.has(m.id));
    const to = stageBox(born ? screenRef.current?.querySelector(`[data-ab-id="${CSS.escape(born.id)}"]`) : null);
    const base = stageRoot()?.getBoundingClientRect();
    if (!born || !to || !base) return;
    const zoom = base.width / STAGE_W;
    const pieces: TriplePiece[] = [...prev.board.map(m => ({ m, full: false })), ...prev.hand.map(m => ({ m, full: true }))]
      .filter(x => !nowIds.has(x.m.id) && !x.m.golden && x.m.baseId === born.baseId)
      .map(x => { const b = before.current.get(x.m.id); return b ? { minion: x.m, full: x.full, from: { x: b.x - base.left / zoom, y: b.y - base.top / zoom, w: b.w, h: b.h } } : null; })
      .filter((p): p is TriplePiece => !!p);
    if (pieces.length) setMerge({ pieces, to, goldenId: born.id, serial: me.tripleSerial });
  }, [me]);

  useEffect(() => {
    setAim(null); setSelected(null); dnd.api.cancel();
  }, [state.phase, state.turn]);
  useEffect(() => {
    if (!dndEnabled) dnd.api.cancel();
  }, [dndEnabled]);
  useEffect(() => { if (dnd.api.armed) setSelected(null); }, [dnd.api.armed]);
  // Anchors vanish under a still pointer when combat covers the table; their tooltips must not linger.
  useEffect(() => { hidePaperTooltips(); }, [combatTable, dnd.api.armed]);
  useEffect(() => {
    if (!state.error) return;
    dnd.api.cancel();
    if (state.error !== 'NOT_ENOUGH_GOLD' && state.error !== 'HERO_POWER_UNAFFORDABLE') audioManager.play('ab_error');
  }, [state.error]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setAim(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function leave() {
    autoBattlerSession.leave();
    playerSession.clearMatchReward();
    if (player.library) void playerSession.refresh();
    onLeave();
  }
  function playAgain() { lastTriple.current = 0; setTriple(false); setPlaying(false); playerSession.clearMatchReward(); autoBattlerSession.leave(); void autoBattlerSession.connect(); }

  function send(intent: AbIntent) {
    if (!dnd.api.tryLock(intentKey(intent))) return;
    if (intent.type === 'buy' || intent.type === 'play') rememberCard(intent.id);
    if (intent.type === 'sell') {
      // A click-sale has no drag ghost, so the tile itself flies to the bartender.
      const tile = screenRef.current?.querySelector<HTMLElement>(`[data-ab-id="${CSS.escape(intent.id)}"]`);
      const bar = stageBox(screenRef.current?.querySelector('[data-testid="ab-sell-zone"]'));
      if (tile && bar) flyClone(tile, bar);
    }
    if (intent.type === 'buy') autoBattlerSession.buy(intent.id);
    else if (intent.type === 'play') { autoBattlerSession.playCard(intent.id, intent.index); playMinionVoice(me?.hand.find(c => c.id === intent.id)?.cardId ?? '', 'spawn'); }
    else if (intent.type === 'move') autoBattlerSession.moveBoard(intent.id, intent.index);
    else if (intent.type === 'sell') autoBattlerSession.sell(intent.id);
    else if (intent.type === 'power') { autoBattlerSession.heroPower(intent.id); setAim(null); audioManager.play('ab_power'); }
  }

  function onPower() {
    if (!me || !recruit) return;
    if (aim) { setAim(null); return; }
    if (me.power.targeted && (me.power.targetDomain === 'tavern' || me.power.targetDomain === 'board')) {
      setAim(me.power.targetDomain);
      return;
    }
    send({ type: 'power' });
  }

  function rememberCard(id: string) {
    const el = screenRef.current?.querySelector<HTMLElement>(`[data-ab-id="${id}"]`);
    const box = el?.getBoundingClientRect();
    if (box && box.width > 2) flightFrom.current.set(id, box);
  }

  function onTavernMinion(id: string) {
    if (aim === 'tavern') { send({ type: 'power', id }); setAim(null); return; }
    rememberCard(id);
    send({ type: 'buy', id });
  }

  function onBoardMinion(id: string) {
    if (aim === 'board') { send({ type: 'power', id }); setAim(null); return; }
    setSelected(current => current === id ? null : id);
  }

  // Sand level: seconds left over the longest reading seen this turn (turn length is server-side).
  const sandRef = useRef({ turn: -1, total: 1 });
  if (sandRef.current.turn !== state.turn) sandRef.current = { turn: state.turn, total: Math.max(1, state.recruitSeconds) };
  else if (state.recruitSeconds > sandRef.current.total) sandRef.current.total = state.recruitSeconds;
  const sand = state.phase === 'RECRUIT_PHASE' && !combatTable ? Math.max(0, Math.min(1, state.recruitSeconds / sandRef.current.total)) : 0;
  const timer = !combatTable && state.phase === 'RECRUIT_PHASE'
    ? t('abTimer', { n: state.recruitSeconds })
    : state.phase === 'HERO_SELECTION'
      ? t('abTimer', { n: state.heroSeconds })
      : '—';

  return (
    <AbDndProvider value={dnd.api}>
      <GameCursor />
      <BuffFlashProvider me={me}>
      <div ref={screenRef}
        className={`ab-screen ${combatTable ? 'is-combat' : ''} ${dnd.api.armed ? 'is-ab-dragging' : ''} ${dnd.api.armed && !dnd.api.valid ? 'is-invalid' : ''} ${dnd.api.kind === 'power' && dnd.api.armed ? 'is-aim-drag' : ''}`}
        style={{ '--ab-lb': `${AB_LAYOUT.LEADERBOARD_W}px`, '--ab-rail': `${AB_LAYOUT.RAIL_W}px`, '--ab-header': `${AB_LAYOUT.HEADER_H}px` } as CSSProperties}
        data-testid="ab-screen"
        data-ab-zone={dnd.api.zone}
        data-dragging-id={dnd.api.draggingId ?? ''}>
        <header className="ab-header">
          <strong className="ab-brand">КАРТИШКИ <i>✳</i></strong>
          <span className={`connection ${state.status}`}>{t(state.status)}</span>
          <span>{t('abPhase_' + (combatTable ? 'COMBAT_PHASE' : state.phase), { defaultValue: state.phase })}</span>
          {state.turn > 0 && <span>{t('turn', { turn: combatTable ? lastCombat.current?.combat.turn ?? state.turn : state.turn })}</span>}
          <span className="ab-header-count">{state.players.length}/{AUTO_BATTLER.MAX_PLAYERS}</span>
          <div className="ml-auto flex gap-2">
            <InkButton size="sm" aria-label={t('settings')} onClick={() => window.dispatchEvent(new Event('open-settings'))}>⚙</InkButton>
            <InkButton size="sm" onClick={leave}>{t('leave')}</InkButton>
          </div>
        </header>

        <div className="ab-layout">
          <Leaderboard players={leaderboardPlayers} meId={state.sessionId} catalog={state.catalog} turn={state.turn} />
          <div className="ab-stage">
            {!combatTable && state.phase === 'RECRUIT_PHASE' && state.recruitSeconds > 0 && (
              <div className={`ab-rope ${state.recruitSeconds <= 10 ? 'is-short' : ''}`} data-testid="ab-rope" aria-label={timer}>
                <div className="ab-rope-remaining" style={{ width: `${sand * 100}%` }}><span className="ab-rope-ember"><i /><i /><i /></span></div>
              </div>
            )}
            <section className="ab-zone-tavern" data-testid="ab-zone-tavern">
              {me && (
                <TavernRow me={me} catalog={state.catalog} recruit={recruit} aimingTavern={aim === 'tavern'}
                  onBuy={onTavernMinion} onReroll={() => { if (dnd.api.tryLock('reroll')) autoBattlerSession.reroll(); }}
                  onFreeze={() => { if (dnd.api.tryLock('freeze')) autoBattlerSession.freeze(); }}
                  onTierUp={() => { if (dnd.api.tryLock('tierUp')) autoBattlerSession.tierUp(); }}
                  error={state.error} />
              )}
            </section>
            <section className="ab-zone-player" data-testid="ab-zone-player">
              {me && (
                <>
                  <div className="ab-round-band"><span>{t('abNextOpponent')} <b>VS {opponent?.displayName ?? '—'}</b></span><span>{aim ? t('abPowerTarget') : t('abOrderHint')}</span><small>{me.board.length}/7</small></div>
                  <BoardRow me={me} catalog={state.catalog} recruit={recruit} aimingBoard={aim === 'board'} selectedId={selected}
                    onActivate={onBoardMinion} />
                  {selected && recruit && <div className="ab-selection-tools"><button onClick={() => { send({ type: 'sell', id: selected }); setSelected(null); }}>{t('abSell')}</button><button onClick={() => setSelected(null)}>{t('cancel')}</button></div>}
                  <div className={`ab-buy-zone ${dnd.api.zone === 'buy' ? 'is-hot' : ''}`}>
                    <HeroDock me={me} catalog={state.catalog} recruit={recruit} aiming={!!aim} onPower={onPower} />
                  </div>
                  <HandRow me={me} catalog={state.catalog} recruit={recruit} onPlay={id => send({ type: 'play', id, index: me.board.length })} />
                </>
              )}
              {merge && <TripleMerge key={merge.serial} pieces={merge.pieces} to={merge.to} goldenId={merge.goldenId} catalog={state.catalog} onDone={() => setMerge(null)} />}
              {triple && <div className="ab-triple-stamp" role="status"><span className="ab-triple-cards"><i /><i /><i /><b>★</b></span><strong>{t('abTriple')}</strong><small>{t('abGoldenHint')}</small></div>}
              {!me && state.status === 'online' && <p className="ab-empty">{t('abWaiting', { count: state.players.length })}</p>}
              {state.status === 'connecting' && <p className="ab-empty">{t('connecting')}</p>}
            </section>
            {combatTable && lastCombat.current && <CombatPlayback combat={lastCombat.current.combat} boards={lastCombat.current.boards} waiting={!playing} phaseReady={state.phase !== 'COMBAT_PHASE'} recruitAfter={state.phase === 'RECRUIT_PHASE' && !me?.eliminated} meId={state.sessionId} catalog={state.catalog} players={state.players} pairing={state.pairing} initialHeroes={recruitHeroes.current} onDone={() => { setPlaying(false); setStruck({}); autoBattlerSession.clearCombat(); }} onHeroHealth={(id, health) => setStruck(current => ({ ...current, [id]: health }))} />}
            <AnomalyBadge id={state.anomalyId} />
            <aside className="ab-rail" data-testid="ab-rail">
              <div className={`ab-clock ${state.phase === 'RECRUIT_PHASE' && state.recruitSeconds <= 5 ? 'is-critical' : state.phase === 'RECRUIT_PHASE' && state.recruitSeconds <= 10 ? 'is-urgent' : ''}`} data-testid="ab-timer" aria-label={timer} data-running={sand > 0 ? '1' : '0'} style={{ '--sand': sand } as CSSProperties}>
                <svg viewBox="0 0 60 80" aria-hidden><g stroke="#2a1a10" strokeWidth="4" strokeLinejoin="round"><path d="M10 6h40M10 74h40M14 6c0 20 14 26 16 34-2 8-16 14-16 34M46 6c0 20-14 26-16 34 2 8 16 14 16 34" fill="none" /><path className="ab-clock-sand" d="M17 10h26c0 12-9 22-13 30-4-8-13-18-13-30Z" fill="#e8c27a" stroke="none" /><path className="ab-clock-stream" d="M30 42v26" stroke="#e8c27a" strokeWidth="3" strokeDasharray="3 4" /><path className="ab-clock-heap" d="M16 70h28c0-10-8-16-14-22-6 6-14 12-14 22Z" fill="#e8c27a" stroke="none" /></g></svg>
                <b>{timer}</b>
              </div>
              {me && !combatTable && <GoldPurse gold={me.gold} income={goldForTurn(state.turn)} turn={state.turn} />}
            </aside>
          </div>
        </div>

        {me && <NewbieHints me={me} turn={state.turn} recruit={recruit} dragging={dnd.api.armed} />}
        {dnd.overlay}

        {state.phase === 'LOBBY' && (
          <div className="ab-modal" data-testid="ab-lobby">
            <div className="ab-modal-card">
              <h2>{t('abLobby')}</h2>
              <p>{t('abWaiting', { count: state.players.length })}</p>
              <InkButton tone="blood" disabled={state.players.length < AUTO_BATTLER.MIN_PLAYERS} onClick={() => autoBattlerSession.startGame()}>
                {t('abStart')}
              </InkButton>
              {state.players.length < AUTO_BATTLER.MIN_PLAYERS && <p>{t('abNeedPlayers')}</p>}
            </div>
          </div>
        )}

        {state.phase === 'HERO_SELECTION' && (
          <HeroSelect offers={state.heroOffers} copy={state.catalog.copy} chosen={me?.heroId ?? ''} onChoose={id => autoBattlerSession.chooseHero(id)} />
        )}

        {discover.length > 0 && recruit && (
          <DiscoverModal options={discover} catalog={state.catalog} onPick={id => { if (dnd.api.tryLock(`discover:${id}`)) { audioManager.play('ab_discover'); autoBattlerSession.discoverPick(id); } }} />
        )}

        {(state.phase === 'GAME_OVER' || me?.eliminated) && !combatTable && (
          <GameOverCard placement={me?.placement ?? 0} finished={state.phase === 'GAME_OVER'} winner={state.winnerId === state.sessionId} reward={reward ?? undefined} onAgain={playAgain} onLeave={leave} />
        )}

        {state.error && <p className="battle-error" role="alert">{t(state.error, { defaultValue: state.error })}</p>}
      </div>
      </BuffFlashProvider>
    </AbDndProvider>
  );
}
