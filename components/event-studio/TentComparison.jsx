'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { applyTentOption, TENT_COMPARISONS, TENT_OPTIONS, tentLayoutIssues, tentQuote } from '@/lib/eventStudioTents';
import { tentFootprint } from '@/lib/eventStudioLayout';

const ASSETS='/api/pico-ai/admin/event-layouts/royal-bahrain-concours-2026/assets/';
function Footprint({object}) {
  const points=tentFootprint(object).map(p=>p.join(',')).join(' '),[w,,d]=object.dimensions;
  return <svg viewBox="-9 -8 18 18" role="img" aria-label={`${w} by ${d} metre ${object.metadata.supplierTent==='mq40'?'hexagonal':'rectangular'} footprint`}>
    <polygon points={points} fill="#e7eddf" stroke="#42604e" strokeWidth=".09"/>
    {object.metadata.frontGlass&&<line x1={-w/2} y1={d/2} x2={w/2} y2={d/2} stroke="#aa7c37" strokeWidth=".24"/>}
    <path d={`M ${-w/2} 7 H ${w/2} M ${-w/2} 6.7 V 7.3 M ${w/2} 6.7 V 7.3 M 7 ${-d/2} V ${d/2} M 6.7 ${-d/2} H 7.3 M 6.7 ${d/2} H 7.3`} fill="none" stroke="#9da998" strokeWidth=".07"/>
    <text x="0" y="8.4" textAnchor="middle">{w} m</text>
    <text transform="translate(7.8 0) rotate(90)" textAnchor="middle">{d} m</text>
    <text x="0" y=".35" textAnchor="middle">{object.metadata.supplierTent==='mq40'?'95 m²*':'72 m²'}</text>
  </svg>;
}

export default function TentComparison({object,scene,onApply}) {
  const [open,setOpen]=useState(false),dialog=useRef(null),title=useId(),quote=tentQuote(object);
  const variants=useMemo(()=>TENT_COMPARISONS.map(v=>{const candidate=applyTentOption(object,v.optionId,v.glass);return {...v,object:candidate,issues:tentLayoutIssues(scene,candidate)};}),[object,scene]);
  useEffect(()=>{if(open)dialog.current?.showModal();},[open]);
  const close=()=>{dialog.current?.close();setOpen(false);};
  return <>
    <button className="es-secondary es-wide" onClick={()=>setOpen(true)}>Compare all three configurations ↗</button>
    {open&&createPortal(<dialog ref={dialog} className="es-tent-compare" aria-labelledby={title} onClose={()=>setOpen(false)}>
      <header className="es-compare-heading"><div><span>CAR CLUB LOUNGES</span><h2 id={title}>A shape for your lounge.</h2><p>Compare for {object.name}. All views use the same scale.</p></div><button className="es-compare-close" aria-label="Close tent comparison" autoFocus onClick={close}>×</button></header>
      <div className="es-compare-grid">{variants.map(v=>{
        const current=quote?.standard&&quote.option.id===v.optionId&&Boolean(quote.glass)===v.glass,option=TENT_OPTIONS[v.optionId];
        return <article key={v.key} className={`es-compare-option${current?' es-current-option':''}`} aria-label={v.title}>
          <div className="es-compare-image"><img src={`${ASSETS}${v.preview}`} alt={`${v.title} reconstructed 3D tent, without furniture`}/><span>{v.eyebrow}</span></div>
          <div className="es-compare-card-body"><h3>{v.title}</h3><p className="es-compare-size">{v.optionId==='mq40'?'10.5 × 12 m · six sides':'12 m front × 6 m deep'}</p>
            <div className="es-compare-plan"><Footprint object={v.object}/><div><strong>{v.optionId==='mq40'?'6.8 m peak':'Three roof peaks'}</strong><p>{v.optionId==='mq40'?'Height from supplier sheet.':'5.5 m height is estimated.'}</p><p>{v.glass?'12 m glass front; back and sides open.':'Open around the perimeter.'}</p></div></div>
            <p className="es-compare-price">BHD {v.price.toLocaleString('en')} <span>/ tent</span></p>
            {v.glass&&<p className="es-compare-cost-note">2,400 tent + 1,800 front glazing</p>}
            <div className="es-compare-fit" aria-live="polite">{v.issues.overlaps.length||v.issues.outside?<><strong>Arrangement needs checking</strong>{v.issues.overlaps.length>0&&<p>Overlaps: {v.issues.overlaps.join(', ')}.</p>}{v.issues.outside>0&&<p>{v.issues.outside} furniture pieces extend outside this footprint.</p>}</>:<p>No tent overlaps or furniture outside this footprint detected.</p>}</div>
            <button className="es-compare-apply" disabled={object.locked||current} onClick={()=>{if(!object.locked){onApply(v.optionId,v.glass);close();}}}>{current?'Current configuration':`Use ${v.title}`}</button>
            <a className="es-compare-reference" href={`${ASSETS}${option.photo}`} target="_blank" rel="noopener noreferrer">View supplier reference ↗</a>
          </div>
        </article>;
      })}</div>
      <footer className="es-compare-footer"><p><strong>Furniture and décor excluded.</strong> The shown deck is proposed and excluded from these prices. VAT and rental period were not specified. Roof curves and frame details are visual estimates. *MQ40 quoted area is 95 m²; nominal polygon area is 94.5 m².</p><p>Applying an option keeps your tent position and furniture placements. Undo is available.{object.locked?' Unlock this tent to apply an option.':''}</p><a href={`${ASSETS}supplier/Lounge-Tent-Comparison.pdf`} download>Download comparison PDF ↓</a></footer>
    </dialog>,document.body)}
  </>;
}
