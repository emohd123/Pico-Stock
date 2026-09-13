import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import path from 'node:path';
import { db, checked, readImage, putImage, erase, secret, fail } from './core.js';

import backgrounds from './backgrounds.json' with {type:'json'};
import landmarks from './landmarks.json' with {type:'json'};
import {mattePortrait,composePortrait} from './portrait-engine.mjs';
const root=path.join(process.cwd(),'private/pico-ai');
export const matte=bytes=>mattePortrait(bytes,path.join(root,'modnet.onnx'));
export async function poster(bytes,demo=false,backgroundId='diriyah-arch') {
 const landmark=landmarks.find(b=>b.id===backgroundId);
 if(landmark&&landmark.status!=='approved')throw new Error('Landmark photograph needs approval');
 const theme=backgrounds.find(b=>b.id===backgroundId)||(landmark?{...landmark,accent:'#E4C78B',footer:'#042D25',lighting:'soft natural daylight'}:null);
 if(!theme)throw new Error('Unknown portrait background');
 return composePortrait(bytes,{backgroundFile:landmark?path.join(process.cwd(),'public',landmark.path):path.join(root,theme.id==='hegra'?'hegra.jpg':`${theme.id}.jpg`),fontFile:path.join(root,'NotoSansArabic.ttf'),modelFile:path.join(root,'modnet.onnx'),theme,demo});
}
export async function processJob(j,s) {
  const claimed=await checked(db().rpc('pico_ai_claim',{p_job:j.id}));
  if (!claimed) return;
  const sourcePath=`${j.id}/capture.jpg`,editPath=`${j.id}/edit.jpg`,posterPath=`${j.id}/poster.jpg`;
  let providerStarted=false;
  try {
    const landmark=landmarks.find(b=>b.id===s.background_id);
    if(landmark&&landmark.status!=='approved')fail('Landmark photograph needs approval',503);
    let bytes=await readImage(sourcePath);
    const info=await sharp(bytes,{limitInputPixels:24000000}).metadata();
    if(info.format!=='jpeg' || info.width<300 || info.height<400) fail('Use a clear camera photo');
    await checked(db().from('pico_ai_jobs').update({captured_at:new Date().toISOString()}).eq('id',j.id));
    bytes=await sharp(bytes).rotate().resize(768,1024,{fit:'cover'}).jpeg({quality:90}).toBuffer();
    if(j.mode==='live') {
      if(!process.env.GEMINI_API_KEY) fail('Google image API is not configured',503);
      const theme=backgrounds.find(b=>b.id===s.background_id)||backgrounds[0];
      const outfit=s.outfit==='abaya'?'a modest black Saudi abaya with appropriate head covering':'a traditional white Saudi thobe and appropriate Saudi headwear';
      const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
      providerStarted=true;
      const result=await ai.models.generateContent({model:process.env.PICO_AI_IMAGE_MODEL || 'gemini-3.1-flash-image',contents:[{role:'user',parts:[{text:`Edit this consenting guest portrait. Change only clothing to ${outfit}. Keep the same person, apparent age, face identity, expression, skin tone, glasses, pose and hands. Keep children age appropriate. One person only, photorealistic, well lit, portrait 3:4 composition, full head with comfortable headroom and upper body inside frame, close waist-up editorial portrait. Keep the same pose. Match ${theme.lighting} gently while keeping natural skin tone. Use a plain neutral background for later portrait matting. No text, logos or decorative frame.`},{inlineData:{data:bytes.toString('base64'),mimeType:'image/jpeg'}}]}],config:{responseModalities:['IMAGE'],imageConfig:{aspectRatio:'3:4',imageSize:'1K'},httpOptions:{timeout:180000}}});
      const image=result.candidates?.[0]?.content?.parts?.find(p=>p.inlineData?.mimeType?.startsWith('image/'))?.inlineData;
      if(!image?.data) fail('The image service could not create this portrait. Please ask staff.',422);
      bytes=await sharp(Buffer.from(image.data,'base64'),{limitInputPixels:24000000}).jpeg().toBuffer();
      await putImage(editPath,bytes);
    }
    const stage=await checked(db().from('pico_ai_jobs').update({status:'compositing'}).eq('id',j.id).eq('status','editing').select('id'));
    if(!stage.length) return;
    const output=await poster(bytes,j.mode==='mock',s.background_id||'hegra');
    await putImage(posterPath,output);
    const saved=await checked(db().from('pico_ai_jobs').update({status:'ready',poster_path:posterPath,share_token:secret(),expires_at:new Date(Date.now()+86400000).toISOString(),finished_at:new Date().toISOString(),completed_at:new Date().toISOString()}).eq('id',j.id).eq('status','compositing').select('id'));
    if(!saved.length) await erase([posterPath]);
  } catch(error) {
    await checked(db().from('pico_ai_jobs').update({status:'failed',error:providerStarted?'Image processing failed. Staff can review this attempt before another paid capture.':error.status?error.message:'Image processing failed',finished_at:new Date().toISOString()}).eq('id',j.id).in('status',['editing','compositing']));
    console.error('Pico AI processing:',error.message);
  } finally { await erase([sourcePath,editPath]); }
}
