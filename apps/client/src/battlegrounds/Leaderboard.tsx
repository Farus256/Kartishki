import { useTranslation } from 'react-i18next';
import type { AutoBattlerCatalog } from '@kartishki/shared';
import { AbHeroFace } from './AbHeroFace';
import type { AbPlayer } from '../autoBattlerSession';


export function Leaderboard({ players, meId, catalog }: { players: AbPlayer[]; meId: string; catalog: AutoBattlerCatalog }) {
  const { t } = useTranslation();
  const opponentId = players.find(p=>p.sessionId===meId)?.nextOpponentId;
  const ranked = [...players].sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    if(a.eliminated)return a.placement-b.placement;
    return b.health - a.health;
  });
  const rows = ranked;
  return (
    <aside className="ab-leaderboard" data-testid="ab-leaderboard" aria-label={t('abLeaderboard')}>
      <h2>{t('abLeaderboard')}</h2>
      <ol>
        {rows.map((player, index) => (
          <li key={player?.sessionId ?? `empty-${index}`}
            className={`${player?.eliminated ? 'is-out' : ''} ${player?.sessionId === meId ? 'is-me' : ''} ${player?.sessionId===opponentId ? 'has-swords' : ''}`}>
            {player ? (
              <>
                <div className="ab-lb-face"><AbHeroFace id={player.heroId || player.sessionId} art={catalog.heroes.find(h => h.id === player.heroId)?.art} />
                  {player.eliminated && <span className="ab-out-mark" aria-label={t('abEliminated')} />}
                </div>
                <div className="ab-lb-copy">
                  <strong>{player.sessionId === meId ? t('you') : player.displayName}</strong>
                  <span>♥ {player.health}</span>
                  <small>{t('abTier',{tier:player.tavernTier})}{player.eliminated?` · #${player.placement}`:''}</small>
                </div>
                {player.sessionId===opponentId && <span className="ab-swords" aria-label={t('abSwords')}>⚔</span>}
              </>
            ) : <span className="ab-lb-empty">—</span>}
          </li>
        ))}
      </ol>
    </aside>
  );
}
