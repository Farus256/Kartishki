import { useSyncExternalStore, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { BOARD_PRESETS, HERO_SKINS, PREMIUM_HEROES, boardOwned, heroSkinOwned, pickLoc, starterAutoBattlerHeroes, type AutoBattlerHeroDef } from '@kartishki/shared';
import { AbHeroFace } from '../battlegrounds/AbHeroFace';
import { localizedName } from '../battlegrounds/minionView';
import { equipBoard, equippedBoard, onBoardChange } from '../cosmeticsLocal';
import { playerSession } from '../playerSession';
import { InkButton } from '../ui/InkButton';
import { useAbHeroes } from '../ui/useCatalog';

/** Shop tab: table presets, hero frames and premium heroes. Prices come from the shared COSMETICS table; the server charges. */
export function CosmeticsStall() {
  const { t, i18n } = useTranslation();
  const player = useSyncExternalStore(playerSession.subscribe, playerSession.getSnapshot);
  useSyncExternalStore(onBoardChange, () => equippedBoard().id);
  const heroes = useAbHeroes();
  const library = player.library;
  const unlocks = library?.unlocks ?? [];
  const board = equippedBoard().id;
  const skin = library?.profile.settings.heroSkin ?? '';
  const dollars = library?.profile.currency ?? 0;
  const busy = player.loading;
  const heroDef = (id: string): AutoBattlerHeroDef | undefined => heroes.find(h => h.id === id) ?? starterAutoBattlerHeroes.find(h => h.id === id);
  const buy = (itemId: string) => void playerSession.buyCosmetic(itemId);
  return <div className="cosmetics" data-testid="cosmetics-stall">
    {!library && <p className="cosmetics-note">{t('cosmeticsLogin')}</p>}
    <section>
      <h2>{t('cosmeticsBoards')}</h2>
      <div className="cosmetics-row">
        {BOARD_PRESETS.map(preset => {
          const owned = boardOwned(preset.id, unlocks);
          const equipped = board === preset.id;
          return <article key={preset.id} className={`cosmetic-card ${equipped ? 'is-equipped' : ''}`} data-testid={`board-${preset.id}`}>
            <div className="board-swatch" style={preset.vars as CSSProperties}><i /><b /></div>
            <strong>{pickLoc(preset.name, i18n.language)}</strong>
            <span>{preset.cost ? `$ ${preset.cost}` : t('cosmeticsFree')}</span>
            {owned
              ? <InkButton size="sm" tone={equipped ? 'ink' : 'paper'} disabled={equipped || busy} onClick={() => void equipBoard(preset.id)}>{t(equipped ? 'cosmeticsEquipped' : 'cosmeticsEquip')}</InkButton>
              : <InkButton size="sm" tone="gold" disabled={!library || busy || dollars < preset.cost} onClick={() => buy(`board-${preset.id}`)}>{t('cosmeticsBuy', { n: preset.cost })}</InkButton>}
          </article>;
        })}
      </div>
    </section>
    <section>
      <h2>{t('cosmeticsFrames')}</h2>
      <div className="cosmetics-row">
        <article className={`cosmetic-card ${skin === '' ? 'is-equipped' : ''}`}>
          <div className="ab-hero-face frame-preview" data-skin=""><AbHeroFace id={library ? heroes[0]?.id ?? 'ab-hero-captain' : 'ab-hero-captain'} art={heroes[0]?.art} /></div>
          <strong>{t('heroSkinNone')}</strong><span>{t('cosmeticsFree')}</span>
          <InkButton size="sm" tone={skin === '' ? 'ink' : 'paper'} disabled={!library || skin === '' || busy} onClick={() => void playerSession.saveSettings({ heroSkin: '' })}>{t(skin === '' ? 'cosmeticsEquipped' : 'cosmeticsEquip')}</InkButton>
        </article>
        {HERO_SKINS.map(item => {
          const owned = heroSkinOwned(item.id, unlocks);
          const equipped = skin === item.id;
          return <article key={item.id} className={`cosmetic-card ${equipped ? 'is-equipped' : ''}`} data-testid={item.id}>
            <div className="ab-hero-face frame-preview" data-skin={item.id}><AbHeroFace id={heroes[0]?.id ?? 'ab-hero-captain'} art={heroes[0]?.art} /></div>
            <strong>{pickLoc(item.name, i18n.language)}</strong><span>$ {item.cost}</span>
            {owned
              ? <InkButton size="sm" tone={equipped ? 'ink' : 'paper'} disabled={equipped || busy} onClick={() => void playerSession.saveSettings({ heroSkin: item.id })}>{t(equipped ? 'cosmeticsEquipped' : 'cosmeticsEquip')}</InkButton>
              : <InkButton size="sm" tone="gold" disabled={!library || busy || dollars < item.cost} onClick={() => buy(item.id)}>{t('cosmeticsBuy', { n: item.cost })}</InkButton>}
          </article>;
        })}
      </div>
    </section>
    <section>
      <h2>{t('cosmeticsHeroes')}</h2>
      <p className="cosmetics-note">{t('cosmeticsHeroHint')}</p>
      <div className="cosmetics-row">
        {PREMIUM_HEROES.map(item => {
          const def = heroDef(item.heroId);
          const owned = unlocks.includes(`hero-${item.heroId}`);
          return <article key={item.heroId} className={`cosmetic-card ${owned ? 'is-equipped' : ''}`} data-testid={`hero-${item.heroId}`}>
            <div className="ab-hero-face frame-preview" data-skin={owned ? skin : ''}><AbHeroFace id={item.heroId} art={def?.art} /></div>
            <strong>{def ? localizedName(def.name, i18n.language) : item.heroId}</strong><span>$ {item.cost}</span>
            {owned
              ? <em className="cosmetic-owned">{t('cosmeticsOwned')}</em>
              : <InkButton size="sm" tone="gold" disabled={!library || busy || dollars < item.cost} onClick={() => buy(`hero-${item.heroId}`)}>{t('cosmeticsBuy', { n: item.cost })}</InkButton>}
          </article>;
        })}
      </div>
    </section>
  </div>;
}
