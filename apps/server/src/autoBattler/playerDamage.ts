import { AUTO_BATTLER, type AutoBattlerPlayerState } from '@kartishki/shared';

export type DamageCapConfig = {
  enabled: boolean;
  value: number;
};

export const defaultDamageCap: DamageCapConfig = {
  enabled: AUTO_BATTLER.DAMAGE_CAP_ENABLED,
  value: AUTO_BATTLER.DAMAGE_CAP,
};

export type PlayerDamageResult = {
  rawDamage: number;
  applied: number;
  healthDamage: number;
  lethal: boolean;
};

/** All damage applies directly to health. Never write player.health -= n outside this helper. */
export function applyPlayerDamage(
  player: AutoBattlerPlayerState,
  rawDamage: number,
  cap: DamageCapConfig = defaultDamageCap,
): PlayerDamageResult {
  const raw = Math.max(0, Math.floor(rawDamage));
  const applied = cap.enabled ? Math.min(raw, cap.value) : raw;
  const healthDamage = applied;
  player.hero.health -= healthDamage;
  return {
    rawDamage: raw,
    applied,
    healthDamage,
    lethal: player.hero.health <= 0,
  };
}
