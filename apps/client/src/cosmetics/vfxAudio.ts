import { audioManager } from '../AudioManager';

/**
 * Procedural sound for cosmetics: no assets, every hit is synthesised from noise and oscillators so
 * each style has its own voice (fire crackles, lightning cracks, ice rings, ink splats…). Runs through
 * the same enabled flag and SFX volume as the rest of the game, at a deliberately low gain.
 */
let ctx: AudioContext | undefined;
let noiseBuffer: AudioBuffer | undefined;
const enabled = () => { try { return localStorage.getItem('sound') !== 'off'; } catch { return true; } };
function context(): AudioContext | undefined {
  if (!enabled()) return undefined;
  try { ctx ??= new AudioContext(); if (ctx.state === 'suspended') void ctx.resume(); return ctx; } catch { return undefined; }
}
function noise(ac: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const b = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuffer = b;
}
const MASTER = .22;
type Env = { a?: number; d: number; peak?: number };
/** Gain node with an attack/decay envelope, wired to the output at the game's SFX volume. */
function voice(ac: AudioContext, at: number, env: Env, level = 1): GainNode {
  const g = ac.createGain();
  const peak = (env.peak ?? 1) * level * MASTER * audioManager.sfxVolume;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + (env.a ?? .005));
  g.gain.exponentialRampToValueAtTime(.0005, at + (env.a ?? .005) + env.d);
  g.connect(ac.destination);
  return g;
}
function burst(ac: AudioContext, at: number, env: Env, filter: { type: BiquadFilterType; from: number; to?: number; q?: number }, level = 1) {
  const src = ac.createBufferSource(); src.buffer = noise(ac);
  const f = ac.createBiquadFilter(); f.type = filter.type; f.Q.value = filter.q ?? 1;
  f.frequency.setValueAtTime(filter.from, at);
  if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, at + (env.a ?? 0) + env.d);
  src.connect(f).connect(voice(ac, at, env, level));
  src.start(at); src.stop(at + (env.a ?? 0) + env.d + .05);
}
function tone(ac: AudioContext, at: number, env: Env, osc: { type: OscillatorType; from: number; to?: number; detune?: number }, level = 1) {
  const o = ac.createOscillator(); o.type = osc.type; o.detune.value = osc.detune ?? 0;
  o.frequency.setValueAtTime(osc.from, at);
  if (osc.to) o.frequency.exponentialRampToValueAtTime(osc.to, at + (env.a ?? 0) + env.d);
  o.connect(voice(ac, at, env, level));
  o.start(at); o.stop(at + (env.a ?? 0) + env.d + .05);
}
const thump = (ac: AudioContext, at: number, level = 1) => tone(ac, at, { d: .28, peak: .9 }, { type: 'sine', from: 110, to: 38 }, level);

