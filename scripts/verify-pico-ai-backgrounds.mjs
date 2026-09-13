import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {mattePortrait,framePortrait,composePortrait} from '../lib/picoAi/portrait-engine.mjs';
import backgrounds from '../lib/picoAi/backgrounds.json' with {type:'json'};
const root=path.resolve('private/pico-ai'),kiosk=path.resolve('../ai photo post/saudi-moment-app');
const output=path.join(kiosk,'design/national-day-backgrounds/previews');await fs.mkdir(output,{recursive:true});
assert.equal(await fs.readFile('lib/picoAi/portrait-engine.mjs','utf8'),await fs.readFile(path.join(kiosk,'server/portrait-engine.mjs'),'utf8'),'Local and cloud engines must match');
const previewTiles=[];
for(const outfit of ['abaya','thobe']){
 const bytes=await fs.readFile(path.join(kiosk,`public/assets/portraits/${outfit}-master.png`));
 const cutout=await mattePortrait(bytes,path.join(root,'modnet.onnx'));
 const layout=await framePortrait(cutout);
 assert.equal(layout.top+layout.height,2896,'Subject cut edge must meet the footer');
 assert.ok(layout.left>=72&&layout.left+layout.width<=2328,'Portrait stays inside the frame');
 for(const theme of backgrounds){
  const image=await composePortrait(bytes,{backgroundFile:path.join(root,theme.id==='hegra'?'hegra.jpg':`${theme.id}.jpg`),fontFile:path.join(root,'NotoSansArabic.ttf'),modelFile:path.join(root,'modnet.onnx'),theme,cutout,demo:true});
  const info=await sharp(image).metadata();assert.equal(info.width,2400);assert.equal(info.height,3200);assert.equal(info.space,'srgb');
  await fs.writeFile(path.join(output,`${theme.id}-${outfit}.jpg`),image);
  if(theme.id!=='hegra'&&outfit===(backgrounds.indexOf(theme)%2?'thobe':'abaya'))previewTiles[backgrounds.indexOf(theme)]=await sharp(image).resize(450,600).toBuffer();
 }
 console.log(`PASS: ${outfit}, all five backgrounds, natural bottom crop, 2400x3200 sRGB.`);
}
const sheet=await sharp({create:{width:1840,height:670,channels:3,background:'#f7f2e8'}}).composite(previewTiles.map((input,i)=>({input,left:10+i*460,top:10})).concat([{input:Buffer.from(`<svg width="1840" height="670">${backgrounds.slice(0,4).map((b,i)=>`<text x="${235+i*460}" y="646" text-anchor="middle" fill="#163b2d" font-family="sans-serif" font-size="22">${b.name}</text>`).join('')}</svg>`),left:0,top:0}])).jpeg({quality:91}).toBuffer();
await fs.writeFile(path.join(output,'four-background-preview.jpg'),sheet);
// No-person feeds must remain explicitly framed demos; never manufacture a person.
const blank=await sharp({create:{width:768,height:1024,channels:3,background:'#fafafa'}}).jpeg().toBuffer();
const demo=await composePortrait(blank,{backgroundFile:path.join(root,'diriyah-arch.jpg'),fontFile:path.join(root,'NotoSansArabic.ttf'),modelFile:path.join(root,'modnet.onnx'),theme:backgrounds[0],demo:true});
assert.equal((await sharp(demo).metadata()).width,2400);
console.log('PASS: no-person demo fallback. No paid AI calls made.');
