import { useTranslation } from 'react-i18next';
import type { AutoBattlerCatalog } from '@kartishki/shared';
import { AbHeroFace } from './AbHeroFace';
import type { AbPlayer } from '../autoBattlerSession';
import { PaperTooltip } from '../ui/PaperTooltip';
import { useCombatHistory, type FightRecord } from './useCombatHistory';
import { abCopyName, boardMainTribe } from '@kartishki/shared';
import { powerCopy } from './HeroPowerTooltip';
import { PlayerName } from '../cosmetics/PlayerName';

/** Opponent boards are owner-only, so their tribe comes from the server's last-fight snapshot; my own board is read live. */
function likelyTribe(player: AbPlayer, meId: string, catalog: AutoBattlerCatalog, lang: string, t: (key: string, opts?: { defaultValue?: string }) => string, ru: boolean): string {
  const tribe = player.sessionId === meId ? boardMainTribe(player.board.map(m => ({ tribes: m.tribes ?? [] }))) : player.mainTribe ?? '';
  if (!tribe) return '—';
  if (tribe === 'mixed') return ru ? 'смешанные существа' : 'mixed minions';
  return abCopyName(catalog.copy, 'tribes', tribe, lang, t(`abTribe_${tribe}`, { defaultValue: tribe }));
}

function FightLog({ player, players, log, meId, ru, catalog }: { player: AbPlayer; players: AbPlayer[]; log: FightRecord[]; meId: string; ru: boolean; catalog: AutoBattlerCatalog }) {
  const { t, i18n } = useTranslation();
  const name = (id: string) => id === meId ? (ru ? 'вы' : 'you') : players.find(p => p.sessionId === id)?.displayName ?? '—';
  const recent = [...log].reverse().slice(0, 5);
  const hero = catalog.heroes.find(h => h.id === player.heroId);
  const power = powerCopy(player.power, catalog, i18n.language, t);
  return <div className="ab-lb-log">
    <header className="ab-lb-log-head">
      <span className="ab-lb-log-face"><AbHeroFace id={player.heroId || player.sessionId} art={hero?.art} /></span>
      <div>
        <strong><PlayerName fx={player.nameFx} name={player.sessionId === meId ? t('you') : player.displayName} /></strong>
        <small>{hero ? (i18n.language.startsWith('en') ? hero.name.en || hero.name.ru : hero.name.ru) : '—'} · ♥ {player.health}</small>
      </div>
    </header>
    <dl className="ab-lb-log-facts">
      <div><dt>{ru ? 'Таверна' : 'Tavern'}</dt><dd>{t('abTier', { tier: player.tavernTier })}</dd></div>
      <div><dt>{ru ? 'Собирает' : 'Building'}</dt><dd>{likelyTribe(player, meId, catalog, i18n.language, t, ru)}</dd></div>
    </dl>
    <section className="ab-lb-log-power" aria-label={t('abPower')}>
      <strong className="ab-lb-log-title">{t('abPower')}</strong>
      <div><b>{power.name}</b><small>{player.power.isPassive ? t('abPassive') : `${player.power.goldCost}$`}</small><p>{power.description}</p></div>
    </section>
    <strong className="ab-lb-log-title">{ru ? 'Последние бои' : 'Recent fights'}</strong>
    {!recent.length && <p>{ru ? 'Боёв ещё не было.' : 'No fights yet.'}</p>}
    <ul>
      {recent.map(f => (
        <li key={f.turn} className={`is-${f.result}`}><em>{f.turn - 1}</em><b>{f.result === 'win' ? (ru ? 'Победа' : 'Win') : f.result === 'loss' ? (ru ? 'Поражение' : 'Loss') : (ru ? 'Ничья' : 'Draw')}</b><span>vs {name(f.opponentId)}</span>{f.damage ? <i>{f.result === 'win' ? '+' : '−'}{f.damage}</i> : null}</li>
      ))}
    </ul>
  </div>;
}

export function Leaderboard({ players, meId, catalog, turn = 0 }: { players: AbPlayer[]; meId: string; catalog: AutoBattlerCatalog; turn?: number }) {
  const { t, i18n } = useTranslation();
  const ru = i18n.language.startsWith('ru');
  const history = useCombatHistory(players, turn);
  const opponentId = players.find(p=>p.sessionId===meId)?.nextOpponentId;
  const ranked = [...players].sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    if(a.eliminated)return a.placement-b.placement;
    return b.health - a.health;
  });
  const streak = (log: FightRecord[]) => {
    const last = log[log.length - 1]?.result;
    if (!last || last === 'draw') return null;
    let n = 0;
    for (let i = log.length - 1; i >= 0 && log[i]!.result === last; i--) n++;
    return { result: last, n };
  };
  return (
    <aside className="ab-leaderboard" data-testid="ab-leaderboard" aria-label={t('abLeaderboard')}>
      <h2>{t('abLeaderboard')}</h2>
      <ol>
        {ranked.map((player, index) => {
          const log = history.get(player.sessionId) ?? [];
          const run = streak(log);
          return (
          <li key={player?.sessionId ?? `empty-${index}`}
            className={`${player?.eliminated ? 'is-out' : ''} ${player?.sessionId === meId ? 'is-me' : ''} ${player?.sessionId===opponentId ? 'has-swords' : ''}`}>
            {player ? (
              <PaperTooltip className="ab-lb-row" placement="beside" boxClassName="paper-tooltip is-lb-log" delay={160} content={<FightLog player={player} players={players} log={log} meId={meId} ru={ru} catalog={catalog} />}>
                <div className="ab-lb-face" data-skin={player.skin}><AbHeroFace id={player.heroId || player.sessionId} art={catalog.heroes.find(h => h.id === player.heroId)?.art} />
                  {player.eliminated && <span className="ab-out-mark" aria-label={t('abEliminated')} />}
                </div>
                <div className="ab-lb-copy">
                  <strong><PlayerName fx={player.nameFx} name={player.sessionId === meId ? t('you') : player.displayName} /></strong>
                  <span>♥ {player.health}</span>
                  <small>{t('abTier',{tier:player.tavernTier})}{player.eliminated?` · #${player.placement}`:''}</small>
                </div>
                {run && run.n >= 2 && <b className={`ab-lb-streak is-${run.result}`} aria-label={run.result === 'win' ? (ru ? `Серия побед: ${run.n}` : `Win streak: ${run.n}`) : (ru ? `Серия поражений: ${run.n}` : `Loss streak: ${run.n}`)}>{run.result === 'win' ? 'W' : 'L'}{run.n}</b>}
                {player.sessionId===opponentId && <span className="ab-swords" aria-label={t('abSwords')}>⚔</span>}
              </PaperTooltip>
            ) : <span className="ab-lb-empty">—</span>}
          </li>
          );
        })}
      </ol>
    </aside>
  );
}
