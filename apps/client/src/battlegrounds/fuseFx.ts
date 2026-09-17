import { VfxLayer, noise2, pick, rand, rgba } from '../cosmetics/vfx';

/**
 * The lit fuse: a canvas over the rope (see PhaseClock.tsx FuseRope). Each frame the emitter reads where the
 * burning end is (the remaining rope is right-anchored, so the ember sits at its left edge) and burns there:
 * a white-hot ember core with a flickering corona, a sparkler spray fanning up and back, smoke curling off,
 * ash flakes drifting back over the burnt part, a char stain that follows the ember, and the odd pop.
 * `critical()` (last seconds) doubles the spray and turns it red-hot.
 */
export function mountFuseFx(rope: HTMLElement, remaining: HTMLElement, critical: () => boolean): () => void {
  const layer = new VfxLayer(rope, { inset: 72, zIndex: 9, className: 'ab-fuse-layer' });
  layer.max = 260;
  let sparks = 0, smoke = 0, ash = 0, pop = rand(.6, 1.4);
  layer.emitter((dt, t) => {
    const hot = critical();
    const w = rope.offsetWidth, h = rope.offsetHeight;
    const x = w - remaining.offsetWidth, y = h / 2;
    const k = hot ? 2 : 1;
    // Sparkler: short bright sparks, most flying up and back along the burnt rope, a few forward over the live rope.
    sparks += dt * 42 * k;
    while (sparks >= 1) {
      sparks -= 1;
      const back = Math.random() < .7;
      const a = back ? rand(-Math.PI * .95, -Math.PI * .35) : rand(-Math.PI * .6, -Math.PI * .05);
      const sp = rand(80, 260) * (hot ? 1.3 : 1);
      layer.spawn({ x: x + rand(-2, 2), y: y + rand(-2, 2), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 320, drag: .9, life: rand(.3, .7), size: rand(2.2, 3.8), size1: .8, shape: 'spark', color: pick(hot ? ['#fff6d6', '#ffb347', '#ff5a1a', '#ff3a10'] : ['#fff8e0', '#ffd66b', '#ff9a1f']), alpha: 1, fadeIn: .02, fadeOut: .45 });
    }
    // Smoke: thin grey wisps that rise, lean back, and thin out.
    smoke += dt * 6;
    while (smoke >= 1) { smoke -= 1; layer.spawn({ x: x + rand(-3, 3), y: y - 4, vx: rand(-22, -6), vy: rand(-34, -18), ay: -6, turb: 60, drag: .4, life: rand(.9, 1.6), size: rand(6, 10), size1: rand(20, 32), rot: rand(0, 6), spin: rand(-.6, .6), shape: 'wisp', blend: 'source-over', color: rgba(120, 110, 100, hot ? .3 : .22), alpha: 1, fadeIn: .2, fadeOut: .5 }); }
    // Ash: flakes let go and sink back over the burnt rope.
    ash += dt * 3;
    while (ash >= 1) { ash -= 1; layer.spawn({ x: x - rand(0, 6), y: y + rand(-3, 3), vx: rand(-30, -10), vy: rand(-12, 4), ay: 26, turb: 40, drag: .6, life: rand(1, 1.8), size: rand(1.4, 2.6), size1: rand(1.4, 2.6), rot: rand(0, 6), spin: rand(-3, 3), shape: 'pixel', blend: 'source-over', color: pick(['#8d8781', '#a39d96', '#5a5450']), alpha: .9, fadeIn: .05, fadeOut: .5 }); }
    // Pop: now and then the powder catches and throws a ring of hotter sparks.
    if (t >= pop) {
      pop = t + rand(.5, 1.4) / k;
      for (let i = 0; i < 12; i++) { const a = rand(-Math.PI, 0), sp = rand(120, 260); layer.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 360, drag: .8, life: rand(.3, .5), size: rand(2.6, 4), size1: .8, shape: 'spark', color: '#fff3b0', alpha: 1, fadeIn: .02, fadeOut: .5 }); }
      layer.spawn({ x, y, life: .3, size: 8, size1: 30, color: hot ? '#ff7a1a' : '#ffd66b', alpha: .9, fadeIn: .05, fadeOut: .8 });
    }
    layer.paint((ctx) => {
      const ox = layer.inset, oy = layer.inset, px = ox + x, py = oy + y;
      // Char: the rope just behind the ember is black and still glowing under the crust.
      ctx.globalCompositeOperation = 'source-over';
      const char = ctx.createLinearGradient(px - 48, 0, px, 0); char.addColorStop(0, 'rgba(20,12,8,0)'); char.addColorStop(.7, 'rgba(20,12,8,.85)'); char.addColorStop(1, 'rgba(60,20,8,.95)');
      ctx.fillStyle = char; ctx.fillRect(px - 48, py - h / 2 - 1, 48, h + 2);
      ctx.globalCompositeOperation = 'lighter';
      const flick = .75 + .25 * noise2(t * 14, 3) + .1 * Math.sin(t * 31);
      const under = ctx.createLinearGradient(px - 30, 0, px, 0); under.addColorStop(0, 'rgba(255,90,20,0)'); under.addColorStop(1, `rgba(255,120,30,${.55 * flick})`);
      ctx.fillStyle = under; ctx.fillRect(px - 30, py - h / 2, 30, h);
      // Ember: white core, gold body, orange corona; the corona breathes on noise so it never loops.
      const r = (hot ? 24 : 18) * flick;
      const g = ctx.createRadialGradient(px, py, 0, px, py, r * 2.2);
      g.addColorStop(0, 'rgba(255,252,230,1)'); g.addColorStop(.18, `rgba(255,214,90,${.95 * flick})`); g.addColorStop(.45, `rgba(255,${hot ? 70 : 110},20,${.55 * flick})`); g.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = g; ctx.fillRect(px - r * 2.2, py - r * 2.2, r * 4.4, r * 4.4);
      // A tongue of flame leaning back off the ember, redrawn each frame from noise.
      const lean = -14 - 10 * noise2(t * 3, 9), hgt = (20 + 14 * flick) * (hot ? 1.3 : 1);
      ctx.fillStyle = `rgba(255,150,40,${.6 * flick})`; ctx.beginPath();
      ctx.moveTo(px - 8, py); ctx.quadraticCurveTo(px - 9 + lean * .4, py - hgt * .5, px + lean, py - hgt); ctx.quadraticCurveTo(px + 9 + lean * .4, py - hgt * .5, px + 8, py); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(255,240,200,${.7 * flick})`; ctx.beginPath();
      ctx.moveTo(px - 4, py); ctx.quadraticCurveTo(px - 5 + lean * .3, py - hgt * .3, px + lean * .6, py - hgt * .55); ctx.quadraticCurveTo(px + 5 + lean * .3, py - hgt * .3, px + 4, py); ctx.closePath(); ctx.fill();
    });
  });
  return () => layer.destroy();
}