const HIT_SOUNDS: Record<string, (ac: AudioContext, t: number) => void> = {
  'slam-fire': (ac, t) => { thump(ac, t); burst(ac, t, { d: .55, peak: .7 }, { type: 'lowpass', from: 1400, to: 180 }); for (let i = 0; i < 6; i++) burst(ac, t + .05 + Math.random() * .45, { d: .03, peak: .35 }, { type: 'bandpass', from: 2200 + Math.random() * 2500, q: 6 }); },
  'slam-lightning': (ac, t) => { burst(ac, t, { d: .09, peak: 1 }, { type: 'highpass', from: 2500 }); thump(ac, t + .02, .8); burst(ac, t + .08, { d: .4, peak: .35 }, { type: 'bandpass', from: 3000, to: 600, q: 3 }); tone(ac, t, { d: .12, peak: .25 }, { type: 'square', from: 1800, to: 300 }); },
  'slam-ice': (ac, t) => { tone(ac, t, { d: .5, peak: .5 }, { type: 'sine', from: 1860 }); tone(ac, t, { d: .38, peak: .3 }, { type: 'sine', from: 2790, detune: 12 }); burst(ac, t + .01, { d: .32, peak: .5 }, { type: 'bandpass', from: 3600, to: 1400, q: 2.5 }); thump(ac, t, .5); },
  'slam-ink': (ac, t) => { burst(ac, t, { d: .18, peak: .9 }, { type: 'lowpass', from: 900, to: 120 }); tone(ac, t, { d: .16, peak: .5 }, { type: 'sine', from: 260, to: 60 }); burst(ac, t + .12, { d: .25, peak: .25 }, { type: 'lowpass', from: 500, to: 100 }); },
  'slam-comic': (ac, t) => { tone(ac, t, { d: .28, peak: .55 }, { type: 'triangle', from: 320, to: 1100 }); tone(ac, t + .1, { d: .22, peak: .45 }, { type: 'triangle', from: 1000, to: 180 }); burst(ac, t, { d: .06, peak: .6 }, { type: 'bandpass', from: 1200, q: 1.2 }); thump(ac, t, .6); },
  'slam-arcane': (ac, t) => { tone(ac, t, { a: .06, d: .7, peak: .35 }, { type: 'sine', from: 220 }); tone(ac, t, { a: .06, d: .7, peak: .3 }, { type: 'sine', from: 330, detune: 8 }); tone(ac, t + .04, { a: .02, d: .5, peak: .25 }, { type: 'triangle', from: 880, to: 1320 }); burst(ac, t, { d: .5, peak: .2 }, { type: 'bandpass', from: 1500, to: 4000, q: 4 }); },
  'slam-neon': (ac, t) => { tone(ac, t, { d: .35, peak: .4 }, { type: 'sawtooth', from: 110, to: 55 }); burst(ac, t, { d: .05, peak: .7 }, { type: 'highpass', from: 4000 }); tone(ac, t + .02, { d: .3, peak: .2 }, { type: 'square', from: 440, to: 220 }); thump(ac, t, .7); },
  'slam-glitch': (ac, t) => { for (let i = 0; i < 6; i++) tone(ac, t + i * .045, { d: .035, peak: .45 }, { type: 'square', from: 200 + Math.random() * 1800 }); burst(ac, t + .1, { d: .12, peak: .4 }, { type: 'bandpass', from: 600 + Math.random() * 2000, q: 8 }); thump(ac, t + .05, .5); },
  'slam-shadow': (ac, t) => { tone(ac, t, { a: .04, d: .6, peak: .5 }, { type: 'sine', from: 140, to: 40 }); burst(ac, t, { a: .03, d: .5, peak: .45 }, { type: 'lowpass', from: 700, to: 90, q: 2 }); tone(ac, t + .05, { a: .1, d: .5, peak: .18 }, { type: 'sawtooth', from: 80, to: 30 }); },
  'slam-petal': (ac, t) => { burst(ac, t, { a: .02, d: .35, peak: .35 }, { type: 'bandpass', from: 2500, to: 900, q: 1.2 }); [880, 1108, 1318].forEach((f, i) => tone(ac, t + .04 + i * .06, { d: .35, peak: .18 }, { type: 'sine', from: f })); thump(ac, t, .35); },
  'slam-tavern': (ac, t) => { burst(ac, t, { d: .07, peak: .9 }, { type: 'highpass', from: 3200 }); for (let i = 0; i < 5; i++) tone(ac, t + .01 + i * .02, { d: .22 + i * .05, peak: .22 }, { type: 'sine', from: 2400 + Math.random() * 2200 }); thump(ac, t, .7); burst(ac, t + .06, { a: .02, d: .4, peak: .35 }, { type: 'lowpass', from: 1200, to: 200 }); for (let i = 0; i < 4; i++) burst(ac, t + .18 + i * .09, { d: .05, peak: .12 }, { type: 'bandpass', from: 900 + Math.random() * 600, q: 3 }); },
  'slam-comet': (ac, t) => { burst(ac, Math.max(ac.currentTime, t - .3), { a: .2, d: .25, peak: .5 }, { type: 'bandpass', from: 300, to: 2400, q: 1.5 }); thump(ac, t, 1); burst(ac, t, { d: .6, peak: .7 }, { type: 'lowpass', from: 1800, to: 150 }); for (let i = 0; i < 4; i++) burst(ac, t + .1 + Math.random() * .4, { d: .03, peak: .3 }, { type: 'bandpass', from: 2000 + Math.random() * 3000, q: 6 }); },
  /* Spit: a wet slap (lowpass burst + a short sine pop), then two or three drips plinking off. */
  'slam-spit': (ac, t) => { burst(ac, t, { d: .14, peak: .9 }, { type: 'lowpass', from: 1600, to: 220, q: 1.5 }); tone(ac, t, { d: .12, peak: .5 }, { type: 'sine', from: 420, to: 90 }); burst(ac, t + .03, { d: .2, peak: .3 }, { type: 'bandpass', from: 900, to: 300, q: 2 }); for (let i = 0; i < 3; i++) tone(ac, t + .25 + i * .14 + Math.random() * .05, { d: .09, peak: .16 }, { type: 'sine', from: 1400 + Math.random() * 600, to: 700 }); },
};

/** Impact voice of a hero slam, scheduled a few ms ahead so it lands with the flash. */
export function playSlamSound(id: string) {
  const ac = context(); const fx = HIT_SOUNDS[id];
  if (!ac || !fx) return;
  try { fx(ac, ac.currentTime + .05); } catch { /* audio never blocks the hit */ }
}
export function playEquipSound() {
  const ac = context(); if (!ac) return;
  const t = ac.currentTime + .01;
  tone(ac, t, { d: .18, peak: .35 }, { type: 'sine', from: 660 });
  tone(ac, t + .09, { d: .3, peak: .35 }, { type: 'sine', from: 880 });
}
export function playBoughtSound() {
  const ac = context(); if (!ac) return;
  const t = ac.currentTime + .01;
  [523, 659, 784].forEach((f, i) => tone(ac, t + i * .07, { d: .32, peak: .3 }, { type: 'triangle', from: f }));
  burst(ac, t + .2, { d: .25, peak: .15 }, { type: 'highpass', from: 5000 });
}
/* Wind-up voices, played when the striker starts its approach (only styles that gather something audible). */
const WINDUP_SOUNDS: Record<string, (ac: AudioContext, t: number) => void> = {
  /* Hawking: a throaty rasp that climbs, twice, then a wet snort as it lets go. */
  'slam-spit': (ac, t) => { for (let i = 0; i < 2; i++) burst(ac, t + i * .28, { a: .04, d: .22, peak: .32 }, { type: 'bandpass', from: 160 + i * 40, to: 520 + i * 120, q: 4 }); tone(ac, t + .1, { a: .05, d: .3, peak: .12 }, { type: 'sawtooth', from: 70, to: 120 }); burst(ac, t + .62, { d: .12, peak: .38 }, { type: 'highpass', from: 1800, to: 900 }); },
};
export function playSlamWindup(id: string) {
  const ac = context();
  const fx = WINDUP_SOUNDS[id];
  if (!ac) return;
  try {
    if (fx) fx(ac, ac.currentTime + .02);
    else if (HIT_SOUNDS[id]) burst(ac, ac.currentTime + .01, { a: .12, d: .22, peak: .3 }, { type: 'bandpass', from: 400, to: 1800, q: 1.4 });
  } catch { /* audio never blocks the hit */ }
}
