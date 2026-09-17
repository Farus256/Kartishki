import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  BOARD_PRESETS, CARD_BACKS, HERO_SKINS, HERO_SLAMS, NAME_FX, PORTRAIT_FX, boardOwned, boardPreset, cardBackOwned, cosmeticTier, heroSkinOwned, heroSlamOwned, nameFxOwned, pickLoc, portraitFxOwned,
  type AutoBattlerHeroDef, type AutoBattlerLoc, type CosmeticKind, type CosmeticSetId, type PlayerSettings,
} from '@kartishki/shared';
import { AbHeroFace } from '../battlegrounds/AbHeroFace';
import { HitEffectPreview } from '../cosmetics/HitEffectPreview';
import { Aura, BoardAmbience } from '../cosmetics/Aura';
import { CardBackFace } from '../cosmetics/CardBackFace';
import { PlayerName } from '../cosmetics/PlayerName';
import { equipBoard, equippedBoard, onBoardChange } from '../cosmeticsLocal';
import { playerSession } from '../playerSession';

/** One shop entry: the shared price table plus how the client previews and equips it. */
export type CosmeticItem = { kind: CosmeticKind; id: string; name: AutoBattlerLoc; cost: number; /** Id sent to /unlocks (boards are prefixed). */ shopId: string; /** Family the item belongs to (shop label + "part of a set" strip). */ set?: CosmeticSetId };
const NONE: AutoBattlerLoc = { ru: 'Без эффекта', en: 'None' };
const NO_FRAME: AutoBattlerLoc = { ru: 'Без рамки', en: 'No frame' };
export const COSMETIC_KINDS: CosmeticKind[] = ['heroSkin', 'heroSlam', 'portraitFx', 'cardBack', 'nameFx', 'board'];
const PAPER: AutoBattlerLoc = { ru: 'Бумага', en: 'Paper' };

/** Every item of a kind, the free/none one first. */
export function cosmeticItems(kind: CosmeticKind): CosmeticItem[] {
  if (kind === 'board') return BOARD_PRESETS.map(p => ({ kind, id: p.id, name: p.name, cost: p.cost, shopId: `board-${p.id}`, set: p.set }));
  const list = kind === 'heroSkin' ? HERO_SKINS : kind === 'heroSlam' ? HERO_SLAMS : kind === 'portraitFx' ? PORTRAIT_FX : kind === 'cardBack' ? CARD_BACKS : NAME_FX;
  return [{ kind, id: '', name: kind === 'heroSkin' ? NO_FRAME : kind === 'cardBack' ? PAPER : NONE, cost: 0, shopId: '' }, ...list.map(s => ({ kind, id: s.id, name: s.name, cost: s.cost, shopId: s.id, set: s.set }))];
}

export function cosmeticOwned(item: CosmeticItem, unlocks: readonly string[]): boolean {
  if (item.kind === 'board') return boardOwned(item.id, unlocks);
  if (item.kind === 'heroSkin') return heroSkinOwned(item.id, unlocks);
  if (item.kind === 'heroSlam') return heroSlamOwned(item.id, unlocks);
  if (item.kind === 'portraitFx') return portraitFxOwned(item.id, unlocks);
  if (item.kind === 'cardBack') return cardBackOwned(item.id, unlocks);
  return nameFxOwned(item.id, unlocks);
}

/** What the player currently wears of each kind; guests only have their local table pick. */
export function useEquipped(): Record<CosmeticKind, string> {
  const player = useSyncExternalStore(playerSession.subscribe, playerSession.getSnapshot);
  const board = useSyncExternalStore(onBoardChange, () => equippedBoard().id);
  const settings: Partial<PlayerSettings> = player.library?.profile.settings ?? {};
  return { board, heroSkin: settings.heroSkin ?? '', heroSlam: settings.heroSlam ?? '', portraitFx: settings.portraitFx ?? '', nameFx: settings.nameFx ?? '', cardBack: settings.cardBack ?? '' };
}

export function equipCosmetic(item: CosmeticItem): Promise<boolean> {
  if (item.kind === 'board') return equipBoard(item.id);
  return playerSession.saveSettings({ [item.kind]: item.id });
}

