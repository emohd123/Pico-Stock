// Supplier quotation and reference photographs supplied by the user, 24 September 2026.
import { tentFootprint, worldGroundPoint, localGroundPoint, rectInsideFootprint } from './eventStudioLayout.js';

export const LOUNGE_IDS = ['lounge-1','lounge-2a','lounge-2b','lounge-3'];
export const TENT_OPTIONS = {
  mq40: { id:'mq40', name:'MQ40 Hexagon Marquee', label:'Option A · MQ40 open', dimensions:[10.5,6.8,12], area:95, eave:2.902, price:2900, roofType:'hexagon', photo:'supplier/mq40-reference.jpg', heightStatus:'supplier', note:'10.5 × 12 m; 6.8 m peak and 2.902 m post height from the supplied sheet. Quoted usable area: 95 m²; the six-sided nominal polygon measures 94.5 m². Roof curvature, bracing and anchoring remain visual reconstructions.' },
  arabesque: { id:'arabesque', name:'Arabesque tent', label:'Option B · Arabesque open', dimensions:[12,5.5,6], area:72, eave:2.8, price:2400, roofType:'arabesque', photo:'supplier/arabesque-reference.jpg', heightStatus:'estimated', note:'12 m frontage × 6 m depth (72 m²), with three roof peaks from the supplied photographs. The 5.5 m overall height, 2.8 m eave, finials and frame details are editable visual estimates; no measured section was supplied.' },
};
export const TENT_COMPARISONS = [
  {key:'mq40',optionId:'mq40',glass:false,title:'MQ40 Hexagon',eyebrow:'OPTION A',price:2900,preview:'supplier/mq40-preview.png'},
  {key:'arabesque',optionId:'arabesque',glass:false,title:'Arabesque open',eyebrow:'OPTION B',price:2400,preview:'supplier/arabesque-preview.png'},
  {key:'arabesque-glass',optionId:'arabesque',glass:true,title:'Arabesque + glass',eyebrow:'OPTION B + FRONT GLAZING',price:4200,preview:'supplier/arabesque-glass-preview.png'},
];
export function isLoungeTent(o) { return o?.kind==='tent' && (LOUNGE_IDS.includes(o.id)||Boolean(o.metadata?.supplierTent)); }
export function applyTentOption(object,id,glass=false) {
  const option=TENT_OPTIONS[id];if(!option)throw new Error('Unknown supplier tent option');
  const original=object.metadata?.originalPlanFootprint||{dimensions:[...object.dimensions],points:object.points?.map(p=>[...p]),roofType:object.roofType};
  const points=id==='mq40'?[[0,-6],[-5.25,-3],[-5.25,3],[0,6],[5.25,3],[5.25,-3]]:[[-6,-3],[6,-3],[6,3],[-6,3]];
  return {...object,dimensions:[...option.dimensions],points,roofType:option.roofType,color:'#f5f3eb',metadata:{...object.metadata,originalPlanFootprint:original,supplierTent:id,frontGlass:id==='arabesque'&&glass,wallStyle:'open',eaveHeight:option.eave,measurementStatus:'mixed',footprintStatus:'supplier',heightStatus:option.heightStatus,sourceDimensions:id==='mq40'?'10.5 × 12 m · peak 6.8 m':'6 × 12 m · height estimated',notes:option.note+' Position and orientation retain the saved site layout. Open rental configuration; furniture, décor and the proposed deck are not included in the listed tent price.',quote:{currency:'BHD',tent:option.price,frontGlass:id==='arabesque'&&glass?1800:0,exclusions:'Furniture and décor excluded; flooring, VAT, rental period and other charges are not specified.',source:'User-supplied supplier quotation · 2026-09-24'},supplierReference:option.photo}};
}
export function tentQuote(o) {
  const option=TENT_OPTIONS[o.metadata?.supplierTent];if(!option)return null;
  const glass=option.id==='arabesque'&&o.metadata.frontGlass;
  return {option,glass,tent:option.price,glazing:glass?1800:0,total:option.price+(glass?1800:0),standard:option.dimensions.every((n,i)=>Math.abs(n-o.dimensions[i])<.001)};
}
export function tentLayoutIssues(scene,o) {
  if(!o)return {overlaps:[],outside:0};
  const footprint=tentFootprint(o),world=footprint.map(p=>worldGroundPoint(o,...p));
  const overlap=(a,b)=>!a.concat(b).some((_,i)=>{const source=i<a.length?a:b,j=i<a.length?i:i-a.length,p=source[j],q=source[(j+1)%source.length],axis=[p[1]-q[1],q[0]-p[0]],pa=a.map(v=>v[0]*axis[0]+v[1]*axis[1]),pb=b.map(v=>v[0]*axis[0]+v[1]*axis[1]);return Math.max(...pa)<=Math.min(...pb)+.001||Math.max(...pb)<=Math.min(...pa)+.001;});
  const overlaps=scene.objects.filter(t=>t.id!==o.id&&t.visible!==false&&t.kind==='tent'&&Math.hypot(t.position[0]-o.position[0],t.position[2]-o.position[2])<Math.max(...o.dimensions)+Math.max(...t.dimensions)&&overlap(world,tentFootprint(t).map(p=>worldGroundPoint(t,...p)))).map(t=>t.name);
  const outside=scene.objects.filter(f=>f.kind==='furniture'&&f.visible!==false&&f.metadata?.parentTentId===o.id).filter(f=>{const [x,z]=localGroundPoint(o,f.position[0],f.position[2]);return !rectInsideFootprint(footprint,x,z,f.dimensions[0],f.dimensions[2],f.rotation[1]-o.rotation[1],0);}).length;
  return {overlaps,outside};
}

