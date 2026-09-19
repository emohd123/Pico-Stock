'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { validateEventLayout } from '@/lib/eventLayoutSchema';
import { tentFootprint, localGroundPoint, worldGroundPoint, freeFloorSlot, occupantsOf, clampIntoFootprint, hostTentAt } from '@/lib/eventStudioLayout';

const API = '/api/pico-ai/admin/event-layouts/royal-bahrain-concours-2026';
const copy = value => JSON.parse(JSON.stringify(value));
const metres = value => Number(value).toLocaleString('en', { maximumFractionDigits: 2 });
const TENT_FLOOR = .13; // the tent deck, matching the seeded pieces, so nothing sinks into the floor
const PLACEMENT_LATTICE = .5; // matches the move snap, so placed and dragged pieces line up
const paths = {
  orbit:'M12 3a9 9 0 1 0 9 9M12 3v6m0-6h6M3 12h18M12 3c-5 5-5 13 0 18 3-3 4-6 4-9',
  map:'m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16',
  walk:'M13 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-2 2-3 4H4m8-4 4 5h4m-8-5-2 8-5 6m6-8 5 3 2 6',
  edit:'m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z',
  undo:'M4 5v6h6M4 11c3-8 16-6 16 2a7 7 0 0 1-11 6',
  redo:'M20 5v6h-6m6 0C17 3 4 5 4 13a7 7 0 0 0 11 6',
  roof:'m2 12 10-9 10 9M5 10v11h14V10',
  eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
  camera:'M3 7h5l2-3h4l2 3h5v14H3V7Zm9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  expand:'M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6',
  download:'M12 2v13m-5-5 5 5 5-5M3 16v5h18v-5',
  external:'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
  plus:'M12 4v16M4 12h16',
  search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6',
  layers:'m12 2 10 5-10 5L2 7l10-5ZM2 12l10 5 10-5M2 17l10 5 10-5',
  move:'M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4',
  rotate:'M20 3v6h-6m6 0A9 9 0 1 0 3 17',
  play:'m8 4 12 8-12 8V4Z',
  stop:'M5 5h14v14H5V5Z',
  lock:'M5 10h14v12H5V10Zm3 0V6a4 4 0 0 1 8 0v4',
  trash:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  copy:'M8 8h13v13H8V8ZM4 16H2V2h14v2',
  pin:'M12 22s8-8 8-14A8 8 0 0 0 4 8c0 6 8 14 8 14Zm0-18a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
};
function Icon({name,size=18}) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.layers}/></svg>; }
function Tool({label,icon,active,onClick,disabled,children}) {return <button className={`es-tool${active?' is-active':''}`} aria-label={label} title={label} aria-pressed={active===undefined?undefined:active} onClick={onClick} disabled={disabled}><Icon name={icon}/>{children&&<span>{children}</span>}</button>;}
function NumberField({label,value,onChange,min,step=.1,unit='m',disabled=false}) {const [draft,setDraft]=useState(String(value??0));useEffect(()=>setDraft(String(value??0)),[value]);return <label className="es-number"><span>{label}</span><div><input aria-label={label} type="number" step={step} min={min} max={100000} disabled={disabled} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>{const next=Number(draft);if(draft!==''&&Number.isFinite(next)&&Math.abs(next)<=100000&&(min===undefined||next>=min)&&next!==value)onChange(next);else setDraft(String(value??0));}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/><small>{unit}</small></div></label>;}
function downloadBlob(value,name,type='application/json') {const blob=value instanceof Blob?value:new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function VenueReferences({references}) {
  const links=(Array.isArray(references)?references:[]).flatMap(reference=>{
    if(!reference||typeof reference.url!=='string'||typeof reference.title!=='string')return [];
    try {const url=new URL(reference.url);return ['https:','http:'].includes(url.protocol)?[{...reference,url:url.href}]:[];}catch{return [];}
  });
  return <section aria-labelledby="venue-references-heading">
    <h2 id="venue-references-heading" className="es-section-label">Venue references</h2>
    <p className="es-muted">2026 plan sets positions and scale. Venue photos guide appearance; heights remain estimates.</p>
    {links.map((reference,index)=><a className="es-file" key={`${reference.url}-${index}`} href={reference.url} target="_blank" rel="noopener noreferrer"><Icon name="external"/><span>{reference.title}<small>{typeof reference.notes==='string'&&reference.notes?reference.notes:reference.kind==='plan'?'Plan reference':reference.kind==='event'?'Official event source':'Official venue source'} · Opens in new tab</small></span></a>)}
    {!links.length&&<p className="es-muted">No source links saved in this layout.</p>}
  </section>;
}

export default function EventStudio() {
  const [scene,setScene]=useState(null),[assets,setAssets]=useState([]),[revision,setRevision]=useState(0),[history,setHistory]=useState([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[saveState,setSaveState]=useState('saved'),[notice,setNotice]=useState('');
  const [tab,setTab]=useState('site'),[search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[selected,setSelected]=useState(null),[assetDetail,setAssetDetail]=useState(null);
  const [mode,setMode]=useState('orbit'),[editing,setEditing]=useState(false),[transform,setTransform]=useState('translate'),[snap,setSnap]=useState(true);
  const [roofs,setRoofs]=useState(true),[walls,setWalls]=useState(true),[labels,setLabels]=useState(true),[evening,setEvening]=useState(false),[tour,setTour]=useState(false);
  const [stats,setStats]=useState({fps:0}),[assetLoad,setAssetLoad]=useState({loading:0,failed:0}),[full,setFull]=useState(false),[rail,setRail]=useState(true),[inspector,setInspector]=useState(true);
  const [undoStack,setUndoStack]=useState([]),[redoStack,setRedoStack]=useState([]),[versionName,setVersionName]=useState(''),[downloads,setDownloads]=useState([]),[viewName,setViewName]=useState(''),[recording,setRecording]=useState(null);
  const viewport=useRef(null),engine=useRef(null),sceneRef=useRef(null),revisionRef=useRef(0),assetsRef=useRef([]),dirty=useRef(false),serial=useRef(0),saving=useRef(false),conflict=useRef(false),commitRef=useRef(null);
  const selectedRef=useRef(null),root=useRef(null),importFile=useRef(null),recordingRef=useRef(null);
  useEffect(()=>()=>recordingRef.current?.cancel(),[]);
  const announce=useCallback(message=>{setNotice(message);},[]);

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try {const res=await fetch(API,{cache:'no-store'});const payload=await res.json();if(!res.ok)throw new Error(res.status===401?'Please sign in to Pico Stock to open the studio.':payload.error||'Could not load this layout.');
      sceneRef.current=payload.scene;assetsRef.current=payload.assets||[];revisionRef.current=payload.revision;dirty.current=false;conflict.current=false;
      setScene(payload.scene);setAssets(payload.assets||[]);setRevision(payload.revision);setHistory(payload.history||[]);setSaveState('saved');setUndoStack([]);setRedoStack([]);
      setMode('orbit');setEditing(false);setTransform('translate');setSnap(true);setRoofs(true);setWalls(true);setLabels(true);setEvening(false);setTour(false);setSelected(null);setAssetDetail(null);
      fetch(`${API}/downloads`).then(r=>r.ok?r.json():{files:[]}).then(d=>setDownloads(d.files||[])).catch(()=>{});
    } catch(err){setError(err.message);}finally{setLoading(false);}
  },[]);
  useEffect(()=>{load();},[load]);
  const commit=useCallback((updater,message)=>{
    const current=sceneRef.current;if(!current)return;const next=typeof updater==='function'?updater(copy(current)):copy(updater);
    try{validateEventLayout(next);}catch(err){setError(`Change could not be applied: ${err.message}`);return;}
    setUndoStack(stack=>[...stack.slice(-29),copy(current)]);setRedoStack([]);sceneRef.current=next;setScene(next);serial.current++;dirty.current=true;setSaveState('unsaved');if(message)announce(message);
  },[announce]);commitRef.current=commit;
  const updateObject=useCallback((id,patch)=>{
    const original=sceneRef.current?.objects.find(o=>o.id===id);if(!original)return;
    if(original.locked&&!(Object.keys(patch).length===1&&typeof patch.locked==='boolean')){setNotice('Unlock this object before editing it.');return;}
    commitRef.current(d=>{
      const target=d.objects.find(o=>o.id===id),prior=copy(target),group=target.metadata?.groupId;
      Object.assign(target,patch);
      if(patch.dimensions&&target.points){const sx=patch.dimensions[0]/prior.dimensions[0],sz=patch.dimensions[2]/prior.dimensions[2];target.points=target.points.map(p=>[p[0]*sx,p[1]*sz]);}
      if(patch.position||patch.rotation){const angle=target.rotation[1]-prior.rotation[1],cos=Math.cos(angle),sin=Math.sin(angle);
        for(const item of d.objects){if(item.id===id||item.locked)continue;const belongs=(prior.kind==='tent'&&item.metadata?.parentTentId===id)||(group&&item.metadata?.groupId===group);if(!belongs)continue;
          const dx=item.position[0]-prior.position[0],dz=item.position[2]-prior.position[2];item.position=[target.position[0]+dx*cos+dz*sin,item.position[1]+target.position[1]-prior.position[1],target.position[2]-dx*sin+dz*cos];item.rotation[1]+=angle;
        }
        const zone=d.zones.find(z=>z.objectIds.includes(id)&&z.name===prior.name);if(zone)zone.position=[...target.position];
      }
      // A piece stays on the floor of the tent it belongs to, however it is dragged or resized.
      const reseat=piece=>{
        const host=d.objects.find(o=>o.id===piece.metadata?.parentTentId);if(!host||host.id===piece.id)return;
        const [lx,lz]=localGroundPoint(host,piece.position[0],piece.position[2]);
        const [cx,cz]=clampIntoFootprint(tentFootprint(host),lx,lz,piece.dimensions[0],piece.dimensions[2],(piece.rotation?.[1]||0)-(host.rotation?.[1]||0));
        if(Math.abs(cx-lx)>1e-3||Math.abs(cz-lz)>1e-3){const [wx,wz]=worldGroundPoint(host,cx,cz);piece.position=[+wx.toFixed(3),piece.position[1],+wz.toFixed(3)];}
      };
      if(target.kind==='furniture')reseat(target);
      else if(target.kind==='tent'&&(patch.dimensions||patch.points||patch.roofType))for(const piece of d.objects)if(piece.metadata?.parentTentId===target.id&&!piece.locked)reseat(piece);
      return d;
    });
  },[]);
  const save=useCallback(async(name)=>{
    if(!sceneRef.current||saving.current||conflict.current)return false;
    saving.current=true;setSaveState('saving');const savedSerial=serial.current;
    try {const res=await fetch(API,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({scene:sceneRef.current,expectedRevision:revisionRef.current,...(name?{name}:{})})});const p=await res.json();if(!res.ok){if(res.status===409){conflict.current=true;throw new Error('Another session saved a newer layout. Download your work, then reload the latest version.');}throw new Error(p.error||'Saving was interrupted. Your changes are still open here.');}
      revisionRef.current=p.revision;setRevision(p.revision);dirty.current=serial.current!==savedSerial;setSaveState(dirty.current?'unsaved':'saved');setError('');
      if(name){setVersionName('');announce(`Version “${name}” saved.`);const h=await fetch(`${API}/revisions`).then(r=>r.json());setHistory(h.revisions||[]);}return true;
    }catch(err){setSaveState('error');setError(err.message);return false;}finally{saving.current=false;}
  },[announce]);
  useEffect(()=>{if(!scene||!dirty.current||conflict.current||saveState==='error'||saveState==='saving')return;const timer=setTimeout(()=>save(),1800);return()=>clearTimeout(timer);},[scene,save,saveState]);
  useEffect(()=>{const retry=()=>{if(dirty.current&&!conflict.current)save();};window.addEventListener('online',retry);return()=>window.removeEventListener('online',retry);},[save]);
  useEffect(()=>{const handler=e=>{if(dirty.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[]);
  const sceneReady=Boolean(scene);
  useEffect(()=>{
    if(loading||!sceneRef.current||!viewport.current||engine.current)return;
    let canceled=false;
    import('@/lib/eventStudioEngine').then(({EventStudioEngine})=>{if(canceled||!viewport.current)return;
      try {const next=new EventStudioEngine(viewport.current,{onSelect:id=>{selectedRef.current=id;setSelected(id);setInspector(true);setAssetDetail(null);},onTransform:(id,patch)=>updateObject(id,patch),onStats:setStats,onAssets:setAssetLoad,onMode:value=>{setMode(value);if(value==='walk')setEditing(false);},onTour:setTour,onError:setError});engine.current=next;next.setScene(sceneRef.current,assetsRef.current);next.setSnap(true);}
      catch(err){setError(`The 3D view could not start: ${err.message}`);}
    });return()=>{canceled=true;engine.current?.dispose();engine.current=null;};
  // The engine owns its WebGL context for the mounted workspace; scene edits update below.
  },[loading,sceneReady,updateObject]);
  useEffect(()=>{if(engine.current&&scene)engine.current.setScene(scene,assets);},[scene,assets]);
  useEffect(()=>{selectedRef.current=selected;engine.current?.select(selected);},[selected]);
  useEffect(()=>engine.current?.setEditing(editing),[editing]);
  useEffect(()=>engine.current?.setTransformMode(transform),[transform]);
  useEffect(()=>engine.current?.setSnap(snap),[snap]);
  useEffect(()=>engine.current?.setVisibility({roofs,walls,labels}),[roofs,walls,labels]);
  useEffect(()=>engine.current?.setLighting(evening),[evening]);
  useEffect(()=>{const handler=()=>setFull(!!document.fullscreenElement);document.addEventListener('fullscreenchange',handler);return()=>document.removeEventListener('fullscreenchange',handler);},[]);
  useEffect(()=>{if(window.innerWidth<1150)setInspector(false);if(window.innerWidth<760)setRail(false);},[]);
  useEffect(()=>{if(tab==='versions')fetch(`${API}/revisions`).then(r=>r.ok?r.json():{}).then(h=>setHistory(h.revisions||[])).catch(()=>{});},[tab,revision]);

  const object=scene?.objects.find(o=>o.id===selected);
  const selectedAsset=assetDetail||assets.find(a=>a.id===object?.assetId||String(a.productId)===String(object?.productId));
  const quantity=useMemo(()=>{const counts={};for(const o of scene?.objects||[])if(o.productId)counts[o.productId]=(counts[o.productId]||0)+1;return counts;},[scene]);
  const overstock=assets.filter(a=>Number.isFinite(a.stock)&&(quantity[a.productId]||0)>a.stock);
  const tents=scene?.objects.filter(o=>o.kind==='tent')||[];
  const matchingAssets=assets.filter(a=>(filter==='all'||a.category===filter)&&`${a.name} ${a.category} ${a.productId}`.toLowerCase().includes(search.toLowerCase()));
  const siteItems=(scene?.objects||[]).filter(o=>['tent','building','stage','sign'].includes(o.kind)&&(!search||`${o.name} ${o.id} ${o.zoneId||''}`.toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>a.name.localeCompare(b.name,'en',{numeric:true}));
  const chooseObject=(id,focus=false)=>{if(window.innerWidth<760)setRail(false);setSelected(id);setAssetDetail(null);setInspector(true);if(focus)engine.current?.focus(id);};
  const navigate=(next)=>{engine.current?.setMode(next);if(next==='walk'){setEditing(false);announce('WASD or arrow keys to walk. Drag to look. Shift moves faster. Double-click for mouse look.');}};
  const undo=()=>{if(!undoStack.length)return;const previous=undoStack[undoStack.length-1];setRedoStack(s=>[...s,copy(sceneRef.current)]);setUndoStack(s=>s.slice(0,-1));sceneRef.current=copy(previous);setScene(sceneRef.current);serial.current++;dirty.current=true;setSaveState('unsaved');};
  const redo=()=>{if(!redoStack.length)return;const next=redoStack[redoStack.length-1];setUndoStack(s=>[...s,copy(sceneRef.current)]);setRedoStack(s=>s.slice(0,-1));sceneRef.current=copy(next);setScene(sceneRef.current);serial.current++;dirty.current=true;setSaveState('unsaved');};
  const addFurniture=(asset,replace=false)=>{
    const previous=sceneRef.current?.objects.find(o=>o.id===selectedRef.current);
    if(replace&&previous?.locked){announce('Unlock the selected furniture before replacing it.');return;}
    const objects=sceneRef.current?.objects||[];const view=engine.current?.getView();
    // A piece belongs to the tent you are working in: the selected tent, the tent holding the
    // selected piece, or whichever tent the view is pointing at.
    const host=previous?.kind==='tent'?previous
      :previous?.metadata?.parentTentId?objects.find(o=>o.id===previous.metadata.parentTentId)
      :view?hostTentAt(objects,view.target[0],view.target[2]):null;
    const [assetWidth,,assetDepth]=asset.dimensions;
    let position=view?[+view.target[0].toFixed(3),0,+view.target[2].toFixed(3)]:[0,0,0],rotation=[0,0,0];
    if(host){
      const footprint=tentFootprint(host),occupied=occupantsOf(objects,host);
      const slot=freeFloorSlot({footprint,width:assetWidth,depth:assetDepth,occupied,lattice:PLACEMENT_LATTICE,wallClearance:.25})
        ||freeFloorSlot({footprint,width:assetWidth,depth:assetDepth,occupied,lattice:.25,wallClearance:.05});
      if(!slot&&!replace){announce(`${host.name} has no clear floor left for ${asset.name}. Move a piece, or choose a smaller item.`);return;}
      const [x,z]=worldGroundPoint(host,...(slot||[0,0]));
      position=[+x.toFixed(3),TENT_FLOOR,+z.toFixed(3)];rotation=[0,host.rotation?.[1]||0,0];
    }
    const id=replace&&previous?.kind==='furniture'?previous.id:`furniture-${crypto.randomUUID()}`;
    const item={id,name:asset.name,kind:'furniture',assetId:asset.id,productId:String(asset.productId),position:replace&&previous?[...previous.position]:position,rotation:replace&&previous?[...previous.rotation]:rotation,dimensions:[...asset.dimensions],color:asset.color||'#ded5c4',metadata:{measurementStatus:asset.measurementStatus==='catalogue'?'plan-derived':'estimated',sourceDimensions:asset.sourceDimensions,notes:asset.notes}};
    if(host?.zoneId||previous?.zoneId)item.zoneId=host?.zoneId||previous.zoneId;
    if(host)item.metadata.parentTentId=host.id;
    commit(d=>{if(replace&&previous?.kind==='furniture')d.objects=d.objects.map(o=>o.id===id?item:o);else{d.objects.push(item);if(item.zoneId){const zone=d.zones.find(z=>z.id===item.zoneId);if(zone)zone.objectIds.push(id);}}return d;},`${asset.name} ${replace?'replaced':'placed'}.`);
    setSelected(id);setAssetDetail(null);setEditing(true);setInspector(true);if(window.innerWidth<760)setRail(false);
  };
  const duplicate=()=>{if(!object||object.locked)return;const item=copy(object);item.id=`${object.kind}-${crypto.randomUUID()}`;item.name=`${object.name} · copy`;const offset=Math.max(1,object.dimensions[0]+.3);item.position[0]+=offset;
    commit(d=>{const additions=[item];if(object.kind==='tent')for(const child of d.objects.filter(o=>o.metadata?.parentTentId===object.id)){const twin=copy(child);twin.id=`furniture-${crypto.randomUUID()}`;twin.position[0]+=offset;twin.metadata.parentTentId=item.id;additions.push(twin);}for(const added of additions){d.objects.push(added);const zone=d.zones.find(z=>z.id===added.zoneId);if(zone)zone.objectIds.push(added.id);}return d;},object.kind==='tent'?'Tent and contents duplicated.':'Object duplicated.');setSelected(item.id);};
  const remove=()=>{if(!object||object.locked)return;commit(d=>{d.objects=d.objects.filter(o=>o.id!==object.id);for(const item of d.objects)if(item.metadata?.parentTentId===object.id)delete item.metadata.parentTentId;for(const z of d.zones)z.objectIds=z.objectIds.filter(id=>id!==object.id);return d;},object.kind==='tent'?'Tent removed; its contents remain in place. Undo is available.':'Object removed. Undo is available.');setSelected(null);};
  const recordTour=async()=>{if(!engine.current||recordingRef.current)return;try{const {recordEventTour}=await import('@/lib/eventStudioRecording');const task=recordEventTour(engine.current,setRecording);recordingRef.current=task;const blob=await task.done;if(blob){downloadBlob(blob,'Royal-Concours-Walkthrough-1080p.webm');announce('90-second walkthrough downloaded at 1920 × 1080.');}}catch(err){setError(err.message);}finally{recordingRef.current=null;setRecording(null);}};
  const restore=async n=>{if(dirty.current&&!(await save()))return;try{const res=await fetch(`${API}/revisions/${n}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:revisionRef.current,name:`Restored version ${n}`})});const p=await res.json();if(!res.ok)throw new Error(p.error||'Could not restore this version.');await load();announce(`Version ${n} restored as a new revision.`);}catch(err){setError(err.message);}};
  const capture=()=>{const image=engine.current?.screenshot();if(!image)return;const a=document.createElement('a');a.download=`Royal-Concours-${Date.now()}.png`;a.href=image;a.click();announce('Current view downloaded.');};
  const importLayout=async e=>{const f=e.target.files?.[0];if(!f)return;try{const parsed=JSON.parse(await f.text());const next=parsed.scene||parsed;const {validateEventLayout}=await import('@/lib/eventLayoutSchema');validateEventLayout(next);commit(next,'Layout imported. Undo is available.');}catch(err){setError(`Import failed: ${err.message}`);}e.target.value='';};
  const exportSchedule=()=>{const rows=[['Product ID','Name','Placed','Reported stock','Width m','Height m','Depth m','Dimensions']];for(const a of assets)if(quantity[a.productId])rows.push([a.productId,a.name,quantity[a.productId],a.stock??'Unknown',...a.dimensions,a.measurementStatus]);downloadBlob(rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n'),'Royal-Concours-Furniture-Schedule.csv','text/csv');};

  if(loading)return <main className="es-loading"><span className="es-eyebrow">PICO AI / SPATIAL STUDIO</span><div className="es-loader"/><h1>Opening Royal Bahrain Concours</h1><p>Preparing the site, furniture library, and saved layout.</p></main>;
  if(!scene)return <main className="es-loading"><span className="es-eyebrow">PICO AI / SPATIAL STUDIO</span><h1>The studio is unavailable</h1><p role="alert">{error}</p><button className="es-primary" onClick={load}>Try again</button><Link href="/admin/login">Staff sign in</Link></main>;

  return <main ref={root} className={`event-studio${full?' es-fullscreen':''}${rail?'':' es-rail-hidden'}${inspector?'':' es-inspector-hidden'}`}>
    <header className="es-header"><div className="es-heading"><Link href="/admin/pico-ai" className="es-eyebrow">PICO AI <span>/</span> SPATIAL STUDIO</Link><h1>Royal Bahrain Concours <em>2026</em></h1><p>Royal Golf Club, Bahrain <span>·</span> An editable view of every detail.</p></div><div className="es-header-actions"><span className={`es-save-state es-${saveState}`} role="status"><i/>{saveState==='saving'?'Saving…':saveState==='saved'?`Saved · v${revision}`:saveState==='error'?'Save needs attention':'Unsaved changes'}</span><button className="es-secondary" onClick={()=>{setTab('versions');setRail(true);}}><Icon name="download"/> Files & versions</button><button className="es-primary" onClick={()=>save()} disabled={saveState==='saving'}>Save layout</button></div></header>
    {error&&<div className="es-alert" role="alert"><span>{error}</span><button onClick={()=>downloadBlob(sceneRef.current,'Royal-Concours-unsaved-layout.json')}>Download my work</button><button onClick={load}>Reload latest</button></div>}
    <section className="es-workspace">{recording!==null&&<div className="es-recording-overlay" role="status"><div><i/><strong>Recording walkthrough</strong><span>{recording} / 90 seconds · 1080p</span><small>Keep this tab visible while the tour records.</small><button onClick={()=>recordingRef.current?.cancel()}>Cancel recording</button></div></div>}
      <aside className="es-rail"><div className="es-mobile-rail-heading"><span>Explore & edit</span><button aria-label="Close library" onClick={()=>setRail(false)}>×</button></div><div className="es-rail-tabs">{[['site','Site'],['furniture','Furniture'],['views','Views'],['versions','Files']].map(([id,label])=><button key={id} onClick={()=>{setTab(id);setSearch('');}} className={tab===id?'active':''}>{label}</button>)}</div>
        {['site','furniture'].includes(tab)&&<label className="es-search"><Icon name="search"/><input aria-label={tab==='site'?'Search site locations':'Search furniture'} placeholder={tab==='site'?'Find a tent or location…':'Find a chair, table, sofa…'} value={search} onChange={e=>setSearch(e.target.value)}/></label>}
        <div className="es-rail-scroll">
          {tab==='site'&&<><div className="es-section-label"><span>THE MASTERPLAN</span><span>{tents.length} tents</span></div><button className="es-location es-overview" onClick={()=>engine.current?.home()}><Icon name="map"/><span>Entire event<small>Return to the site overview</small></span><b>↗</b></button><div className="es-section-label">TENTS & LOCATIONS</div>{siteItems.map(o=><button key={o.id} className={`es-location${selected===o.id?' selected':''}`} onClick={()=>chooseObject(o.id,true)}><span className={`es-kind es-kind-${o.kind}`}><Icon name={o.kind==='tent'?'roof':'pin'} size={16}/></span><span>{o.name}<small>{metres(o.dimensions[0])} × {metres(o.dimensions[2])} m <span>· {o.kind}</span></small></span><b>↗</b></button>)}{!siteItems.length&&<p className="es-empty">No matching locations.</p>}<div className="es-source-note"><strong>Drawn to the source plan</strong><p>Footprints follow the calibrated PDF. Heights, ground levels, and unmeasured details remain editable estimates.</p></div></>}
          {tab==='furniture'&&<><div className="es-filters">{['all','furniture','accessories'].map(f=><button key={f} className={filter===f?'active':''} onClick={()=>setFilter(f)}>{f==='all'?'All items':f}</button>)}</div><div className="es-section-label"><span>PICO RENTAL LIBRARY</span><span>{matchingAssets.length} items</span></div>{overstock.length>0&&<p className="es-stock-warning">{overstock.length} item{overstock.length>1?'s':''} exceed reported stock. Quantities are proposals, not reservations.</p>}<div className="es-catalogue">{matchingAssets.map(a=><article key={a.id} className="es-product"><button className="es-product-photo" aria-label={`Inspect ${a.name}`} onClick={()=>{setAssetDetail(a);setInspector(true);if(window.innerWidth<760)setRail(false);}}><img src={a.photoUrl} alt={a.name} loading="lazy"/><span>{quantity[a.productId]||0} placed</span></button><div><h3>{a.name}</h3><p>{metres(a.dimensions[0])} × {metres(a.dimensions[2])} × {metres(a.dimensions[1])} m</p><div className="es-product-bottom"><span className={a.measurementStatus==='catalogue'?'es-measured':'es-estimated'}>{a.measurementStatus==='catalogue'?'Dimensions listed':a.measurementStatus==='partial'?'Partly estimated':'Estimated size'}</span><button aria-label={`Add ${a.name}`} title={`Add ${a.name}`} onClick={()=>addFurniture(a)}><Icon name="plus" size={16}/></button></div></div></article>)}</div></>}
          {tab==='views'&&<><div className="es-section-label">CAMERA BOOKMARKS</div>{scene.views.map((v,i)=><button className="es-view-card" key={v.id} onClick={()=>engine.current?.goTo(v)}><span>{String(i+1).padStart(2,'0')}</span><div>{v.name}<small>Open saved viewpoint</small></div><Icon name="camera"/></button>)}<div className="es-form-card"><label htmlFor="view-name">Save this viewpoint</label><input id="view-name" placeholder="e.g. Owners’ lounge entrance" value={viewName} onChange={e=>setViewName(e.target.value)} maxLength={80}/><button className="es-secondary" onClick={()=>{const v=engine.current?.getView(viewName.trim()||`View ${scene.views.length+1}`);if(v){commit(d=>{d.views.push(v);return d;},'Viewpoint saved.');setViewName('');}}}><Icon name="plus"/> Save current view</button></div><button className="es-primary es-wide" onClick={()=>tour?engine.current?.stopTour():engine.current?.playTour()}><Icon name={tour?'stop':'play'}/>{tour?'Stop tour':'Play guided tour'}</button></>}
          {tab==='versions'&&<><div className="es-form-card"><label htmlFor="version-name">Name a layout version</label><input id="version-name" placeholder="e.g. Hospitality option 02" value={versionName} onChange={e=>setVersionName(e.target.value)} maxLength={120}/><button className="es-primary" onClick={()=>save(versionName.trim()||`Layout ${revision+1}`)} disabled={saving.current}>Save version</button></div><div className="es-section-label">DOWNLOAD & REUSE</div><button className="es-file" onClick={recordTour} disabled={recording!==null}><Icon name="play"/><span>Record walkthrough<small>90 seconds · 1080p WebM · keep this tab open</small></span></button><button className="es-file" onClick={()=>downloadBlob(sceneRef.current,'Royal-Concours-layout.json')}><Icon name="download"/><span>Editable layout<small>JSON · opens in this studio or Blender importer</small></span></button><button className="es-file" onClick={exportSchedule}><Icon name="download"/><span>Furniture schedule<small>CSV · placed quantities and dimensions</small></span></button><button className="es-file" onClick={capture}><Icon name="camera"/><span>Current view<small>PNG image</small></span></button>{downloads.map(f=><a className="es-file" key={f.name} href={f.url} download><Icon name="download"/><span>{f.label||f.name}<small>{f.kind||'Project file'}{f.bytes?` · ${(f.bytes/1024/1024).toFixed(1)} MB`:''}</small></span></a>)}<button className="es-secondary es-wide" onClick={()=>importFile.current?.click()}>Import layout JSON</button><input ref={importFile} hidden type="file" accept="application/json,.json" onChange={importLayout}/><VenueReferences references={scene.site.references}/><div className="es-section-label">VERSION HISTORY</div>{history.map(h=><div className="es-version" key={h.revision}><span><strong>{h.name||`Autosave ${h.revision}`}</strong><small>v{h.revision} · {new Date(h.createdAt).toLocaleString()}</small></span><button onClick={()=>restore(h.revision)} disabled={h.revision===revision}>Restore</button></div>)}</>}
        </div>
      </aside>
      <div className="es-canvas-area"><div className="es-view-toolbar"><div><Tool label="Show or hide library" icon="layers" active={rail} onClick={()=>setRail(!rail)}/><div className="es-segment">{[['orbit','orbit','Orbit'],['top','map','Plan'],['walk','walk','Walk']].map(([id,icon,label])=><Tool key={id} label={`${label} view`} icon={icon} active={mode===id} onClick={()=>navigate(id)}>{label}</Tool>)}</div></div><div><Tool label="Edit layout" icon="edit" active={editing} onClick={()=>{setEditing(!editing);if(mode==='walk')navigate('orbit');}}/><Tool label="Undo" icon="undo" disabled={!undoStack.length} onClick={undo}/><Tool label="Redo" icon="redo" disabled={!redoStack.length} onClick={redo}/><Tool label="Fullscreen" icon="expand" onClick={()=>document.fullscreenElement?document.exitFullscreen():root.current?.requestFullscreen?.()}/></div></div>
        <div className="es-viewport" ref={viewport}/>
        <div className="es-view-title"><span>ROYAL BAHRAIN CONCOURS</span><p>{mode==='walk'?'A guest’s point of view':mode==='top'?'The event, in plan':'A place for extraordinary encounters'}</p></div>
        <div className="es-north"><span>N*</span><svg viewBox="0 0 24 32"><path d="M12 0 22 28 12 22 2 28Z" fill="currentColor"/></svg><small>Plan orientation</small></div>
        {assetLoad.loading>0&&<div className="es-model-loading"><i/> Loading furniture · {assetLoad.loading}</div>}
        {assetLoad.failed>0&&<div className="es-model-warning">{assetLoad.failed} furniture model{assetLoad.failed>1?'s':''} unavailable · outlined dimensions shown</div>}
        {editing&&<div className="es-edit-tools"><Tool label="Move selected object" icon="move" active={transform==='translate'} onClick={()=>setTransform('translate')}>Move</Tool><Tool label="Rotate selected object" icon="rotate" active={transform==='rotate'} onClick={()=>setTransform('rotate')}>Rotate</Tool><button className={snap?'active':''} onClick={()=>setSnap(!snap)} aria-pressed={snap}>Snap {snap?'on':'off'}</button><span>{object?.locked?'Object locked':object?'Drag the handles or enter measurements':'Select an object to begin'}</span></div>}
        <div className="es-bottom-tools"><div><Tool label="Show roofs" icon="roof" active={roofs} onClick={()=>setRoofs(!roofs)}/><Tool label="Show walls" icon="layers" active={walls} onClick={()=>setWalls(!walls)}/><Tool label="Show labels" icon="eye" active={labels} onClick={()=>setLabels(!labels)}/><Tool label="Evening light" icon="sun" active={evening} onClick={()=>setEvening(!evening)}/></div><div><Tool label={tour?'Stop guided tour':'Play guided tour'} icon={tour?'stop':'play'} active={tour} onClick={()=>tour?engine.current?.stopTour():engine.current?.playTour()}/><Tool label="Download screenshot" icon="camera" onClick={capture}/><button className="es-home" onClick={()=>engine.current?.home()}>Reset view ↗</button></div></div>
        <MiniMap scene={scene} camera={stats.camera} selected={object} onVisit={position=>engine.current?.goTo({position:[position[0]+15,25,position[2]+25],target:position})}/>
        {mode==='walk'&&<div className="es-walk-controls"><p>Drag to look · WASD to walk · Shift to move faster</p><div>{[['↑',0,-1],['←',-1,0],['↓',0,1],['→',1,0]].map(([label,x,y])=><button key={label} aria-label={`Walk ${label}`} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);if(engine.current)engine.current.joystick=[x,y];}} onPointerUp={()=>{if(engine.current)engine.current.joystick=[0,0];}} onPointerCancel={()=>{if(engine.current)engine.current.joystick=[0,0];}}>{label}</button>)}</div></div>}
      </div>
      <aside className="es-inspector"><div className="es-inspector-heading"><span>{assetDetail?'CATALOGUE ITEM':object?'SELECTED OBJECT':'YOUR EVENT, IN DETAIL'}</span><button aria-label="Hide inspector" onClick={()=>setInspector(false)}>×</button></div>
        <div className="es-inspector-scroll">{assetDetail?<><img className="es-detail-photo" src={assetDetail.photoUrl} alt={assetDetail.name}/><h2>{assetDetail.name}</h2><p className="es-muted">{assetDetail.description}</p><p className="es-dimension-display">{assetDetail.dimensions.map(metres).join(' × ')} <small>m · W × H × D</small></p><div className="es-accuracy"><strong>{assetDetail.measurementStatus==='catalogue'?'Catalogue dimensions':'Editable size estimate'}</strong><p>{assetDetail.notes}</p><small>{assetDetail.sourceDimensions}</small></div><button className="es-primary es-wide" onClick={()=>addFurniture(assetDetail)}>Place in scene</button>{object?.kind==='furniture'&&<button className="es-secondary es-wide" onClick={()=>addFurniture(assetDetail,true)}>Replace selected furniture</button>}<p className="es-muted">{quantity[assetDetail.productId]||0} placed · {assetDetail.stock??'Unknown'} reported in stock</p></>:object?<><span className="es-object-category">{object.kind} {object.zoneId&&`/ ${object.zoneId}`}</span><h2>{object.name}</h2><div className="es-object-actions"><button onClick={()=>engine.current?.focus(object.id)}><Icon name="pin"/> Focus</button>{object.kind==='tent'&&<button onClick={()=>engine.current?.focus(object.id,true)}><Icon name="walk"/> Enter tent</button>}{(object.kind==='tent'||object.metadata?.parentTentId)&&<button onClick={()=>engine.current?.planTent(object.kind==='tent'?object.id:object.metadata.parentTentId)}><Icon name="map"/> Plan interior</button>}</div><div className="es-accuracy"><strong>{object.metadata?.measurementStatus==='plan-derived'?'Footprint from the site plan':'Editable / proposed geometry'}</strong><p>{object.metadata?.notes||'Vertical dimensions and reconstructed appearance are provisional.'}</p></div><label className="es-text-field">Name<input value={object.name} onChange={e=>updateObject(object.id,{name:e.target.value.slice(0,160)||object.kind})} disabled={object.locked}/></label><div className="es-section-label">DIMENSIONS</div><div className="es-fields">{['Width','Height','Depth'].map((label,i)=><NumberField key={label} label={label} value={object.dimensions[i]} disabled={object.locked} min={.01} onChange={v=>{const dimensions=[...object.dimensions];dimensions[i]=v;updateObject(object.id,{dimensions});}}/>)}</div><div className="es-section-label">POSITION</div><div className="es-fields">{['X','Elevation','Z'].map((label,i)=><NumberField key={label} label={label} value={object.position[i]} disabled={object.locked} onChange={v=>{if(object.locked)return;const position=[...object.position];position[i]=v;updateObject(object.id,{position});}}/>)}</div><NumberField label="Rotation" disabled={object.locked} value={+(object.rotation[1]*180/Math.PI).toFixed(2)} unit="°" step={15} onChange={v=>{if(!object.locked)updateObject(object.id,{rotation:[0,v*Math.PI/180,0]});}}/><label className="es-text-field">Move with group<input placeholder="Optional group name" value={object.metadata?.groupId||''} disabled={object.locked} onChange={e=>updateObject(object.id,{metadata:{...object.metadata,groupId:e.target.value.slice(0,80)}})}/></label><div className="es-material-row"><label>Surface colour<input aria-label="Object surface colour" type="color" value={object.color||'#e9e4d8'} onChange={e=>{if(!object.locked)updateObject(object.id,{color:e.target.value});}}/></label><button className={object.locked?'active':''} onClick={()=>updateObject(object.id,{locked:!object.locked})}><Icon name="lock"/>{object.locked?'Locked':'Lock'}</button></div>{object.kind==='tent'&&<label className="es-text-field">Roof profile<select value={object.roofType||'pagoda'} onChange={e=>{if(!object.locked)updateObject(object.id,{roofType:e.target.value});}}><option value="pagoda">Pagoda</option><option value="gable">Gable marquee</option><option value="hexagon">Hexagonal pavilion</option><option value="flat">Flat canopy</option></select></label>}{selectedAsset&&<><button className="es-catalogue-reference" onClick={()=>setAssetDetail(selectedAsset)}><img src={selectedAsset.photoUrl} alt=""/><span>Catalogue reference<small>{selectedAsset.name}</small></span></button><button className="es-secondary es-wide" onClick={()=>{setTab('furniture');setRail(true);announce('Choose a catalogue item, then use Replace selected furniture.');}}>Choose replacement</button></>}<div className="es-object-actions es-danger-actions"><button disabled={object.locked} onClick={duplicate}><Icon name="copy"/> Duplicate</button><button disabled={object.locked} onClick={remove}><Icon name="trash"/> Remove</button></div></>:<><div className="es-intro-mark"><Icon name="roof" size={46}/></div><h2>A complete view.<br/><em>One editable place.</em></h2><p className="es-muted">Select any tent to inspect its dimensions, step inside, or build a new arrangement.</p><dl className="es-overview-stats"><div><dt>Tents & pavilions</dt><dd>{tents.length}</dd></div><div><dt>Catalogue pieces</dt><dd>{assets.length}</dd></div><div><dt>Furniture placed</dt><dd>{scene.objects.filter(o=>o.kind==='furniture').length}</dd></div></dl><div className="es-accuracy"><strong>Source-faithful, openly editable</strong><p>The plan’s six dimensions establish the horizontal scale. Missing heights and furniture measurements are labelled estimates.</p></div><button className="es-secondary es-wide" onClick={()=>{setTab('furniture');setRail(true);}}>Explore the furniture library ↗</button><div className="es-shortcuts"><p><b>Orbit</b> Drag to rotate · scroll to zoom</p><p><b>Plan</b> Top-down layout and positioning</p><p><b>Walk</b> WASD · drag to look</p><p><b>Edit</b> Select · move · replace</p></div></>}</div>
      </aside>
    </section>
    <footer className="es-statusbar"><span className="es-status-dot"/><span>{notice||'Select a location to explore. All dimensions are in metres.'}</span><span className="es-performance">{stats.fps?`${stats.fps} FPS`:'Starting renderer'} <i>·</i> {scene.objects.length.toLocaleString()} objects <i>·</i> Draft layout</span>{!inspector&&<button onClick={()=>setInspector(true)}>Inspector ↗</button>}</footer>
  </main>;
}

function MiniMap({scene,camera,selected,onVisit}) {
  const b=scene.site.bounds,w=b.maxX-b.minX,d=b.maxZ-b.minZ;
  return <div className="es-minimap"><span>SITE OVERVIEW</span><svg viewBox={`0 0 ${w} ${d}`} role="img" aria-label="Event minimap" onClick={e=>{const rect=e.currentTarget.getBoundingClientRect();onVisit([b.minX+(e.clientX-rect.left)/rect.width*w,0,b.minZ+(e.clientY-rect.top)/rect.height*d]);}}><rect width={w} height={d} fill="#a1aa83"/>{scene.objects.filter(o=>['water','path','ground'].includes(o.kind)&&o.points?.length).map(o=><polygon key={o.id} points={o.points.map(p=>`${p[0]+o.position[0]-b.minX},${p[1]+o.position[2]-b.minZ}`).join(' ')} fill={o.kind==='water'?'#619699':o.kind==='path'?'#dfd9c8':'#87965e'}/>)}{scene.objects.filter(o=>['tent','building'].includes(o.kind)).map(o=><rect key={o.id} x={o.position[0]-b.minX-o.dimensions[0]/2} y={o.position[2]-b.minZ-o.dimensions[2]/2} width={o.dimensions[0]} height={o.dimensions[2]} fill={o.id===selected?.id?'#f2b555':'#fcf7e8'} transform={`rotate(${-o.rotation[1]*180/Math.PI} ${o.position[0]-b.minX} ${o.position[2]-b.minZ})`}/>)}{camera&&<circle cx={camera[0]-b.minX} cy={camera[2]-b.minZ} r={Math.max(3,w/90)} fill="#113f37" stroke="#fff" strokeWidth="2"/>}</svg><small>Click to visit an area</small></div>;
}
