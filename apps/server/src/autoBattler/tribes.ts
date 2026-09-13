import { hasTribe, type AutoBattlerTribe } from '@kartishki/shared';

export type TribeFilter = AutoBattlerTribe | 'all';

export function matchesTribe(tribes: Iterable<string>, filter: TribeFilter): boolean {
  return hasTribe(tribes, filter);
}

export function selectByTribe<T extends { tribes?: Iterable<string> }>(items: readonly T[], filter: TribeFilter): T[] {
  return items.filter(item => matchesTribe(item.tribes ?? ['neutral'], filter));
}
