import type { AutoBattlerHeroDef } from '@kartishki/shared';
import { useCardArt } from '../ui/cardArt';
import { illustrationUrl } from './illustrations';

const blank = { url: '', crop: { x: .5, y: .5, size: 1 }, threshold: .5, contrast: 1 };

export function AbHeroFace({ id, art, className }: { id: string; art?: AutoBattlerHeroDef['art']; className?: string }) {
  const processed = useCardArt(art ?? blank);
  return <img className={className} src={art?.url && processed ? processed : illustrationUrl(id || 'ab-hero')} alt="" />;
}
