import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { AUTO_BATTLER, goldForTurn } from '@kartishki/shared';
import { autoBattlerSession, type AbMinion } from '../autoBattlerSession';
import { playerSession } from '../playerSession';
import { GameCursor } from '../ui/GameCursor';
import { BoardRow } from '../battlegrounds/BoardRow';
import { BuffFlashProvider } from '../battlegrounds/MinionTile';
import { CombatPlayback } from '../battlegrounds/CombatPlayback';
import { DiscoverModal } from '../battlegrounds/DiscoverModal';
import { HandRow } from '../battlegrounds/HandRow';
import { HeroDock } from '../battlegrounds/HeroDock';
import { HeroSelect } from '../battlegrounds/HeroSelect';
import { Leaderboard } from '../battlegrounds/Leaderboard';
import { TavernRow } from '../battlegrounds/TavernRow';
import { AbDndProvider } from '../battlegrounds/abDndContext';
import { useAbPointerDnd } from '../battlegrounds/useAbPointerDnd';
import { intentKey, type AbIntent } from '../battlegrounds/pointerDnd';
import { AB_LAYOUT } from '../battlegrounds/battlegroundsLayout';
import { InkButton } from '../ui/InkButton';
import { audioManager } from '../AudioManager';
import '../battlegrounds/battlegrounds.css';

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
  const combatTable = playing || state.phase === 'COMBAT_PHASE';
  const leaderboardPlayers = combatTable ? recruitHeroes.current : state.players;
  if (!combatTable && !state.combat) lastCombat.current = null;
  const [selected, setSelected] = useState<string | null>(null);
  const [triple, setTriple] = useState(false);
  const lastTriple = useRef(0);
  const screenRef = useRef<HTMLDivElement>(null);
  const me = state.players.find(p => p.sessionId === state.sessionId);
  const opponent = state.players.find(p => p.sessionId === me?.nextOpponentId);
  useEffect(() => {
    if (me && me.tripleSerial > lastTriple.current) { setTriple(true); lastTriple.current = me.tripleSerial; const timer = setTimeout(() => setTriple(false), 1600); return () => clearTimeout(timer); }
  }, [me?.tripleSerial]);

  useEffect(() => { void autoBattlerSession.connect(); }, []);
  useEffect(() => { if (state.combat) setPlaying(true); }, [state.combat]);
  useEffect(() => {
    if (state.phase === 'RECRUIT_PHASE') setPlaying(false);
  }, [state.phase]);

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
      else if (intent.type === 'play') { audioManager.playCardVoice(me?.hand.find(card => card.id === intent.id)?.cardId ?? ''); autoBattlerSession.playCard(intent.id, intent.index); }
      else if (intent.type === 'move') autoBattlerSession.moveBoard(intent.id, intent.index);
      else if (intent.type === 'sell') autoBattlerSession.sell(intent.id);
      else if (intent.type === 'power') { autoBattlerSession.heroPower(intent.id); setAim(null); }
    },
  });

  useEffect(() => {
    setAim(null); setSelected(null); dnd.api.cancel();
  }, [state.phase, state.turn]);
  useEffect(() => {
    if (!dndEnabled) dnd.api.cancel();
  }, [dndEnabled]);
  useEffect(() => { if (state.error) dnd.api.cancel(); }, [state.error]);
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
    if (intent.type === 'buy') autoBattlerSession.buy(intent.id);
    else if (intent.type === 'play') { audioManager.playCardVoice(me?.hand.find(card => card.id === intent.id)?.cardId ?? ''); autoBattlerSession.playCard(intent.id, intent.index); }
    else if (intent.type === 'move') autoBattlerSession.moveBoard(intent.id, intent.index);
    else if (intent.type === 'sell') autoBattlerSession.sell(intent.id);
    else if (intent.type === 'power') { autoBattlerSession.heroPower(intent.id); setAim(null); }
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

  function onTavernMinion(id: string) {
    if (aim === 'tavern') { send({ type: 'power', id }); setAim(null); return; }
    send({ type: 'buy', id });
  }

  function onBoardMinion(id: string) {
    if (aim === 'board') { send({ type: 'power', id }); setAim(null); return; }
    setSelected(current => current === id ? null : id);
  }

  const timer = state.phase === 'RECRUIT_PHASE'
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
        style={{ '--ab-lb': `${AB_LAYOUT.LEADERBOARD_W}px`, '--ab-header': `${AB_LAYOUT.HEADER_H}px` } as CSSProperties}
        data-testid="ab-screen"
        data-ab-zone={dnd.api.zone}
        data-dragging-id={dnd.api.draggingId ?? ''}>
        <header className="ab-header">
          <strong className="ab-brand">КАРТИШКИ <i>✳</i></strong>
          <span className={`connection ${state.status}`}>{t(state.status)}</span>
          <span>{t('abPhase_' + state.phase, { defaultValue: state.phase })}</span>
          {state.turn > 0 && <span>{t('turn', { turn: state.turn })}</span>}
          <span className={`ab-timer ${state.phase === 'RECRUIT_PHASE' && state.recruitSeconds <= 5 ? 'is-critical' : state.phase === 'RECRUIT_PHASE' && state.recruitSeconds <= 10 ? 'is-urgent' : ''}`} data-testid="ab-timer">{timer}</span>
          <span className="ab-header-count">{state.players.length}/{AUTO_BATTLER.MAX_PLAYERS}</span>
          <div className="ml-auto flex gap-2">
            <InkButton size="sm" aria-label={t('settings')} onClick={() => window.dispatchEvent(new Event('open-settings'))}>⚙</InkButton>
            <InkButton size="sm" onClick={leave}>{t('leave')}</InkButton>
          </div>
        </header>

        <div className="ab-layout">
          <Leaderboard players={leaderboardPlayers} meId={state.sessionId} catalog={state.catalog} />
          <div className="ab-stage">
            {!combatTable && state.phase === 'RECRUIT_PHASE' && state.recruitSeconds > 0 && state.recruitSeconds <= 10 && (
              <div className="ab-rope" data-testid="ab-rope" aria-label={timer}>
                <div className="ab-rope-remaining" style={{ width: `${state.recruitSeconds * 10}%` }}><span className="ab-rope-ember" /></div>
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
                  <BoardRow me={me} catalog={state.catalog} recruit={recruit} aimingBoard={aim === 'board'}
                    onActivate={onBoardMinion} />
                  {selected && recruit && <div className="ab-selection-tools"><button onClick={() => { send({ type: 'sell', id: selected }); setSelected(null); }}>{t('abSell')}</button><button onClick={() => setSelected(null)}>{t('cancel')}</button></div>}
                  <div className={`ab-buy-zone ${dnd.api.zone === 'buy' ? 'is-hot' : ''}`}>
                    <HeroDock me={me} catalog={state.catalog} recruit={recruit} canReady={inRecruit} aiming={!!aim} onPower={onPower}
                      income={goldForTurn(state.turn)} onEnd={() => me.recruitReady ? autoBattlerSession.cancelRecruit() : autoBattlerSession.endRecruit()} />
                  </div>
                  <HandRow me={me} catalog={state.catalog} recruit={recruit} onPlay={id => send({ type: 'play', id, index: me.board.length })} />
                </>
              )}
              {triple && <div className="ab-triple-stamp" role="status"><span className="ab-triple-cards"><i /><i /><i /><b>★</b></span><strong>{t('abTriple')}</strong><small>{t('abGoldenHint')}</small></div>}
              {!me && state.status === 'online' && <p className="ab-empty">{t('abWaiting', { count: state.players.length })}</p>}
              {state.status === 'connecting' && <p className="ab-empty">{t('connecting')}</p>}
            </section>
            {combatTable && lastCombat.current && <CombatPlayback combat={lastCombat.current.combat} boards={lastCombat.current.boards} waiting={!playing} phaseReady={state.phase !== 'COMBAT_PHASE'} recruitAfter={state.phase === 'RECRUIT_PHASE' && !me?.eliminated} meId={state.sessionId} catalog={state.catalog} players={state.players} pairing={state.pairing} initialHeroes={recruitHeroes.current} onDone={() => { setPlaying(false); autoBattlerSession.clearCombat(); }} />}
          </div>
        </div>

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
          <DiscoverModal options={discover} catalog={state.catalog} onPick={id => { if (dnd.api.tryLock(`discover:${id}`)) autoBattlerSession.discoverPick(id); }} />
        )}

        {(state.phase === 'GAME_OVER' || me?.eliminated) && !playing && (
          <div className="ab-modal" data-testid="ab-gameover">
            <div className="ab-modal-card">
              <h2>{t(state.phase === 'GAME_OVER' ? 'abGameOver' : 'abEliminated')}</h2>
              <p className="result">{t(state.winnerId === state.sessionId ? 'win' : state.winnerId ? 'loss' : 'draw')}</p>
              {me?.placement ? <p>{t('abPlace', { n: me.placement })}</p> : null}
              {reward && <p>{t('abRewardElo', { n: `${reward.elo - reward.previousElo > 0 ? '+' : ''}${reward.elo - reward.previousElo}` })} · {t('abRewardXp', { n: reward.xpGain ?? 0 })} · +${reward.gained}</p>}
              <div className="ab-gameover-actions">
                <InkButton tone="blood" onClick={playAgain}>{t('abPlayAgain')}</InkButton>
                <InkButton tone="ink" onClick={leave}>{t('backToMenu')}</InkButton>
              </div>
            </div>
          </div>
        )}

        {state.error && <p className="battle-error" role="alert">{t(state.error, { defaultValue: state.error })}</p>}
      </div>
      </BuffFlashProvider>
    </AbDndProvider>
  );
}
