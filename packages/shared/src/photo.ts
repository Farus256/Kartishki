import type { CardDefinition } from './index';

export const photoPresets = ['printed', 'dirty', 'noir', 'faded', 'sepia', 'harsh', 'cyan', 'bleach', 'none', 'offset', 'flash', 'toon', 'gif'] as const;
export type PhotoPreset = typeof photoPresets[number];
const legacy: Record<string, PhotoPreset> = { xerox: 'offset', comic: 'toon', stencil: 'flash' };

export function normalizePreset(preset: CardDefinition['art']['preset']): PhotoPreset {
  if (!preset) return 'printed';
  if ((photoPresets as readonly string[]).includes(preset)) return preset as PhotoPreset;
  return legacy[preset] ?? 'offset';
}

export const portraitPresets = {
 printed: { brightness:1,contrast:1.08,saturation:.78,warmth:.12,grain:.12,intensity:.18,paper:.12,vignette:.12,inkEdge:.04 },
 dirty: { brightness:1,contrast:1.12,saturation:.68,warmth:.2,grain:.3,intensity:.3,paper:.3,vignette:.2,inkEdge:.08 },
 noir: { brightness:1.02,contrast:1.24,saturation:.12,warmth:.05,grain:.17,intensity:.24,paper:.18,vignette:.2,inkEdge:.14 },
 faded: { brightness:1.08,contrast:.92,saturation:.52,warmth:.1,grain:.08,intensity:.1,paper:.1,vignette:.08,inkEdge:.02 },
 sepia: { brightness:1.02,contrast:1.06,saturation:.42,warmth:.58,grain:.14,intensity:.16,paper:.16,vignette:.14,inkEdge:.05 },
 harsh: { brightness:1.06,contrast:1.42,saturation:.68,warmth:.02,grain:.22,intensity:.28,paper:.1,vignette:.24,inkEdge:.18 },
 cyan: { brightness:1.04,contrast:1.1,saturation:.38,warmth:-.48,grain:.1,intensity:.2,paper:.14,vignette:.16,inkEdge:.06 },
 bleach: { brightness:1.16,contrast:1.18,saturation:.22,warmth:.14,grain:.08,intensity:.12,paper:.06,vignette:.1,inkEdge:.03 },
 offset: { brightness:1,contrast:1.14,saturation:1.08,warmth:.08,grain:.05,intensity:.55,paper:0,vignette:0,inkEdge:0 },
 flash: { brightness:1.1,contrast:1.2,saturation:.9,warmth:.04,grain:.05,intensity:.55,paper:0,vignette:0,inkEdge:0 },
 toon: { brightness:1.05,contrast:1.28,saturation:1.18,warmth:.08,grain:0,intensity:.55,paper:0,vignette:0,inkEdge:0 },
 gif: { brightness:1,contrast:1.1,saturation:1.12,warmth:0,grain:.16,intensity:.55,paper:0,vignette:0,inkEdge:0 },
 none: { brightness:1,contrast:1,saturation:1,warmth:0,grain:0,intensity:0,paper:0,vignette:0,inkEdge:0 },
} as const;
export function applyPortraitPreset(art:CardDefinition['art'],preset:keyof typeof portraitPresets):CardDefinition['art'] {
 return {...art,...portraitPresets[preset],preset};
}

/** Subtle analog treatment: retain face geometry and most original tones. */
function printedPortrait(data:Uint8ClampedArray,width:number,art:CardDefinition['art']) {
 const height=data.length/4/width; const printed = ['printed','dirty','noir','faded','sepia','harsh','cyan','bleach'] as const;
 const preset = printed.includes(art.preset as typeof printed[number]) ? art.preset as typeof printed[number] : 'printed';
 const defaults=portraitPresets[preset];const value=(key:keyof typeof defaults)=>art[key]??defaults[key];
 const source=data.slice();let mean=0;
 for(let i=0;i<source.length;i+=4)mean+=source[i]*.2126+source[i+1]*.7152+source[i+2]*.0722;
 mean/=source.length/4;
 const exposure=clamp(118/Math.max(30,mean),.92,1.08)*value('brightness');
 const lum=(x:number,y:number)=>{const i=(Math.max(0,Math.min(height-1,y))*width+Math.max(0,Math.min(width-1,x)))*4;return source[i]*.2126+source[i+1]*.7152+source[i+2]*.0722;};
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4;const [r,g,b]=contrastSat(source[i]*exposure,source[i+1]*exposure,source[i+2]*exposure,value('contrast'),value('saturation'));
  const px=x*512/width,py=y*512/height;
  let seed=Math.imul((Math.floor(px)+1),374761393)^Math.imul((Math.floor(py)+1),668265263);seed=Math.imul(seed^(seed>>>13),1274126177);
  const noise=((seed>>>0)/4294967295-.5)*value('grain')*28;
  const paper=(Math.sin(px*.53+Math.sin(py*.3))*2+Math.sin(py*1.7))*value('paper')*2;
  const dot=(Math.sin(px*Math.PI/2)*Math.sin(py*Math.PI/2))*value('intensity')*3;
  const edge=Math.min(35,Math.abs(lum(x+1,y)-lum(x-1,y))+Math.abs(lum(x,y+1)-lum(x,y-1)))*value('inkEdge');
  const distance=((x/width-.5)**2+(y/height-.48)**2)*2;
  const shade=1-distance*value('vignette')*.55;const grade=value('warmth');
  for(const [c,v] of [r+grade*12,g+grade*4,b-grade*10].entries()) {
   const quant=Math.round(v/12)*12;const tone=v*(1-value('intensity')*.35)+quant*value('intensity')*.35;
   data[i+c]=clamp((tone*.97+4+noise+paper+dot-edge)*shade);
  }
 }
}

