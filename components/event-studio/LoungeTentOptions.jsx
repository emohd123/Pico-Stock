import { useMemo } from 'react';
import { TENT_OPTIONS, tentQuote, tentLayoutIssues } from '@/lib/eventStudioTents';
import TentComparison from './TentComparison';

const money=value=>`BHD ${value.toLocaleString('en')}`;
export default function LoungeTentOptions({object,scene,onApply}) {
  const quote=tentQuote(object),option=quote?.option;
  const issues=useMemo(()=>tentLayoutIssues(scene,object),[scene,object]);
  return <section className="es-form-card" aria-label="Supplier tent options">
    <TentComparison object={object} scene={scene} onApply={onApply}/>
    <label className="es-text-field">Lounge tent option
      <select value={option?.id||''} disabled={object.locked} onChange={e=>onApply(e.target.value,false)}>
        {!option&&<option value="" disabled>Choose supplier configuration</option>}
        {Object.values(TENT_OPTIONS).map(t=><option key={t.id} value={t.id}>{t.label} · {money(t.price)}</option>)}
      </select>
    </label>
    {option&&<>
      <p className="es-muted">{option.id==='mq40'?'10.5 × 12 m · six sides · 95 m² quoted':'12 m front × 6 m deep · 72 m² · three peaks'}</p>
      {option.id==='arabesque'&&<label className="es-text-field" style={{display:'flex',gap:10,alignItems:'center'}}>
        <input type="checkbox" aria-label="Add 12 m glass front" style={{width:18}} checked={Boolean(quote.glass)} disabled={object.locked} onChange={e=>onApply(option.id,e.target.checked)}/>
        12 m glass front · +{money(1800)}
      </label>}
      <p className="es-dimension-display" aria-live="polite">{money(quote.total)} <small>per tent{quote.glass?' including glass front':''}</small></p>
      <p className="es-muted">Furniture and décor excluded. Flooring, VAT and rental period were not specified in the quotation.</p>
      <p className="es-muted">{quote.glass?'The front is glazed; enter from the open back or sides.':'Open sides: walk in from any side.'} The deck and furniture shown are proposed additions.</p>
      {!quote.standard&&<div className="es-accuracy"><strong>Custom dimensions</strong><p>The quoted rate applies to the standard supplier size. This tent has been resized.</p><button className="es-secondary" disabled={object.locked} onClick={()=>onApply(option.id,quote.glass)}>Restore supplier dimensions</button></div>}
      {(issues.outside>0||issues.overlaps.length>0)&&<div className="es-accuracy es-ground-warning" role="status"><strong>Arrangement needs checking</strong>{issues.outside>0&&<p>{issues.outside} furniture pieces extend beyond this footprint. Their saved positions were kept; use Plan interior to rearrange them.</p>}{issues.overlaps.length>0&&<p>Footprint overlaps: {issues.overlaps.join(', ')}. Move or rotate the tent to allow clearance.</p>}</div>}
      <details><summary>Supplier reference & accuracy</summary><p className="es-muted">{option.note}</p><a href={`/api/pico-ai/admin/event-layouts/royal-bahrain-concours-2026/assets/${option.photo}`} target="_blank" rel="noopener noreferrer"><img style={{width:'100%',height:'auto',marginTop:8}} src={`/api/pico-ai/admin/event-layouts/royal-bahrain-concours-2026/assets/${option.photo}`} alt={`${option.name} supplier reference`}/></a></details>
    </>}
  </section>;
}
