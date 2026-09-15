/** Presentation tiers are bounded even for very large late-game attacks. */
export function combatImpact(damage: number) {
  const tier = damage <= 0 ? 0 : damage < 3 ? 1 : damage < 5 ? 2 : damage < 10 ? 3 : 4;
  // The tier picks the coarse effects (veil, recoil); particle count and shake amplitude follow the raw damage.
  // Damage of 3+ shakes the whole field; below that only the struck tile rocks.
  return {
    tier,
    shake: damage < 3 ? 0 : Math.min(22, 2 + damage * 1.1),
    particles: damage <= 0 ? 0 : Math.min(28, 4 + Math.round(damage * 1.8)),
    duration: 170 + tier * 55,
    recoil: [0, 10, 16, 26, 36][tier]!,
  };
}
