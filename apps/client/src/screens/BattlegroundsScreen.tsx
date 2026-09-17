import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { PlayerName } from '../cosmetics/PlayerName';
import { BoardAmbience } from '../cosmetics/Aura';
import { EnemyHand } from '../cosmetics/EnemyHand';
import { useTranslation } from 'react-i18next';
import { AUTO_BATTLER, goldForTurn } from '@kartishki/shared';
import { autoBattlerSession, type AbMinion, type AbPlayer } from '../autoBattlerSession';
import { chosenCardSet } from '../activeCardSet';
import { equippedBoard, onBoardChange } from '../cosmeticsLocal';
import { pickLoc } from '@kartishki/shared';
import { audioManager } from '../AudioManager';
import { TripleMerge, type TriplePiece } from '../battlegrounds/TripleMerge';
import { flyClone, stageBox, type Box } from '../battlegrounds/tableFx';
import { STAGE_W, stageRoot } from '../ui/stageCoords';
import { useCardSets, useCatalog } from '../ui/useCatalog';
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
import { FuseRope, SandClock, useDeadline } from '../battlegrounds/PhaseClock';
import { useCardLerp } from '../battlegrounds/useCardLerp';
import { InkButton } from '../ui/InkButton';
import { hidePaperTooltips } from '../ui/PaperTooltip';
import '../battlegrounds/battlegrounds.css';
import '../battlegrounds/fx-cards.css';
import '../battlegrounds/fx-table.css';
import '../battlegrounds/fx-combat.css';
import '../battlegrounds/fx-polish.css';