const clamp = (v: number, lo = 0, hi = 255) => v < lo ? lo : v > hi ? hi : v;
function contrastSat(r: number, g: number, b: number, contrast: number, sat: number) {
  r = (r - 128) * contrast + 128; g = (g - 128) * contrast + 128; b = (b - 128) * contrast + 128;
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [clamp(l + (r - l) * sat), clamp(l + (g - l) * sat), clamp(l + (b - l) * sat)] as const;
}
function sample(src: Float32Array, width: number, height: number, x: number, y: number) {
  x = Math.max(0, Math.min(width - 1, x | 0)); y = Math.max(0, Math.min(height - 1, y | 0));
  const i = (y * width + x) * 4; return [src[i], src[i + 1], src[i + 2]] as const;
}
function cmyk(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255; const k = 1 - Math.max(r, g, b);
  if (k >= 0.999) return [0, 0, 0, 1] as const;
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k] as const;
}
function dot(x: number, y: number, angle: number, cell: number, amount: number) {
  const a = angle * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const u = x * ca - y * sa, v = x * sa + y * ca;
  const fx = ((u % cell) + cell) % cell / cell - 0.5, fy = ((v % cell) + cell) % cell / cell - 0.5;
  return fx * fx + fy * fy < amount * 0.42;
}

function offset(data: Uint8ClampedArray, src: Float32Array, width: number, height: number, intensity: number) {
  const cell = 4 + Math.round((1 - intensity) * 6), shift = 1 + Math.round(intensity * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r0, g0, b0] = sample(src, width, height, x, y);
    const C = cmyk(...sample(src, width, height, x + shift, y))[0];
    const M = cmyk(...sample(src, width, height, x - shift, y + shift))[1];
    const Y = cmyk(...sample(src, width, height, x, y - shift))[2];
    const K = cmyk(r0, g0, b0)[3];
    let r = 239, g = 236, b = 228;
    if (dot(x, y, 15, cell, C)) { r *= .08; g *= .72; b *= .94; }
    if (dot(x, y, 75, cell, M)) { r *= .92; g *= .1; b *= .52; }
    if (dot(x, y, 0, cell, Y)) { r *= .98; g *= .93; b *= .12; }
    if (dot(x, y, 45, cell, K * .9)) { r *= .18; g *= .18; b *= .18; }
    const i = (y * width + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
}

function flash(data: Uint8ClampedArray, src: Float32Array, width: number, height: number, intensity: number) {
  const extra = 1.4;
  const boost = (r: number, g: number, b: number) => {
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return [clamp(l + (r - l) * extra), clamp(l + (g - l) * extra), clamp(l + (b - l) * extra)] as const;
  };
  const cx = width / 2, cy = height / 2, maxd = Math.hypot(cx, cy) || 1, shift = 1 + intensity * 4;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const edge = Math.hypot(x - cx, y - cy) / maxd, dx = Math.round(shift * edge), vig = 1 - intensity * edge * edge * 0.8;
    const [sr] = boost(...sample(src, width, height, x - dx, y));
    const [, sg] = boost(...sample(src, width, height, x, y));
    const [, , sb] = boost(...sample(src, width, height, x + dx, y));
    const i = (y * width + x) * 4;
    data[i] = clamp(sr * vig); data[i + 1] = clamp(sg * vig); data[i + 2] = clamp(sb * vig); data[i + 3] = 255;
  }
}

