import type { CardDefinition } from '@kartishki/shared';

export type Rarity = CardDefinition['rarity'];

/** Frame tint, centre gem and hover aura — the three cues that identify a rarity at a glance. */
export const rarityStyle: Record<Rarity, { frame: string; deep: string; gem: string; glow: string; pulse: boolean; foil: boolean }> = {
  common: { frame: '#4B5563', deep: '#374151', gem: '#6B7280', glow: 'rgba(107,114,128,.45)', pulse: false, foil: false },
  rare: { frame: '#2563EB', deep: '#1D4ED8', gem: '#3B82F6', glow: 'rgba(59,130,246,.6)', pulse: false, foil: false },
  epic: { frame: '#9333EA', deep: '#6B21A8', gem: '#A855F7', glow: 'rgba(168,85,247,.65)', pulse: true, foil: false },
  legendary: { frame: '#EAB308', deep: '#B45309', gem: '#F59E0B', glow: 'rgba(245,158,11,.7)', pulse: true, foil: false },
  ultimate: { frame: '#06B6D4', deep: '#0E7490', gem: '#E0F2FE', glow: 'rgba(6,182,212,.8)', pulse: true, foil: true },
};

export const rarityOrder: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'ultimate'];

/** Display-only crafting price for cards the player does not own yet. */
export const craftCost: Record<Rarity, number> = { common: 40, rare: 100, epic: 400, legendary: 1600, ultimate: 3200 };
