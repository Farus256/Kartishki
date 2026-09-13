import { useTranslation } from 'react-i18next';
import { abCopyDescription, abCopyName, pickLoc, type AutoBattlerCatalog } from '@kartishki/shared';
import { InkButton } from '../ui/InkButton';
import { AbHeroFace } from './AbHeroFace';
import { PaperTooltip } from '../ui/PaperTooltip';
import type { AbPlayer } from '../autoBattlerSession';
import { localizedName } from './minionView';
import { useAbDnd } from './abDndContext';
import { AnimatedNumber } from './AnimatedNumber';

type Props = {
  me: AbPlayer;
  catalog: AutoBattlerCatalog;
  recruit: boolean;
  aiming: boolean;
  onPower: () => void;
  onEnd: () => void;
  income: number;
};

export function HeroDock({ me, catalog, recruit, aiming, onPower, onEnd, income }: Props) {
  const { t, i18n } = useTranslation();
  const dnd = useAbDnd();
  const hero = catalog.heroes.find(h => h.id === me.heroId);
  const name = hero ? localizedName(hero.name, i18n.language) : '—';
  const affordable = !me.power.isPassive && !me.power.isExhausted && me.gold >= me.power.goldCost;
  const canPower = recruit && affordable;
  return (
    <div className="ab-hero-dock" data-testid="ab-hero">
      <div className="ab-hero-face"><AbHeroFace id={me.heroId} art={hero?.art} /></div>
      <div className="ab-hero-vitals">
        <strong>{name}</strong>
        <span>♥ {me.health}</span>
      </div>
      <PaperTooltip content={hero?.description ? pickLoc(hero.description, i18n.language) || abCopyDescription(catalog.copy, 'powers', me.power.id, i18n.language, t(`abHint_${me.power.id}`, { defaultValue: '' })) : abCopyDescription(catalog.copy, 'powers', me.power.id, i18n.language, t(`abHint_${me.power.id}`, { defaultValue: '' }))}>
        {me.power.isPassive ? <div className="ab-power is-passive" data-testid="ab-hero-power"><b>{abCopyName(catalog.copy, 'powers', me.power.id, i18n.language, t(`abPower_${me.power.id}`))}</b><span>{t('abPassive')}</span></div> : <button type="button" className={`ab-power ${me.power.isExhausted ? 'is-exhausted' : ''} ${canPower ? 'is-ready' : ''} ${aiming || dnd?.kind === 'power' ? 'is-aiming' : ''}`}
          disabled={!canPower && !aiming}
          onDragStart={event => event.preventDefault()}
          onPointerDown={event => {
            if (canPower && me.power.targeted && dnd) dnd.begin({ kind: 'power', id: me.power.id, index: 0 }, event);
          }}
          onClick={event => { if (!dnd?.didDrag(event.currentTarget)) onPower(); }}
          data-testid="ab-hero-power">
          <b>{abCopyName(catalog.copy, 'powers', me.power.id, i18n.language, t(`abPower_${me.power.id}`, { defaultValue: t('abPower') }))}</b>
          <span>{aiming ? t('cancel') : me.power.isExhausted ? t('abExhausted') : `$${me.power.goldCost}`}</span>
        </button>}
      </PaperTooltip>
      <div className="ab-gold" data-testid="ab-gold">
        <small>{t('abGold')}</small>
        <div className="ab-coins" aria-hidden>
          {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < me.gold ? 'is-on' : ''} />)}
        </div>
        <strong><AnimatedNumber value={me.gold} />$<em>/{income}$</em></strong>
      </div>
      <InkButton tone="blood" disabled={!recruit || me.recruitReady} onClick={onEnd}>{me.recruitReady ? t('abReady') : t('abEndRecruit')}</InkButton>
    </div>
  );
}
