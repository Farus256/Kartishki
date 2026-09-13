import { useTranslation } from 'react-i18next';
import { abCopyName, type AutoBattlerCatalog } from '@kartishki/shared';
import { InkButton } from '../ui/InkButton';
import { AbHeroFace } from './AbHeroFace';
import { HeroPowerTooltip } from './HeroPowerTooltip';
import type { AbPlayer } from '../autoBattlerSession';
import { localizedName } from './minionView';
import { useAbDnd } from './abDndContext';
import { AnimatedNumber } from './AnimatedNumber';
import { HeartIcon } from './MinionTile';

type Props = {
  me: AbPlayer;
  catalog: AutoBattlerCatalog;
  recruit: boolean;
  aiming: boolean;
  onPower: () => void;
  onEnd: () => void;
  income: number;
  canReady?: boolean;
};

export function HeroDock({ me, catalog, recruit, aiming, onPower, onEnd, income, canReady }: Props) {
  const { t, i18n } = useTranslation();
  const dnd = useAbDnd();
  const hero = catalog.heroes.find(h => h.id === me.heroId);
  const name = hero ? localizedName(hero.name, i18n.language) : '—';
  const affordable = !me.power.isPassive && !me.power.isExhausted && me.gold >= me.power.goldCost;
  const canPower = recruit && affordable;
  return (
    <div className="ab-hero-dock" data-testid="ab-hero">
      <div className="ab-hero-face"><AbHeroFace id={me.heroId} art={hero?.art} />
        <span className="ab-hero-health" aria-label={`${t('health')}: ${me.health}`}><HeartIcon /><AnimatedNumber value={me.health} /></span>
      </div>
      <div className="ab-hero-vitals">
        <strong>{name}</strong>
      </div>
      <HeroPowerTooltip power={me.power} catalog={catalog}>
        {me.power.isPassive ? <div className="ab-power is-passive" data-testid="ab-hero-power"><b>{abCopyName(catalog.copy, 'powers', me.power.id, i18n.language, t(`abPower_${me.power.id}`))}</b><span>{t('abPassive')}</span></div> : <button type="button" className={`ab-power ${me.power.isExhausted ? 'is-exhausted' : ''} ${canPower ? 'is-ready' : ''} ${aiming || dnd?.kind === 'power' ? 'is-aiming' : ''}`}
          aria-disabled={!canPower && !aiming}
          onDragStart={event => event.preventDefault()}
          onPointerDown={event => {
            if (canPower && me.power.targeted && dnd) dnd.begin({ kind: 'power', id: me.power.id, index: 0 }, event);
          }}
          onClick={event => { if ((canPower || aiming) && !dnd?.didDrag(event.currentTarget)) onPower(); }}
          data-testid="ab-hero-power">
          <b>{abCopyName(catalog.copy, 'powers', me.power.id, i18n.language, t(`abPower_${me.power.id}`, { defaultValue: t('abPower') }))}</b>
          <span>{me.power.goldCost}</span>
        </button>}
      </HeroPowerTooltip>
      <div className="ab-gold" data-testid="ab-gold" aria-label={`${t('abGold')}: ${me.gold}`}>
        <div className="ab-coins" aria-hidden>
          {Array.from({ length: Math.max(0, Math.min(10, me.gold)) }, (_, i) => <i key={i} className="is-on" />)}
        </div>
        <strong><AnimatedNumber value={me.gold} /><em>/{income}</em></strong>
      </div>
      <InkButton tone={me.recruitReady ? 'ink' : 'blood'} disabled={!(canReady ?? recruit)} aria-pressed={me.recruitReady} onClick={onEnd}>{me.recruitReady ? t('abReady') : t('abEndRecruit')}</InkButton>
    </div>
  );
}
