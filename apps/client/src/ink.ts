import { Texture } from 'pixi.js';
import { BOARD_H, BOARD_W } from './boardLayout';
export const ink = 0x242b29;
export const paper = 0xefece4;
/** Quiet felt and walnut keep photographic portraits in focus. */
export function deskTexture(width = BOARD_W, height = BOARD_H) {
  const canvas = document.createElement('canvas'); canvas.width = width * 2; canvas.height = height * 2;
  const ctx = canvas.getContext('2d')!; ctx.scale(2, 2);
  const wood = ctx.createLinearGradient(0, 0, width, height);
  wood.addColorStop(0, '#493a30'); wood.addColorStop(.5, '#241f1c'); wood.addColorStop(1, '#594534');
  ctx.fillStyle = wood; ctx.fillRect(0, 0, width, height);
  for (let n = 0; n < 170; n++) { ctx.fillStyle = '#b99d7510'; ctx.fillRect(0, n * 7, width, 1); }
  ctx.shadowColor = '#000'; ctx.shadowBlur = 30;
  ctx.beginPath(); ctx.roundRect(44, 65, width - 88, 535, 80);
  const felt = ctx.createRadialGradient(width / 2, 300, 50, width / 2, 320, width / 1.6);
  felt.addColorStop(0, '#536b5a'); felt.addColorStop(.65, '#30483f'); felt.addColorStop(1, '#192c27');
  ctx.fillStyle = felt; ctx.fill(); ctx.shadowBlur = 0;
  ctx.strokeStyle = '#9b8054'; ctx.lineWidth = 10; ctx.stroke();
  ctx.strokeStyle = '#dece9b'; ctx.lineWidth = 2; ctx.stroke();
  ctx.save(); ctx.globalAlpha = .22; ctx.strokeStyle = '#060c08'; ctx.lineWidth = 14; ctx.beginPath(); ctx.roundRect(65, 85, width - 130, 495, 62); ctx.stroke(); ctx.restore();
  ctx.beginPath(); ctx.roundRect(55, 76, width - 110, 513, 70); ctx.strokeStyle = '#c5ae7738'; ctx.lineWidth = 1; ctx.stroke();
  for (let n = 0; n < 18000; n++) { ctx.fillStyle = n % 2 ? '#ffffff05' : '#00000008'; ctx.fillRect(70 + n * 137.31 % (width - 140), 90 + n * 79.73 % 480, 1, 1); }
  ctx.strokeStyle = '#d6c39440'; ctx.beginPath(); ctx.moveTo(100, 329); ctx.lineTo(width - 100, 329); ctx.stroke();
  ctx.beginPath(); ctx.arc(width / 2, 329, 33, 0, Math.PI * 2); ctx.fillStyle = '#34463d'; ctx.fill(); ctx.stroke();
  ctx.font = '24px serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#bca779'; ctx.fillText('◆', width / 2, 337);
  const shade = ctx.createLinearGradient(0, 640, 0, height); shade.addColorStop(0, '#00000000'); shade.addColorStop(1, '#00000099');
  ctx.fillStyle = shade; ctx.fillRect(0, 640, width, height - 640);
  return Texture.from(canvas);
}
