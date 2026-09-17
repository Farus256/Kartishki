/**
 * How a hero moves to land a bought hit, and how the struck portrait answers. One pose function per style
 * shared by combat (portraits stacked vertically) and the shop preview (side by side): `ax` is progress
 * along the striker→target axis (0 home, 1 contact), `side` is a perpendicular offset in px, `r` degrees,
 * `s` scale. Contact is always at the end of `approachMs`, so timing stays readable whatever the style.
 */
export type StrikeStyle = 'punch' | 'slash' | 'knockback' | 'snap' | 'pulse' | 'bounce' | 'crush' | 'sweep' | 'blink';
export type Pose = { ax: number; side: number; r: number; s: number; alpha?: number };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const easeIn = (u: number, p = 4) => u ** p;
const easeOut = (u: number) => 1 - (1 - u) ** 3;

export const STRIKES: Record<StrikeStyle, { approachMs: number; pose: (u: number, sign: number) => Pose; retreatMs: number }> = {
  /* Heavy punch: a long lean back, then everything at once. */
  punch: { approachMs: 760, retreatMs: 420, pose: (u, sign) => { const wind = clamp01(u / .34), dash = clamp01((u - .34) / .66); return { ax: u < .34 ? -.12 * (1 - (1 - wind) ** 2) : -.12 + 1.12 * easeIn(dash), side: 0, r: -5 * sign * wind * (1 - dash), s: 1 + .14 * clamp01((dash - .7) / .3) }; } },
  /* Quick slash: barely any wind-up, a diagonal cut with a hard tilt, overshoot past the mark. */
  slash: { approachMs: 480, retreatMs: 380, pose: (u, sign) => { const wind = clamp01(u / .22), dash = clamp01((u - .22) / .5); const over = u > .72 ? 1 - (u - .72) / .28 * .12 : 1; return { ax: u < .22 ? -.05 * wind : (-.05 + 1.15 * easeIn(dash, 3)) * over, side: sign * (-18 * wind + 40 * dash), r: sign * (-8 * wind + 34 * dash), s: 1 + .06 * dash }; } },
  /* Explosive knockback: a shoulder charge — long crouch, then a straight linear ram with no braking. */
  knockback: { approachMs: 860, retreatMs: 520, pose: (u, sign) => { const wind = clamp01(u / .48), dash = clamp01((u - .48) / .52); return { ax: u < .48 ? -.2 * easeOut(wind) : -.2 + 1.3 * dash, side: sign * 6 * Math.sin(wind * Math.PI), r: -14 * sign * wind * (1 - dash) + 4 * sign * dash, s: u < .48 ? 1 - .06 * wind : .94 + .2 * dash }; } },
  /* Electric snap: a trembling charge-up, then the striker is simply there. */
  snap: { approachMs: 420, retreatMs: 300, pose: (u, sign) => { const shake = u < .72 ? Math.sin(u * 90) * 3 * u : 0; return { ax: u < .72 ? -.04 * u : 1.04, side: sign * shake, r: shake * 1.5, s: u < .72 ? 1 + .05 * u : 1.1 }; } },
  /* Magical pulse: the hero rises and swells; the blow travels on its own, the body never touches. */
  pulse: { approachMs: 700, retreatMs: 480, pose: (u) => { const rise = easeOut(clamp01(u / .6)), pop = clamp01((u - .6) / .4); return { ax: .32 * rise, side: -10 * rise, r: 0, s: 1 + .1 * rise + .1 * Math.sin(pop * Math.PI) }; } },
  /* Cartoon bounce: three hops, squash on every landing, the last one lands on the mark. */
  bounce: { approachMs: 900, retreatMs: 460, pose: (u, sign) => { const hop = Math.min(2, Math.floor(u * 3)), f = u * 3 - hop; const arc = Math.sin(f * Math.PI); return { ax: (hop + f) / 3, side: -arc * (28 + hop * 10), r: sign * arc * 10, s: f < .12 || f > .88 ? .88 : 1 + .1 * arc }; } },
  /* Crushing impact: leap high, hang for a beat, then drop straight onto the target, growing as it falls. */
  crush: { approachMs: 820, retreatMs: 520, pose: (u) => { const up = clamp01(u / .42), hang = u > .42 && u < .56, fall = clamp01((u - .56) / .44); return { ax: .55 * easeOut(up) + .45 * easeIn(fall, 2.5), side: -110 * easeOut(up) * (hang ? 1 : 1 - easeIn(fall, 2)), r: 0, s: 1 + .18 * (hang ? 1 : easeOut(up) * (1 - fall) + fall * 1.4) }; } },
  /* Directional sweep: a wide sidestep, then an arcing swing that spins through the target. */
  sweep: { approachMs: 720, retreatMs: 480, pose: (u, sign) => { const wind = clamp01(u / .3), swing = clamp01((u - .3) / .7); return { ax: swing ** 1.6, side: sign * (-50 * wind + Math.sin(swing * Math.PI) * 140), r: sign * (-18 * wind + swing ** 2 * 380), s: 1 + .06 * Math.sin(swing * Math.PI) }; } },
  /* Blink: fades out at home, flickers, and reappears at the target's throat. */
  blink: { approachMs: 560, retreatMs: 340, pose: (u) => { const out = clamp01(u / .35), inn = clamp01((u - .6) / .25); const flick = u > .35 && u < .6 ? (Math.floor(u * 40) % 2 ? .35 : 0) : 0; return { ax: u < .6 ? -.06 * out : 1.02, side: 0, r: 0, s: u < .35 ? 1 - .15 * out : u < .6 ? .8 : .85 + .3 * easeOut(inn), alpha: u < .35 ? 1 - out : u < .6 ? flick : easeOut(inn) }; } },
};

