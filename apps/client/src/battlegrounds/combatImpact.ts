/** Presentation tiers are bounded even for very large late-game attacks. */
export function combatImpact(damage: number) {
  const tier = damage <= 0 ? 0 : damage < 3 ? 1 : damage < 5 ? 2 : damage < 10 ? 3 : 4;
  // Damage of 5+ shakes the whole field; below that only the struck tile rocks.
  return { tier, shake: [0, 0, 2, 9, 16][tier]!, particles: [0, 4, 7, 11, 14][tier]!, duration: 170 + tier * 55, recoil: [0, 10, 16, 26, 36][tier]! };
}