export function BattlegroundsScreen({ onLeave }: { onLeave: () => void }) {
  const { t, i18n } = useTranslation();
  const state = useSyncExternalStore(autoBattlerSession.subscribe, autoBattlerSession.getSnapshot);
  const player = useSyncExternalStore(playerSession.subscribe, playerSession.getSnapshot);
  const reward = player.lastReward;
  // Table preset: the account's equipped one (or the guest's free pick); a set may suggest its own until the player chose.
  useSyncExternalStore(onBoardChange, () => equippedBoard().id);
  const boardVars = equippedBoard().vars;
  const cardSets = useCardSets();
  const currentSet = cardSets.find(set => set.id === state.setId);
  // The room is the truth about the set; a remembered id the server no longer knows gets cleared (and the seat re-taken at the standard table).
  const storedSet = chosenCardSet();
  const pickedSet = state.setId || (cardSets.some(set => set.id === storedSet) ? storedSet : '');
  useEffect(() => {
    if (storedSet && state.status === 'online' && state.phase === 'LOBBY' && !state.setId) autoBattlerSession.chooseCardSet('');
  }, [storedSet, state.status, state.phase, state.setId]);
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
  // Curtain up: the first recruit of a match animates every fixture of the table into place (CSS keys off .is-opening).
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    if (state.phase !== 'RECRUIT_PHASE' || state.turn !== 1) return;
    setOpening(true);
    const timer = setTimeout(() => setOpening(false), 2800);
    return () => clearTimeout(timer);
  }, [state.phase, state.turn]);

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

  // One pinned deadline per phase; FuseRope and SandClock tick on their own so the table does not re-render each second.
  const clockActive = (state.phase === 'RECRUIT_PHASE' || state.phase === 'HERO_SELECTION') && !combatTable;
  const deadline = useDeadline(state.phase, state.turn, state.phaseEndsAt, state.phase === 'HERO_SELECTION' ? state.heroSeconds : state.recruitSeconds, clockActive);

  return (
    <AbDndProvider value={dnd.api}>
      <GameCursor />
      <BuffFlashProvider me={me}>
      <div ref={screenRef}
        className={`ab-screen ${combatTable ? 'is-combat' : ''} ${opening ? 'is-opening' : ''} ${dnd.api.armed ? 'is-ab-dragging' : ''} ${dnd.api.armed && !dnd.api.valid ? 'is-invalid' : ''} ${dnd.api.kind === 'power' && dnd.api.armed ? 'is-aim-drag' : ''}`}
        style={{ ...boardVars, '--ab-lb': `${AB_LAYOUT.LEADERBOARD_W}px`, '--ab-rail': `${AB_LAYOUT.RAIL_W}px`, '--ab-header': `${AB_LAYOUT.HEADER_H}px` } as CSSProperties}
        data-board={equippedBoard().id}
        data-testid="ab-screen"
        data-ab-zone={dnd.api.zone}
        data-dragging-id={dnd.api.draggingId ?? ''}>
        <header className="ab-header">
          <strong className="ab-brand">КАРТИШКИ <i>✳</i></strong>
          <span className={`connection ${state.status}`}>{t(state.status)}</span>
          <span>{t('abPhase_' + (combatTable ? 'COMBAT_PHASE' : state.phase), { defaultValue: state.phase })}</span>
          {state.turn > 0 && <span>{t('turn', { turn: combatTable ? lastCombat.current?.combat.turn ?? state.turn : state.turn })}</span>}
          {currentSet && <span className="ab-header-set" data-testid="ab-set-name">{pickLoc(currentSet.name, i18n.language)}</span>}
          <span className="ab-header-count">{state.players.length}/{AUTO_BATTLER.MAX_PLAYERS}</span>
          <div className="ml-auto flex gap-2">
            {inRecruit && state.turn <= AUTO_BATTLER.EARLY_READY_TURNS && (
              <InkButton size="sm" tone={me!.recruitReady ? 'ink' : 'blood'} aria-pressed={me!.recruitReady} data-testid="ab-ready"
                onClick={() => { if (me!.recruitReady) autoBattlerSession.cancelRecruit(); else if (dnd.api.tryLock('ready')) autoBattlerSession.endRecruit(); }}>
                {me!.recruitReady ? '✓ ' + t('abReady') : t('abReady')}
              </InkButton>
            )}
            <InkButton size="sm" aria-label={t('settings')} onClick={() => window.dispatchEvent(new Event('open-settings'))}>⚙</InkButton>
            <InkButton size="sm" onClick={leave}>{t('leave')}</InkButton>
          </div>
        </header>

        <div className="ab-layout">
          {/* Standings history is pinned to the combat turn: the recruit patch (new turn, new results) can land while the fight still plays. */}
          <Leaderboard players={leaderboardPlayers} meId={state.sessionId} catalog={state.catalog} turn={combatTable ? lastCombat.current?.combat.turn ?? state.turn : state.turn} />
          <div className="ab-stage">
            <BoardAmbience id={equippedBoard().id} />
            {inRecruit && opponent && <EnemyHand count={opponent.handCount ?? 0} back={opponent.cardBack} name={opponent.displayName} />}
            <FuseRope deadline={deadline} active={clockActive && state.phase === 'RECRUIT_PHASE'} />
            <section className="ab-zone-tavern" data-testid="ab-zone-tavern">
              {me && (
                <TavernRow me={me} catalog={state.catalog} tribes={state.tribes} recruit={recruit} aimingTavern={aim === 'tavern'}
                  onBuy={onTavernMinion} onReroll={() => { if (dnd.api.tryLock('reroll')) autoBattlerSession.reroll(); }}
                  onFreeze={() => { if (dnd.api.tryLock('freeze')) autoBattlerSession.freeze(); }}
                  onTierUp={() => { if (dnd.api.tryLock('tierUp')) autoBattlerSession.tierUp(); }}
                  error={state.error} />
              )}
            </section>
            <section className="ab-zone-player" data-testid="ab-zone-player">
              {me && (
                <>
                  <div className="ab-round-band"><span>{t('abNextOpponent')} <b>VS <PlayerName fx={opponent?.nameFx} name={opponent?.displayName ?? '—'} /></b></span><span>{aim ? t('abPowerTarget') : t('abOrderHint')}</span><small>{me.board.length}/7</small></div>
                  <BoardRow me={me} catalog={state.catalog} recruit={recruit} aimingBoard={aim === 'board'} selectedId={selected}
                    onActivate={onBoardMinion} />
                  {selected && recruit && <div className="ab-selection-tools"><button onClick={() => { send({ type: 'sell', id: selected }); setSelected(null); }}>{t('abSell', { n: me.sellReward })}</button><button onClick={() => setSelected(null)}>{t('cancel')}</button></div>}
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
              <SandClock deadline={deadline} active={clockActive} urgent={state.phase === 'RECRUIT_PHASE'} />
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
              {cardSets.length > 0 && (
                <label className="ab-set-pick">
                  {t('abCardSet')}
                  <select value={pickedSet} data-testid="ab-set-select" onChange={event => autoBattlerSession.chooseCardSet(event.target.value)}>
                    <option value="">{t('abCardSetStarter')}</option>
                    {cardSets.map(set => <option key={set.id} value={set.id}>{pickLoc(set.name, i18n.language)} · {set.minions}{set.author ? ` · ${t('abCardSetBy')} ${set.author}` : ''} · v{set.version}</option>)}
                  </select>
                  <small>{t('abCardSetHint')}</small>
                </label>
              )}
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
          <GameOverCard placement={me?.placement ?? 0} finished={state.phase === 'GAME_OVER'} winner={state.winnerId === state.sessionId} cancelled={state.cancelled && !reward} reward={reward ?? undefined} onAgain={playAgain} onLeave={leave} />
        )}

        {state.error && <p className="battle-error" role="alert">{t(state.error, { defaultValue: state.error })}</p>}
      </div>
      </BuffFlashProvider>
    </AbDndProvider>
  );
}
