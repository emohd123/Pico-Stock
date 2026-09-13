import dotenv from 'dotenv';import {GoogleGenAI} from '@google/genai';import fs from 'node:fs/promises';import {poster} from '../lib/picoAi/process.js';
dotenv.config({path:'.env.local',quiet:true});
const model=process.env.PICO_AI_IMAGE_MODEL||'gemini-3.1-flash-image';
try{const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});const result=await ai.models.get({model});console.log('Google model accessible:',result.name);}catch(e){console.log('Google model check failed:',e.status||e.code||'unavailable');}
const bytes=await fs.readFile('../ai photo post/saudi-moment-app/public/assets/portraits/abaya-card.webp');
await fs.mkdir('output/pico-ai',{recursive:true});await fs.writeFile('output/pico-ai/matting-check.jpg',await poster(bytes));console.log('Portrait matting and 2400x3200 composition completed with supplied fictional sample.');