function toon(data: Uint8ClampedArray, src: Float32Array, width: number, height: number, intensity: number) {
  const levels = 6 - Math.round(intensity * 2);
  const q = (v: number) => Math.round(clamp(v) / 255 * (levels - 1)) / (levels - 1) * 255;
  const lum = (x: number, y: number) => {
    const [r, g, b] = sample(src, width, height, x, y); return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (let i = 0; i < data.length; i += 4) {
    data[i] = q(src[i]); data[i + 1] = q(src[i + 1]); data[i + 2] = q(src[i + 2]); data[i + 3] = 255;
  }
  const radius = Math.max(1, Math.round(1 + intensity * 2)), cut = 40 + (1 - intensity) * 40;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const gx = lum(x + 1, y - 1) + 2 * lum(x + 1, y) + lum(x + 1, y + 1) - lum(x - 1, y - 1) - 2 * lum(x - 1, y) - lum(x - 1, y + 1);
    const gy = lum(x - 1, y + 1) + 2 * lum(x, y + 1) + lum(x + 1, y + 1) - lum(x - 1, y - 1) - 2 * lum(x, y - 1) - lum(x + 1, y - 1);
    if (Math.hypot(gx, gy) <= cut) continue;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
      const j = (yy * width + xx) * 4; data[j] = 26; data[j + 1] = 26; data[j + 2] = 26; data[j + 3] = 255;
    }
  }
}

function gif(data: Uint8ClampedArray, src: Float32Array, width: number, height: number, intensity: number) {
  const buf = src.slice();
  const q = (v: number) => Math.round(clamp(v) / 85) * 85;
  const spread = (x: number, y: number, er: number, eg: number, eb: number, w: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const j = (y * width + x) * 4; buf[j] += er * w; buf[j + 1] += eg * w; buf[j + 2] += eb * w;
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const r = buf[i], g = buf[i + 1], b = buf[i + 2], nr = q(r), ng = q(g), nb = q(b);
    data[i] = Math.round(src[i] * (1 - intensity) + nr * intensity);
    data[i + 1] = Math.round(src[i + 1] * (1 - intensity) + ng * intensity);
    data[i + 2] = Math.round(src[i + 2] * (1 - intensity) + nb * intensity);
    data[i + 3] = 255;
    const er = (r - nr) * intensity, eg = (g - ng) * intensity, eb = (b - nb) * intensity;
    spread(x + 1, y, er, eg, eb, 7 / 16); spread(x - 1, y + 1, er, eg, eb, 3 / 16);
    spread(x, y + 1, er, eg, eb, 5 / 16); spread(x + 1, y + 1, er, eg, eb, 1 / 16);
  }
}

/** Color collage filters used by the editor, inspect view and in-match portraits. */
export function processPhoto(data: Uint8ClampedArray, width: number, art: CardDefinition['art']) {
  const preset = normalizePreset(art.preset);
  if (preset === 'none') return;
  if (preset==='printed'||preset==='dirty'||preset==='noir'||preset==='faded'||preset==='sepia'||preset==='harsh'||preset==='cyan'||preset==='bleach') { printedPortrait(data,width,art); return; }
  const height = data.length / 4 / width;
  const sat = art.saturation ?? 1;
  const intensity = art.intensity ?? art.rasterIntensity ?? 0.55;
  const src = new Float32Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = contrastSat(data[i], data[i + 1], data[i + 2], art.contrast, sat);
    src[i] = r; src[i + 1] = g; src[i + 2] = b; src[i + 3] = 255;
  }
  if (preset === 'offset') offset(data, src, width, height, intensity);
  else if (preset === 'flash') flash(data, src, width, height, intensity);
  else if (preset === 'toon') toon(data, src, width, height, intensity);
  else gif(data, src, width, height, intensity);
}

export async function renderPhoto(art: CardDefinition['art'], size = 256): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#EFECE4'; ctx.fillRect(0, 0, size, size);
  if (!art.url) {
    ctx.scale(size / 256, size / 256);
    ctx.fillStyle = '#d5cfc3'; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#8c918b'; ctx.beginPath(); ctx.arc(128, 94, 43, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b746e'; ctx.beginPath(); ctx.arc(128, 228, 90, Math.PI, 0); ctx.lineTo(218, 256); ctx.lineTo(38, 256); ctx.fill();
    return canvas;
  }
  const image = new Image(); image.src = art.url; await image.decode();
  const side = Math.min(image.width, image.height) * art.crop.size;
  ctx.save();
  if(art.rotation){ctx.translate(size/2,size/2);ctx.rotate(art.rotation*Math.PI/180);const bleed=Math.abs(Math.cos(art.rotation*Math.PI/180))+Math.abs(Math.sin(art.rotation*Math.PI/180));ctx.scale(bleed,bleed);ctx.translate(-size/2,-size/2);}
  ctx.drawImage(image, (image.width - side) * art.crop.x, (image.height - side) * art.crop.y, side, side, 0, 0, size, size);
  ctx.restore();
  const pixels = ctx.getImageData(0, 0, size, size);
  processPhoto(pixels.data, size, art);
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}
