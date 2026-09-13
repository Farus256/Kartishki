/** Presentation tiers are bounded even for very large late-game attacks. */
export function combatImpact(damage: number) {
  const tier = damage <= 0 ? 0 : damage < 4 ? 1 : damage < 8 ? 2 : damage < 15 ? 3 : 4;
  return { tier, shake: [0, 3, 6, 11, 18][tier]!, particles: tier * 6, duration: 170 + tier * 55 };
}
