'use client';
import { useEffect, useRef, useState } from 'react';
import { NAME_ART_BACKGROUNDS, NAME_ART_DEFAULTS, cleanGuestName } from '@/lib/nameArt/config';
import NamePoster from './NamePoster';
import styles from './name-art.module.css';
const API='/api/name-art';
export default function NameArtDevice({ role }) {
  const [token,setToken]=useState(''),[loaded,setLoaded]=useState(false),[code,setCode]=useState(''),[config,setConfig]=useState(NAME_ART_DEFAULTS);
  const [name,setName]=useState(''),[accepted,setAccepted]=useState(false),[job,setJob]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[connected,setConnected]=useState(false),[install,setInstall]=useState(null);
  // null means "follow the admin default"; once the guest picks, their choice wins until the next guest.
  const [chosen,setChosen]=useState(null), background=chosen||config.background;
  const requestId=useRef(null), wake=useRef(null), resultUntil=useRef(0);
  async function api(path,options={}) {
    const response=await fetch(API+path,{...options,cache:'no-store',headers:{'Content-Type':'application/json','x-name-art-token':token,...options.headers}});
    const data=await response.json(); if(!response.ok){if(response.status===401 && token){localStorage.removeItem(`name-art-${role}`);setToken('');} throw new Error(data.error || 'Connection unavailable');} return data;
  }
  useEffect(()=>{setToken(localStorage.getItem(`name-art-${role}`)||'');setLoaded(true);if('serviceWorker' in navigator)navigator.serviceWorker.register('/name-art/sw.js',{scope:'/name-art/'}).catch(()=>{});const capture=e=>{e.preventDefault();setInstall(e);};window.addEventListener('beforeinstallprompt',capture);return()=>window.removeEventListener('beforeinstallprompt',capture);},[role]);
  useEffect(()=>{
    if(!token)return;
    let alive=true,timer;
    const poll=async()=>{try{const data=await api(role==='screen'?'/display':'/bootstrap');if(!alive)return;setConfig(data.settings);setConnected(true);setError('');if(role==='screen'){setJob(data.job);resultUntil.current=data.job?Date.parse(data.job.startedAt)+data.job.duration*1000:0;}}catch(e){if(alive){setConnected(false);setError(e.message);if(role==='screen'&&Date.now()>resultUntil.current)setJob(null);}}finally{if(alive)timer=setTimeout(poll,role==='screen'?2000:6000);}};
    poll();return()=>{alive=false;clearTimeout(timer);};
    // The paired token is the lifetime of this connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[token,role]);
  useEffect(()=>{if(role!=='screen')return;const timer=setInterval(()=>{if(resultUntil.current && Date.now()>resultUntil.current){setJob(null);resultUntil.current=0;}},500);return()=>clearInterval(timer);},[role]);
  useEffect(()=>{const acquire=async()=>{if(token&&document.visibilityState==='visible'&&'wakeLock' in navigator)try{wake.current=await navigator.wakeLock.request('screen');}catch{}};acquire();document.addEventListener('visibilitychange',acquire);return()=>{wake.current?.release();document.removeEventListener('visibilitychange',acquire);};},[token]);
  useEffect(()=>{if(role!=='tablet'||!job)return;const timer=setTimeout(()=>{setJob(null);setName('');setAccepted(false);requestId.current=null;},90000);return()=>clearTimeout(timer);},[job,role]);
  async function pair(e){e.preventDefault();setBusy(true);setError('');try{const data=await api('/pair',{method:'POST',body:JSON.stringify({code,role})});localStorage.setItem(`name-art-${role}`,data.token);setToken(data.token);setCode('');}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function submit(e){e.preventDefault();if(!cleanGuestName(name))return;setBusy(true);setError('');requestId.current ||= crypto.randomUUID();try{const data=await api('/jobs',{method:'POST',body:JSON.stringify({name,accepted,background,requestId:requestId.current})});setJob(data);requestId.current=null;}catch(e){setError(e.message);if(e.message.includes('start a new'))requestId.current=null;}finally{setBusy(false);}}
  // Finish clears the poster screen after the configured grace period. The display timer is the fallback,
  // so a failed call must never trap the guest on this step.
  async function finish(){setBusy(true);try{if(job)await api('/finish',{method:'POST',body:JSON.stringify({id:job.id})});}catch{}finally{setJob(null);setName('');setAccepted(false);setChosen(null);requestId.current=null;setBusy(false);}}
  async function fullscreen(){try{await document.documentElement.requestFullscreen();}catch{}try{if('wakeLock'in navigator)wake.current=await navigator.wakeLock.request('screen');}catch{}}
  if(!loaded)return <main className={styles.device}><p>Opening Name Art…</p></main>;
  if(!token)return <main className={styles.device}><div className={styles.pairLayout}><NamePoster name="FAISAL"/><form className={styles.panel} onSubmit={pair}><span className={styles.eyebrow}>PICO · NAME ART</span><h1>{role==='screen'?'Connect your poster screen.':'Connect your iPad.'}</h1><p>Enter the one-use code from Name Art in the admin.</p><label>Pairing code<input inputMode="numeric" autoComplete="off" maxLength={8} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} placeholder="8-digit code" required/></label><button className={styles.primary} disabled={busy||code.length!==8}>{busy?'Connecting…':'Connect device'}</button>{error&&<p className={styles.error} role="alert">{error}</p>}{install&&<button type="button" className={styles.secondary} onClick={()=>install.prompt()}>Install on this Android screen</button>}<small>Android: Chrome menu → Install app or Add to Home screen. iPad: Safari → Share → Add to Home Screen.</small></form></div></main>;
  if(role==='screen')return <main className={styles.screen}>
    {/* Between guests the screen rests on the fixed National Day artwork alone: no name, no
        overlay, no QR. A guest's poster replaces it outright rather than sitting on top of it. */}
    <div className={styles.screenStage}>
      {job
        ? <><div className={styles.screenWash} style={{backgroundImage:`url(/name-art/${job.background}.webp)`}}/>
            <NamePoster name={job.name} background={job.background} image={`${API}/poster/${job.shareToken}/image`} motion={config.motion} drift={false}/></>
        : <div className={styles.screenIdle}/>}
    </div>
    <div className={styles.screenTools}><button onClick={fullscreen} aria-label="Full screen">⛶</button>{install&&<button onClick={()=>install.prompt()}>Install</button>}<span data-connected={connected}>{connected?'Connected':'Reconnecting…'}</span></div>
    {error&&<p className={styles.connectionError} role="status">{error}</p>}
  </main>;
  return <main className={styles.device}><header className={styles.tabletHeader}><span className={styles.eyebrow}>PICO · NAME ART</span><span className={styles.connection} data-connected={connected}>{connected?'iPad connected':'Reconnecting…'}</span></header><div className={styles.tabletGrid}>
    <div className={styles.tabletPreview}><NamePoster name={job?.name||name||'YOUR NAME'} background={job?.background||background} image={job?`${API}/poster/${job.shareToken}/image`:null}/></div>
    {job?<section className={styles.panel}><span className={styles.eyebrow}>YOUR PERSONAL KEEPSAKE</span><h1>Watch the<br/>poster screen.</h1><p>Your name has joined the display queue. Your finished poster is already ready to save.</p><img className={styles.downloadQr} src={`${API}/poster/${job.shareToken}/qr`} alt="Scan to download your poster"/><p dir="rtl">امسح الرمز لحفظ بطاقتك</p><button className={styles.primary} disabled={busy} onClick={finish}>{busy?'Finishing…':'Finish'} <span>↗</span></button><small>Your private download link is available for 48 hours.</small></section>:<form className={styles.panel} onSubmit={submit}><span className={styles.eyebrow}>A NAME. A MEMORY.</span><h1>Make this<br/>moment yours.</h1><p dir="rtl" className={styles.arabicIntro}>اكتب اسمك وشاهد بطاقتك على الشاشة</p><label>Your first name / الاسم<input value={name} onChange={e=>{setName(e.target.value);requestId.current=null;}} maxLength={30} placeholder="Faisal / فيصل" autoComplete="off" spellCheck={false} dir="auto" required/></label><span className={styles.eyebrow}>CHOOSE YOUR DESIGN · اختر التصميم</span><div className={styles.designs} role="group" aria-label="Choose your National Day design">{NAME_ART_BACKGROUNDS.map(item=><button key={item.id} type="button" aria-pressed={background===item.id} data-active={background===item.id} onClick={()=>{setChosen(item.id);requestId.current=null;}}><img src={item.src} alt="" loading="lazy"/><span>{item.name}</span></button>)}</div><label className={styles.consent}><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>Show my name on the public poster screen and create a private download link valid for 48 hours.</span></label><button className={styles.primary} disabled={busy||!accepted||!cleanGuestName(name)||!connected||config.paused}>{busy?'Creating your poster…':config.paused?'Experience paused':'Create my name art'}<span>↗</span></button>{name&&!cleanGuestName(name)&&<p className={styles.error}>Use letters, spaces, apostrophes or a hyphen, up to 30 characters.</p>}{error&&<p className={styles.error} role="alert">{error}</p>}<small>English and Arabic names welcome. No photo needed.</small></form>}
  </div></main>;
}
