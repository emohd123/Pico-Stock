import sharp from 'sharp';

// This server-only engine is copied into the local demo by sync-pico-ai-backgrounds.mjs.
export async function mattePortrait(bytes, modelFile) {
  const ort=await import('onnxruntime-node');
  const model=await ort.InferenceSession.create(modelFile,{executionProviders:['cpu'],intraOpNumThreads:1,interOpNumThreads:1});
  try {
    const normalized=await sharp(bytes).rotate().resize(1200,1600,{fit:'contain',background:'#ffffff'}).removeAlpha().png().toBuffer();
    const rgb=await sharp(normalized).resize(512,512,{fit:'fill'}).removeAlpha().raw().toBuffer();
    const input=new Float32Array(3*512*512);
    for(let p=0;p<512*512;p++)for(let c=0;c<3;c++)input[c*512*512+p]=rgb[p*3+c]/127.5-1;
    const result=await model.run({[model.inputNames[0]]:new ort.Tensor('float32',input,[1,3,512,512])});
    const alpha=Buffer.from(Array.from(result[model.outputNames[0]].data,v=>Math.round(Math.max(0,Math.min(1,v))*255)));
    const mask=await sharp(alpha,{raw:{width:512,height:512,channels:1}}).resize(1200,1600,{fit:'fill'}).greyscale().raw().toBuffer();
    return sharp(normalized).joinChannel(mask,{raw:{width:1200,height:1600,channels:1}}).png().toBuffer();
  } finally {await model.release();}
}

export async function framePortrait(cutout) {
  const {data,info}=await sharp(cutout).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const rows=new Uint32Array(info.height),cols=new Uint32Array(info.width);
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>64){rows[y]++;cols[x]++;}
  const top=rows.findIndex(n=>n>=Math.max(3,info.width*.008));
  let bottom=info.height-1,left=cols.findIndex(n=>n>=Math.max(3,info.height*.008)),right=info.width-1;
  while(bottom>top&&rows[bottom]<Math.max(3,info.width*.008))bottom--;
  while(right>left&&cols[right]<Math.max(3,info.height*.008))right--;
  if(top<0||left<0||bottom-top<150||right-left<80||(right-left)/(bottom-top)>1.5)throw new Error('PORTRAIT_NOT_DETECTED');
  // Trim transparent padding before scaling. Overshoot the footer so no cut edge floats over scenery.
  const width=right-left+1,height=bottom-top+1;
  const scale=Math.max(1700/width,2450/height);
  const resizedWidth=Math.round(width*scale),resizedHeight=Math.round(height*scale);
  const input=await sharp(cutout).extract({left,top,width,height}).resize(resizedWidth,resizedHeight).png().toBuffer();
  const drawTop=470,available=2896-drawTop;
  const drawWidth=Math.min(2256,resizedWidth);
  const cropped=await sharp(input).extract({left:Math.round((resizedWidth-drawWidth)/2),top:0,width:drawWidth,height:available}).png().toBuffer();
  return {input:cropped,left:Math.round((2400-drawWidth)/2),top:drawTop,width:drawWidth,height:available,sourceBounds:{left,top,width,height}};
}

export async function composePortrait(bytes,{backgroundFile,fontFile,modelFile,theme,demo=false,cutout=null}) {
  const background=await sharp(backgroundFile).resize(2256,2824,{fit:'cover'}).toBuffer();
  let portrait,framedDemo=false;
  try {portrait=await framePortrait(cutout||await mattePortrait(bytes,modelFile));}
  catch(error){
    if(!demo||error.message!=='PORTRAIT_NOT_DETECTED')throw error;
    // Synthetic feeds / absent person: a clearly framed camera demo, never a pretend cutout.
    framedDemo=true;
    portrait={input:await sharp(bytes).resize(1660,2320,{fit:'cover'}).png().toBuffer(),left:370,top:576};
  }
  const tint=theme.footer,accent=theme.accent;
  const frame=Buffer.from(`<svg width="2400" height="3200"><defs><linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tint}" stop-opacity="0"/><stop offset="1" stop-color="${tint}" stop-opacity=".28"/></linearGradient></defs><rect x="72" y="2700" width="2256" height="196" fill="url(#base)"/><rect x="72" y="2896" width="2256" height="232" fill="${tint}"/><path d="M72 2896 H2328" stroke="${accent}" stroke-width="5"/><rect x="72" y="72" width="2256" height="3056" fill="none" stroke="${accent}" stroke-width="5"/>${framedDemo?`<rect x="363" y="569" width="1674" height="2327" fill="none" stroke="${accent}" stroke-width="14"/>`:''}<text x="1200" y="3070" text-anchor="middle" fill="#fff6e3" font-size="30" font-family="sans-serif" letter-spacing="6">SAUDI NATIONAL DAY</text>${demo?`<rect x="610" y="180" width="1180" height="70" rx="35" fill="${tint}"/><text x="1200" y="228" text-anchor="middle" fill="#fff6e3" font-size="32" font-family="sans-serif">DEMO / CLOTHING NOT EDITED</text>`:''}${theme.id==='hegra'?'<text x="1200" y="3170" text-anchor="middle" fill="#365441" font-size="22" font-family="sans-serif">Hegra photo: Prof. Mortel / CC BY 2.0 · cropped &amp; composited</text>':'<text x="1200" y="3170" text-anchor="middle" fill="#365441" font-size="20" font-family="sans-serif" letter-spacing="4">YOUR SAUDI MOMENT</text>'}</svg>`);
  const arabic=await sharp({text:{text:'<span foreground="#fff6e3">اليوم الوطني السعودي</span>',font:'Noto Sans Arabic Bold 58',fontfile:fontFile,rgba:true}}).png().toBuffer();
  const meta=await sharp(arabic).metadata();
  return sharp({create:{width:2400,height:3200,channels:3,background:'#f7f2e8'}}).composite([{input:background,left:72,top:72},{input:portrait.input,left:portrait.left,top:portrait.top},{input:frame,left:0,top:0},{input:arabic,left:Math.round((2400-meta.width)/2),top:2940}]).toColourspace('srgb').jpeg({quality:92}).toBuffer();
}
