/** Tiny synthesized cues so unboxing has feedback without shipping audio assets. */
export function chime(kind: 'reveal' | 'victory' = 'reveal') {
  if (localStorage.getItem('sound') === 'off') return;
  try {
    const ctx = new AudioContext();
    const notes = kind === 'victory' ? [523, 659, 784, 1047] : [392, 587];
    notes.forEach((hz, index) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain(), at = ctx.currentTime + index * 0.09;
      osc.type = 'triangle'; osc.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.16, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      osc.connect(gain).connect(ctx.destination); osc.start(at); osc.stop(at + 0.4);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch { /* audio is optional */ }
}
