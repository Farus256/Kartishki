import rough from 'roughjs';
import { Texture } from 'pixi.js';

export const ink = 0x1a1a1a;
export const paper = 0xefece4;

// Cached canvas artwork: the same imperfect pen marks survive every state update.
export function deskTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 720;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#EFECE4'; ctx.fillRect(0, 0, 1000, 720);
  for (let n = 0; n < 14000; n++) {
    ctx.fillStyle = n % 3 ? '#1a1a1a08' : '#ffffff50';
    ctx.fillRect(n * 137.31 % 1000, n * 79.73 % 720, 1, 1);
  }
  const pen = rough.canvas(canvas);
  pen.rectangle(20, 78, 960, 376, { seed: 6, roughness: 2, stroke: '#1a1a1a', strokeWidth: 1.3 });
  pen.line(28, 272, 972, 272, { seed: 9, roughness: 2, stroke: '#808080', strokeLineDash: [9, 9] });
  pen.rectangle(26, 532, 948, 175, { seed: 4, roughness: 2, fill: '#1a1a1a', fillStyle: 'hachure', hachureGap: 12, fillWeight: .25, stroke: '#808080' });
  pen.circle(895, 45, 55, { seed: 3, roughness: 2, stroke: '#D92525', strokeWidth: 2 });
  pen.line(866, 67, 918, 24, { seed: 2, stroke: '#D92525', strokeWidth: 2 });
  for (let n = 0; n < 35; n++) {
    ctx.beginPath(); ctx.arc(27 + n * 17 % 88, 465 + n * 31 % 43, n % 5 + .5, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a1a'; ctx.fill();
  }
  return Texture.from(canvas);
}