/**
 * The preview of one item, sized 'sm' for gallery tiles or 'lg' for the featured panel. Frames, auras and
 * hits use the real .ab-hero-face so the shop shows exactly what the table shows; the hit preview is the
 * combat renderer itself running on two sample portraits.
 */
export function CosmeticStage({ item, hero, foe, name, size = 'sm', worn, still = false }: { item: CosmeticItem; hero?: AutoBattlerHeroDef; foe?: AutoBattlerHeroDef; name: string; size?: 'sm' | 'lg'; /** No looping hit preview (chest reels hold dozens of tiles). */ still?: boolean; /** What else the player wears, so the featured preview composes the full look. */ worn?: Partial<Record<CosmeticKind, string>> }) {
  const cls = `cosmetic-stage is-${size} is-${item.kind}`;
  // Gallery tiles are one frozen frame: a live canvas per tile would mean a dozen emitters running under the featured preview.
  const face = (skin: string, aura: string) => <div className="ab-hero-face frame-preview" data-skin={skin} data-aura={aura || undefined}><AbHeroFace id={hero?.id ?? 'ab-hero-captain'} art={hero?.art} /><Aura id={aura} skin={skin} still={size !== 'lg'} /></div>;
  if (item.kind === 'board') return <div className={cls} style={boardPreset(item.id).vars as CSSProperties}><div className="board-swatch"><i /><b /><em />{size === 'lg' && <BoardAmbience id={item.id} />}</div></div>;
  if (item.kind === 'heroSkin') return <div className={cls}>{face(item.id, size === 'lg' ? worn?.portraitFx ?? '' : '')}</div>;
  if (item.kind === 'portraitFx') return <div className={cls}>{face(size === 'lg' ? worn?.heroSkin ?? '' : '', item.id)}</div>;
  // Both shapes of the same set side by side: the full card, and the real table token (its wooden rim and oval art hole) wearing the back.
  if (item.kind === 'cardBack') return <div className={cls}><div className="back-pair"><CardBackFace id={item.id} shape="card" /><div className="back-token" aria-hidden><CardBackFace id={item.id} shape="oval" /></div></div></div>;
  // Only the featured panel runs the duel; tiles show the pair with the striker lit in the effect's colour.
  if (item.kind === 'heroSlam') return <div className={cls}>{item.id && !still && size === 'lg'
    ? <HitEffectPreview id={item.id} striker={hero} victim={foe} size="lg" skin={worn?.heroSkin ?? ''} aura={worn?.portraitFx ?? ''} />
    : <div className="hit-preview is-sm"><div className="ab-hero-face frame-preview" data-skin="" data-slam-live={item.id || undefined}><AbHeroFace id={hero?.id ?? 'ab-hero-captain'} art={hero?.art} /></div><div className="ab-hero-face frame-preview hit-preview-victim"><AbHeroFace id={foe?.id ?? 'ab-hero-bartender'} art={foe?.art} /></div></div>}</div>;
  return <div className={cls}><span className="name-preview"><PlayerName fx={item.id} name={name} /></span></div>;
}

export function CosmeticCard({ item, equipped, owned, hero, foe, name, selected, children, testId, onClick }: { item: CosmeticItem; equipped: boolean; owned: boolean; hero?: AutoBattlerHeroDef; foe?: AutoBattlerHeroDef; name: string; selected?: boolean; children?: ReactNode; testId?: string; onClick?: () => void }) {
  const { i18n, t } = useTranslation();
  const tier = item.cost ? cosmeticTier(item.cost) : 'free';
  return <motion.article layout whileHover={{ y: -5, rotate: -.6 }} whileTap={{ scale: .97, y: -2 }} transition={{ type: 'spring', stiffness: 420, damping: 26 }} className={`cosmetic-card is-${tier} ${equipped ? 'is-equipped' : ''} ${owned && item.cost ? 'is-owned' : ''} ${selected ? 'is-selected' : ''}`} data-testid={testId} data-tier={tier} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} aria-pressed={onClick ? selected : undefined}
    onKeyDown={onClick ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(); } } : undefined}>
    <CosmeticStage item={item} hero={hero} foe={foe} name={name} />
    <strong>{pickLoc(item.name, i18n.language)}</strong>
    {equipped && <em className="cosmetic-ribbon">{t('cosmeticsEquipped')}</em>}
    {children}
  </motion.article>;
}
