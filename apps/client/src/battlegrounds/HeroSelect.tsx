import { useTranslation } from 'react-i18next';
import { abCopyDescription, abCopyName, pickLoc, type AutoBattlerCopy, type AutoBattlerHeroDef } from '@kartishki/shared';
import { AbHeroFace } from './AbHeroFace';
import { localizedName } from './minionView';

type Props = {
  offers: AutoBattlerHeroDef[];
  chosen: string;
  copy?: AutoBattlerCopy;
  onChoose: (id: string) => void;
};

export function HeroSelect({ offers, chosen, copy, onChoose }: Props) {
  const { t, i18n } = useTranslation();
  return (
    <div className="hero-selection" role="dialog" aria-label={t('abChooseHero')} data-testid="ab-hero-select">
      <h1>{chosen ? t('abWaitingHero') : t('abChooseHero')}</h1>
      <div className="hero-offers">
        {offers.map(hero => (
          <button key={hero.id} disabled={!!chosen} aria-pressed={chosen === hero.id} onClick={() => onChoose(hero.id)}>
            <article className="hero-portrait">
              <div className="hero-photo"><AbHeroFace id={hero.id} art={hero.art} /></div>
              <span className="hero-health">♥ {hero.health}</span>
              <h2>{localizedName(hero.name, i18n.language)}</h2>
              {hero.description && (hero.description.ru || hero.description.en) && <p>{pickLoc(hero.description, i18n.language)}</p>}
              <div className="hero-ability">
                <strong>{abCopyName(copy, 'powers', hero.power.id, i18n.language, t(`abPower_${hero.power.id}`))}</strong>
                <span>{hero.power.isPassive ? t('abPassive') : `${hero.power.goldCost}$`}</span>
                <p>{abCopyDescription(copy, 'powers', hero.power.id, i18n.language, t(`abHint_${hero.power.id}`))}</p>
              </div>
            </article>
          </button>
        ))}
      </div>
    </div>
  );
}