export function supplierWalls(o) {
  if(!TENT_OPTIONS[o.metadata?.supplierTent])return null;
  const [w,,d]=o.dimensions,glass=o.metadata.supplierTent==='arabesque'&&o.metadata.frontGlass;
  return {points:tentFootprint(o),segments:glass?[[[-w/2,d/2],[w/2,d/2]]]:[],entrance:{center:[0,glass?-d/2:d/2],width:w}};
}

/** Parametric membrane coordinates shared with the Blender reconstruction. */
export function supplierCanopy(o) {
  const [w,h,d]=o.dimensions,e=o.metadata?.eaveHeight||2.8,vertices=[],indices=[];
  if(o.metadata?.supplierTent==='mq40'){
    const corners=tentFootprint(o),perimeter=[];
    corners.forEach((a,i)=>{const b=corners[(i+1)%corners.length];for(let j=0;j<8;j++){const t=j/8;perimeter.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,e-.38*Math.sin(Math.PI*t)]);}});
    const rings=12,n=perimeter.length;
    for(let k=0;k<=rings;k++){const r=1-k/rings;for(const [x,z,edge] of perimeter)vertices.push(x*r,edge+(h-edge)*Math.pow(1-r,1.65),z*r);}
    for(let k=0;k<rings;k++)for(let i=0;i<n;i++){const a=k*n+i,b=k*n+(i+1)%n,c=(k+1)*n+i,f=(k+1)*n+(i+1)%n;indices.push(a,b,c,b,f,c);}
  }else{
    const nx=60,nz=30,peak=h-.3;
    for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const x=-w/2+w*i/nx,z=-d/2+d*j/nz,bay=w/3,centre=-w/2+bay/2+Math.min(2,Math.floor((x+w/2)/bay))*bay,t=Math.min(1,Math.abs(x-centre)/(bay/2)),end=Math.pow(Math.min(1,Math.max(0,(w/2-Math.abs(x))/(bay/2))),.65),side=Math.pow(Math.max(0,1-Math.abs(z)/(d/2)),1.6),rise=(.4+.6*Math.pow(1-t,1.65))*end*side;vertices.push(x,e+(peak-e)*rise,z);}
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,f=c+1;indices.push(a,c,b,b,c,f);}
  }
  return {vertices,indices};
}
