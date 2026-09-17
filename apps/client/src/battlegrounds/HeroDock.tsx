import { useEffect, useRef } from 'react';
import { PlayerName } from '../cosmetics/PlayerName';
import { Aura } from '../cosmetics/Aura';
import { useTranslation } from 'react-i18next';
import { audioManager } from '../AudioManager';
import { spawnCoins, stageBox } from './tableFx';
import { abCopyName, type AutoBattlerCatalog } from '@kartishki/shared';
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
};

/** Bottom-center hero: portrait with health gem, name plaque and the power gem at its right. */
export function HeroDock({ me, catalog, recruit, aiming, onPower }: Props) {
  const { t, i18n } = useTranslation();
  const dnd = useAbDnd();
  const hero = catalog.heroes.find(h => h.id === me.heroId);
  const name = hero ? localizedName(hero.name, i18n.language) : '—';
  const affordable = !me.power.isPassive && !me.power.isExhausted && me.gold >= me.power.goldCost;
  const canPower = recruit && affordable;
  return (
    <div className="ab-hero-dock" data-testid="ab-hero">
      <div className="ab-hero-face" data-skin={me.skin} data-aura={me.aura || undefined}><AbHeroFace id={me.heroId} art={hero?.art} /><Aura id={me.aura} skin={me.skin} paused={!recruit} />
        <span className="ab-hero-health" aria-label={`${t('health')}: ${me.health}`}><HeartIcon /><AnimatedNumber value={me.health} /></span>
      </div>
      <div className="ab-hero-vitals">
        <strong><PlayerName fx={me.nameFx} name={name} /></strong>
      </div>
      <HeroPowerTooltip power={me.power} catalog={catalog} className="ab-hero-power-anchor">
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
    </div>
  );
}

/** Right rail gold purse: coin stack plus the running total and this turn's income. Coins hop in and out on every change. */
export function GoldPurse({ gold, income, turn }: { gold: number; income: number; turn: number }) {
  const { t } = useTranslation();
  const purse = useRef<HTMLDivElement>(null);
  const last = useRef({ gold, turn });
  useEffect(() => {
    const prev = last.current;
    last.current = { gold, turn };
    const delta = gold - prev.gold;
    if (!delta || !purse.current) return;
    const here = stageBox(purse.current);
    if (!here) return;
    const fromHero = turn !== prev.turn && delta > 0;
    const other = stageBox(document.querySelector(fromHero ? '[data-testid="ab-hero"] .ab-hero-face' : '[data-testid="ab-sell-zone"]'));
    if (!other) return;
    if (delta > 0) { spawnCoins(other, here, delta); audioManager.play(delta > 2 ? 'ab_coins' : 'ab_coin'); }
    else { spawnCoins(here, other, -delta); audioManager.play('ab_coin_drop'); }
    purse.current.classList.remove('is-bump'); void purse.current.offsetWidth; purse.current.classList.add('is-bump');
  }, [gold, turn]);
  return (
    <div ref={purse} className="ab-gold" data-testid="ab-gold" aria-label={`${t('abGold')}: ${gold}`}>
      <strong><AnimatedNumber value={gold} /><em>/{income}</em></strong>
      <div className="ab-coins" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < gold ? 'is-on' : ''} />)}
      </div>
    </div>
  );
}
