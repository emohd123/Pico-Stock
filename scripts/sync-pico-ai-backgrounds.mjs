import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const kiosk=path.resolve('../ai photo post/saudi-moment-app');
const source=path.join(kiosk,'design/national-day-backgrounds');
const {files}=JSON.parse(await fs.readFile(path.join(source,'prompts.json'),'utf8'));
await fs.mkdir('public/pico-ai/backgrounds',{recursive:true});
await fs.mkdir(path.join(kiosk,'server/models'),{recursive:true});
for(const {name,path:generated} of files){
  const original=path.join(source,`${name}.png`);
  try{await fs.access(original);}catch{await fs.copyFile(generated,original);}
  await sharp(original).resize(2400,3200,{fit:'cover'}).jpeg({quality:93}).toFile(`private/pico-ai/${name}.jpg`);
  await sharp(original).resize(270,360).webp({quality:82}).toFile(`public/pico-ai/backgrounds/${name}.webp`);
  await fs.copyFile(`private/pico-ai/${name}.jpg`,path.join(kiosk,`public/assets/backgrounds/${name}.jpg`));
}
await sharp('private/pico-ai/hegra.jpg').resize(270,360,{fit:'cover'}).webp({quality:82}).toFile('public/pico-ai/backgrounds/hegra.webp');
await fs.copyFile('lib/picoAi/backgrounds.json',path.join(kiosk,'shared/backgrounds.json'));
await fs.copyFile('lib/picoAi/portrait-engine.mjs',path.join(kiosk,'server/portrait-engine.mjs'));
await fs.copyFile('private/pico-ai/modnet.onnx',path.join(kiosk,'server/models/modnet.onnx'));
console.log('Synced four generated backgrounds, thumbnails, portrait engine and local CPU model.');
