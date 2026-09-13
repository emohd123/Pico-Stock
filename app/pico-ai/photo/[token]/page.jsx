'use client';
import {useEffect,useRef,useState} from 'react';
import '../photo.css';
import {MotionEffects,MagicRings} from '../../../../components/picoAi/reactbits/MotionEffects';
import '../../../../components/picoAi/reactbits/polish.css';
export default function Photo({params}){
 const [data,setData]=useState(),[error,setError]=useState(''),[emailError,setEmailError]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0),[lang,setLang]=useState('ar');
 const lock=useRef(false),alive=useRef(true),emailController=useRef(null);
 const tr=(ar,en)=>lang==='ar'?ar:en;
 const base=`/api/pico-ai/photo/${encodeURIComponent(params.token)}`;
 useEffect(()=>{setLang(localStorage.getItem('pico.photo.language')==='en'?'en':'ar');alive.current=true;return()=>{alive.current=false;emailController.current?.abort();};},[]);
 useEffect(()=>{const controller=new AbortController();setData(undefined);setError('');setEmailError('');setSent(false);
 fetch(base,{signal:controller.signal}).then(async r=>{const body=await r.json();if(!r.ok)throw Error(r.status===410?'expired':'unavailable');setData(body);}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[base,retry]);
 return <main className="moment-photo" lang={lang} dir={lang==='ar'?'rtl':'ltr'}><MotionEffects/><div className="moment-sheet">
 <div className="moment-topbar"><span className="moment-brand"><i className="moment-brand-icon" aria-hidden="true">✦</i>YOUR SAUDI MOMENT</span><button className="moment-language" onClick={()=>{const next=lang==='ar'?'en':'ar';setLang(next);localStorage.setItem('pico.photo.language',next);}}>{lang==='ar'?'EN':'عربي'}</button></div>
 <header className="moment-heading"><h1>{tr('ذكراك بين يديك','Your moment to keep')}</h1><p>{tr('ذكرى جميلة من اليوم الوطني السعودي','A beautiful memory of Saudi National Day')}</p></header>
 {error&&<div className="moment-alert" role="alert"><p>{error==='expired'?tr('انتهت صلاحية رابط الصورة','This photo link has expired'):tr('تعذر تحميل الصورة. يرجى المحاولة مرة أخرى.','Your photo is unavailable. Please try again.')}</p><button onClick={()=>setRetry(n=>n+1)}>{tr('حاول مرة أخرى','Try again')}</button></div>}
 {!data&&!error&&<div className="moment-loading" role="status"><MagicRings/><b aria-hidden="true">✦</b>{tr('جارٍ فتح صورتك…','Opening your photo…')}</div>}
 {data&&<>{data.isSample&&<p className="moment-demo">{tr('معاينة تجريبية — لم يتم تعديل الملابس','Demo preview — clothing not edited')}</p>}
 <figure className="moment-print rb-glare"><img src={data.image} alt={tr('صورتك بروح السعودية','Your Saudi Moment portrait')} onError={()=>{setData(undefined);setError('unavailable');}}/></figure>
 <a className="moment-download" href={`${base}/download`}><span aria-hidden="true">↓</span><span>{tr('تحميل الصورة','Download photo')}</span></a>
 {data.expiresAt&&<p className="moment-expiry">{tr('رابط خاص، صالح حتى','Private link, available until')}<br/><time dateTime={data.expiresAt}>{new Date(data.expiresAt).toLocaleString(lang==='ar'?'ar-BH':'en-GB')}</time></p>}
 {data.email&&!sent&&<form className="moment-email" onSubmit={async e=>{e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setEmailError('');const controller=new AbortController();emailController.current=controller;const timeout=setTimeout(()=>controller.abort(),25000);const form=new FormData(e.currentTarget);try{const r=await fetch(`${base}/email`,{signal:controller.signal,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:form.get('email'),accepted:form.get('accepted')==='on'})});if(r.status===410){if(alive.current){setData(undefined);setError('expired');}return;}if(!r.ok)throw Error(r.status===429?'rate':'email');if(alive.current)setSent(true);}catch(e){if(alive.current)setEmailError(e.message==='rate'?'rate':'email');}finally{clearTimeout(timeout);lock.current=false;if(alive.current)setBusy(false);}}}>
 <h2>{tr('إرسال بالبريد الإلكتروني','Email my photo')}</h2><label>{tr('البريد الإلكتروني','Email address')}<input name="email" dir="ltr" type="email" required maxLength={254} autoComplete="email" placeholder="you@example.com"/></label><label className="moment-consent"><input name="accepted" type="checkbox" required/>{tr('أطلب إرسال رابط صورتي إلى هذا البريد','I request delivery to this email address.')}</label><p className="moment-email-error" role="alert">{emailError ? emailError==='rate'?tr('طلبات كثيرة. انتظر قليلاً ثم حاول مجدداً.','Too many requests. Please wait a moment and retry.'):tr('تعذر إرسال البريد. حاول مجدداً أو احفظ الصورة أعلاه.','Email could not be sent. Retry or save your photo above.') : ''}</p><button disabled={busy}>{busy?tr('جارٍ الإرسال…','Sending…'):tr('إرسال','Send')}</button></form>}
 {sent&&<div className="moment-success" role="status"><span aria-hidden="true">✓</span><h2>{tr('تم إرسال رابط صورتك','Your photo link has been emailed')}</h2></div>}
 </>}
 <footer className="moment-footer">{tr('اليوم الوطني السعودي','SAUDI NATIONAL DAY')}</footer>
 </div></main>;
}
