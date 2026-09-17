import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import path from 'node:path';
import { nameArtBackground } from './config';
let fontsReady = false;
export async function renderNameArt(name, backgroundId) {
  if (!fontsReady) {
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'public/name-art/Cinzel.ttf'), 'NameArtSerif');
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'public/fonts/NotoSansArabic-Bold.ttf'), 'NameArtArabic');
    fontsReady = true;
  }
  const background = nameArtBackground(backgroundId);
  const canvas = createCanvas(1536, 2304), ctx = canvas.getContext('2d');
  ctx.drawImage(await loadImage(path.join(process.cwd(), 'public', background.src)), 0, 0, 1536, 2304);
  const arabic = /\p{Script=Arabic}/u.test(name), text = arabic ? name : name.toLocaleUpperCase('en');
  let size = arabic ? 205 : 210;
  const font = () => `${arabic ? '700' : '600'} ${size}px ${arabic ? 'NameArtArabic' : 'NameArtSerif'}`;
  ctx.font = font();
  while (ctx.measureText(text).width > 1536 * background.width && size > 50) { size -= 2; ctx.font = font(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = arabic ? 'rtl' : 'ltr';
  const x = 768, y = 2304 * background.centre;
  ctx.lineJoin = 'round'; ctx.lineWidth = 5;
  ctx.shadowColor = '#44301880'; ctx.shadowBlur = 6; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 8;
  ctx.strokeStyle = '#76501e'; ctx.strokeText(text, x, y + 2);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#d8b76f'; ctx.lineWidth = 3; ctx.strokeText(text, x, y);
  const fill = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  fill.addColorStop(0, '#264331'); fill.addColorStop(.45, '#092b20'); fill.addColorStop(1, '#163d2b');
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
  return canvas.encode('jpeg', 94);
}
