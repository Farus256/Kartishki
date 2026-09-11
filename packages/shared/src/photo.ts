import type { CardDefinition } from './index';
const bayer = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
export function inkPixels(data: Uint8ClampedArray, width: number, contrast: number, threshold: number) {
  for (let i = 0; i < data.length; i += 4) {
    const p = i / 4, alpha = data[i + 3] / 255;
    const y = ((.2126 * data[i] + .7152 * data[i+1] + .0722 * data[i+2]) / 255) * alpha + 1 - alpha;
    const luminance = Math.max(0, Math.min(1, (y - .5) * contrast + .5));
    const grain = (((p * 16807) % 127) / 127 - .5) * .06;
    const paper = luminance > threshold + (bayer[(Math.floor(p / width) % 4) * 4 + p % width % 4] / 16 - .5) * .28 + grain;
    data[i] = data[i+1] = data[i+2] = paper ? 224 : 24; data[i+3] = 255;
  }
}
export async function renderPhoto(art: CardDefinition['art'], size = 256): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#e0e0e0'; ctx.fillRect(0, 0, size, size);
  if (!art.url) {
    ctx.scale(size/256,size/256);
    ctx.fillStyle = '#efece4'; ctx.fillRect(0,0,256,256);
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    const outline = () => {
      ctx.beginPath(); ctx.moveTo(45,206); ctx.lineTo(35,38); ctx.lineTo(92,80);
      ctx.bezierCurveTo(108,64,151,63,174,82); ctx.lineTo(217,24); ctx.lineTo(213,192);
      ctx.bezierCurveTo(194,246,62,247,45,206); ctx.closePath();
    };
    outline(); ctx.fillStyle='#1a1a1a'; ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(-4,3); outline(); ctx.stroke(); ctx.restore();
    ctx.fillStyle='#efece4';
    ctx.beginPath(); ctx.ellipse(88,125,28,33,-.22,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(164,116,33,24,.2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#1a1a1a'; ctx.fillRect(96,107,6,23); ctx.fillRect(154,107,7,19);
    ctx.fillStyle='#efece4'; ctx.beginPath(); ctx.moveTo(114,152); ctx.lineTo(138,149); ctx.lineTo(126,164); ctx.fill();
    ctx.strokeStyle='#efece4'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(77,181); ctx.bezierCurveTo(107,203,160,206,187,172); ctx.stroke();
    for(let n=0;n<7;n++){ctx.beginPath();ctx.moveTo(87+n*13,180+(n%3)*5);ctx.lineTo(90+n*13,200+(n%2)*4);ctx.stroke();}
    ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=1.4;
    for(let n=0;n<22;n++){const x=n*37%250,y=n*61%256;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+9,y-13);ctx.stroke();}
    for(let n=0;n<18;n++){ctx.fillStyle='#1a1a1a';ctx.beginPath();ctx.arc(n*47%256,n*71%256,n%3+.5,0,Math.PI*2);ctx.fill();}
    return canvas;
  }
  const image = new Image(); image.src = art.url; await image.decode();
  const side = Math.min(image.width, image.height) * art.crop.size;
  ctx.drawImage(image, (image.width-side)*art.crop.x, (image.height-side)*art.crop.y, side, side, 0, 0, size, size);
  const pixels = ctx.getImageData(0,0,size,size); inkPixels(pixels.data, size, art.contrast, art.threshold); ctx.putImageData(pixels,0,0);
  return canvas;
}