/** The struck portrait's reply, as WAAPI keyframes on `transform`. `dir` = unit blow direction, `rx/ry` = recoil px. */
export function victimFrames(style: StrikeStyle, dir: { x: number; y: number }, rx: number, ry: number, p: number): Keyframe[] {
  const home = 'translate(0,0) scale(1) rotate(0deg)';
  const brace = `translate(${dir.x * -3}px,${dir.y * -2}px) scale(.985)`;
  switch (style) {
    case 'knockback': return [
      { transform: brace }, { transform: `translate(${rx * 1.6}px,${ry * 1.6}px) scale(${1 - p * .5},${1 + p * .4}) rotate(${dir.x * -9}deg)`, offset: .12 },
      { transform: `translate(${rx * 1.4}px,${ry * 1.4}px) scale(1) rotate(${dir.x * -6}deg)`, offset: .4 }, { transform: `translate(${rx * .2}px,${ry * .2}px) scale(1.02) rotate(${dir.x * 2}deg)`, offset: .75 }, { transform: home }];
    case 'snap': return [
      { transform: brace }, { transform: `translate(${rx * .4}px,${ry * .4}px) scale(1.04) rotate(2deg)`, offset: .06 }, { transform: `translate(${-rx * .3}px,${-ry * .3}px) rotate(-3deg)`, offset: .14 },
      { transform: `translate(${rx * .25}px,${ry * .25}px) rotate(2deg)`, offset: .22 }, { transform: `translate(${-rx * .15}px,0) rotate(-1deg)`, offset: .3 }, { transform: 'translate(0,0) scale(1.02)', offset: .5 }, { transform: home }];
    case 'pulse': return [
      { transform: brace }, { transform: `scale(${1 + p * 1.2})`, offset: .15 }, { transform: `scale(${1 - p * .3})`, offset: .4 }, { transform: `scale(${1 + p * .4})`, offset: .62 }, { transform: home }];
    case 'bounce': return [
      { transform: brace }, { transform: `translate(${rx}px,${ry}px) scale(${1 + p * 1.2},${1 - p * 1.1})`, offset: .1 }, { transform: `translate(${rx * .6}px,${ry * .6 - 26}px) scale(${1 - p * .6},${1 + p * .9})`, offset: .32 },
      { transform: `translate(${rx * .3}px,${ry * .3}px) scale(${1 + p * .6},${1 - p * .5})`, offset: .5 }, { transform: `translate(${rx * .1}px,${ry * .1 - 10}px) scale(.98,1.04)`, offset: .68 }, { transform: home }];
    case 'crush': return [
      { transform: brace }, { transform: `translate(0,${Math.abs(ry) * .5 + 8}px) scale(${1 + p * 1.5},${1 - p * 1.6})`, offset: .12 }, { transform: `translate(0,${Math.abs(ry) * .4}px) scale(${1 + p},${1 - p})`, offset: .4 },
      { transform: `translate(0,-6px) scale(${1 - p * .4},${1 + p * .5})`, offset: .68 }, { transform: home }];
    case 'sweep': return [
      { transform: brace }, { transform: `translate(${rx * 1.2}px,${ry * .6}px) rotate(${dir.x * -28 || 28}deg) scale(1.04)`, offset: .14 }, { transform: `translate(${rx * .8}px,${ry * .4}px) rotate(${dir.x * -18 || 18}deg)`, offset: .38 },
      { transform: `translate(${rx * .2}px,0) rotate(${dir.x * 6 || -6}deg)`, offset: .7 }, { transform: home }];
    case 'slash': return [
      { transform: brace }, { transform: `translate(${rx * .9}px,${ry * .9}px) rotate(${dir.x * -14 || 14}deg) scale(1.02,.96)`, offset: .08 }, { transform: `translate(${rx * .7}px,${ry * .7}px) rotate(${dir.x * -10 || 10}deg)`, offset: .3 },
      { transform: `translate(${rx * .15}px,${ry * .15}px) rotate(${dir.x * 3 || -3}deg)`, offset: .65 }, { transform: home }];
    case 'blink': return [
      { transform: brace }, { transform: `translate(${rx * .8}px,${ry * .8}px) scale(${1 + p},${1 - p * .5})`, offset: .1 }, { transform: `translate(${rx * .3}px,${ry * .3}px) scale(.97)`, offset: .45 }, { transform: home }];
    default: return [
      { transform: brace, easing: 'cubic-bezier(.2,.9,.3,1)' }, { transform: `translate(${rx}px,${ry}px) scale(${1 + p},${1 - p * .6}) rotate(${dir.x * -4}deg)`, offset: .08, easing: 'linear' },
      { transform: `translate(${rx * .92}px,${ry * .92}px) scale(${1 + p * .8},${1 - p * .4}) rotate(${dir.x * -3}deg)`, offset: .22, easing: 'cubic-bezier(.34,1.56,.64,1)' },
      { transform: `translate(${rx * .3}px,${ry * .3}px) scale(${1 - p * .4},${1 + p * .3}) rotate(${dir.x * 2.5}deg)`, offset: .48, easing: 'cubic-bezier(.34,1.56,.64,1)' },
      { transform: `translate(${rx * .08}px,${ry * .08}px) scale(${1 + p * .15}) rotate(${dir.x * -.8}deg)`, offset: .72, easing: 'ease-out' }, { transform: home }];
  }
}
