import fs from 'node:fs/promises';
import { TENT_COMPARISONS,applyTentOption } from '../../lib/eventStudioTents.js';
const objects=TENT_COMPARISONS.map((v,i)=>({...applyTentOption({id:`library-${v.key}`,kind:'tent',name:v.title,position:[(i-1)*18,0,0],rotation:[0,0,0],dimensions:[12,6.8,12],metadata:{}},v.optionId,v.glass),preview:v.preview,comparisonKey:v.key}));
await fs.mkdir('private/event-studio/rbc/supplier',{recursive:true});
await fs.writeFile('private/event-studio/rbc/supplier/tent-library.json',JSON.stringify({units:'m',source:'User-supplied supplier quotation and images, 24 September 2026',notes:'Library demonstration positions only. Tent dimensions and options match the browser. Furniture and decor excluded; proposed deck excluded from price. Arabesque height and construction details estimated.',objects},null,2));
console.log('Created three supplier tent templates without changing the saved event layout.');
