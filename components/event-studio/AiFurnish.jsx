import { useEffect, useMemo, useState } from 'react';
import { tentFootprint, occupantsOf } from '@/lib/eventStudioLayout';
import { furnitureRole, tableShape, polygonArea, entranceEdge } from '@/lib/eventStudioFurnish';

const API = '/api/pico-ai/admin/event-layouts/royal-bahrain-concours-2026/furnish';
const IDEAS = {
  small: ['Client meetings with a reception desk', 'Lounge corner for two or three', 'Standing display with a high table'],
  large: ['VIP lounge with a coffee bar', 'Majlis for 20 guests', 'Gala dinner, round tables', 'Cocktail reception', 'Presentation with theatre seating'],
};
const ROLE_FILL = { table: '#c9ab6c', 'high-table': '#c9ab6c', 'coffee-table': '#d8c393', 'side-table': '#d8c393', bar: '#de2826', console: '#de2826' };

/** A scaled top view of an option on this tent's real outline, entrance at the bottom. */
function PlanPreview({ footprint, placements, byId, label }) {
  const xs = footprint.map(p => p[0]), zs = footprint.map(p => p[1]), pad = .5;
  const minX = Math.min(...xs) - pad, minZ = Math.min(...zs) - pad, w = Math.max(...xs) - Math.min(...xs) + 2 * pad, d = Math.max(...zs) - Math.min(...zs) + 2 * pad;
  const door = entranceEdge(footprint);
  return <svg className="es-ai-plan" viewBox={`${minX} ${minZ} ${w} ${d}`} role="img" aria-label={label}>
    <polygon points={footprint.map(p => p.join(',')).join(' ')} fill="#fffdf6" stroke="#9fae8f" strokeWidth={Math.max(w, d) / 160}/>
    <line x1={door.a[0]} y1={door.a[1]} x2={door.b[0]} y2={door.b[1]} stroke="#de2826" strokeWidth={Math.max(w, d) / 70} strokeDasharray={`${Math.max(w, d) / 40} ${Math.max(w, d) / 60}`}/>
    {placements.filter(p => !p.y).map((p, i) => {
      const asset = byId.get(p.productId); if (!asset) return null;
      const [pw, , pd] = asset.dimensions, role = furnitureRole(asset), round = ['table', 'high-table'].includes(role) && tableShape(asset) === 'round';
      return <rect key={i} x={-pw / 2} y={-pd / 2} width={pw} height={pd} rx={round ? pw / 2 : Math.min(pw, pd) * .12}
        fill={ROLE_FILL[role] || '#2f5a47'} transform={`translate(${p.x} ${p.z}) rotate(${-p.angle * 180 / Math.PI})`}/>;
    })}
  </svg>;
}

export default function AiFurnish({ tent, scene, assets, onApply }) {
  const footprint = useMemo(() => tentFootprint(tent), [tent]);
  const byId = useMemo(() => new Map(assets.map(a => [String(a.productId), a])), [assets]);
  const area = polygonArea(footprint), small = area < 40;
  const here = scene.objects.filter(o => o.kind === 'furniture' && o.metadata?.parentTentId === tent.id);
  const [brief, setBrief] = useState(''), [keep, setKeep] = useState(false), [state, setState] = useState({ status: 'idle' }), [seconds, setSeconds] = useState(0);
  const [applied, setApplied] = useState(null);
  useEffect(() => { setState({ status: 'idle' }); setApplied(null); }, [tent.id]);
  useEffect(() => {
    if (state.status !== 'loading') return undefined;
    setSeconds(0); const timer = setInterval(() => setSeconds(s => s + 1), 1000); return () => clearInterval(timer);
  }, [state.status]);

  const ask = async (text = brief) => {
    setBrief(text); setApplied(null); setState({ status: 'loading' });
    // Pieces that stay are planned around; locked pieces always stay. Everything else in this tent is
    // replaced, so it does not count against stock.
    const staying = here.filter(o => keep || o.locked).map(o => o.id);
    const usage = {};
    for (const o of scene.objects) if (o.kind === 'furniture' && (o.metadata?.parentTentId !== tent.id || staying.includes(o.id))) usage[o.productId] = (usage[o.productId] || 0) + 1;
    const kept = occupantsOf(scene.objects, tent).filter(o => staying.includes(o.id)).map(({ x, z, width, depth, angle }) => ({ x, z, width, depth, angle }));
    try {
      const response = await fetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tent: { id: tent.id, name: tent.name, kind: 'tent', dimensions: tent.dimensions, roofType: tent.roofType, ...(tent.points ? { points: tent.points } : {}) }, brief: text, kept, usage }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The furnishing service did not respond. Please try again.');
      setState({ status: 'done', ...data, keep });
    } catch (error) { setState({ status: 'error', message: error.message }); }
  };

  return <section className="es-form-card es-ai-furnish" aria-label="Furnish with AI">
    <div className="es-ai-heading"><strong>Furnish with AI</strong><span>{area.toFixed(0)} m² · size stays as it is</span></div>
    <p className="es-muted">Describe the setup. You get three layouts made only from Pico Stock items in stock, set out on this floor with clear aisles and entrance.</p>
    <label className="es-text-field">What is this tent for?
      <textarea rows={2} maxLength={600} value={brief} placeholder={small ? 'e.g. Client meetings with a reception desk' : 'e.g. VIP lounge for 30 guests with a coffee bar'}
        onChange={e => setBrief(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask(); }}/>
    </label>
    <div className="es-filters es-ai-ideas">{IDEAS[small ? 'small' : 'large'].map(idea => <button key={idea} type="button" onClick={() => ask(idea)} disabled={state.status === 'loading'}>{idea}</button>)}</div>
    {here.length > 0 && <label className="es-ai-keep"><input type="checkbox" checked={keep} onChange={e => setKeep(e.target.checked)}/> Keep the {here.length} pieces already here and add around them</label>}
    <button className="es-primary es-wide" onClick={() => ask()} disabled={state.status === 'loading' || tent.locked}>{state.status === 'loading' ? `Planning layouts… ${seconds}s` : 'Suggest three layouts'}</button>
    {tent.locked && <p className="es-muted">Unlock this tent to furnish it.</p>}
    {state.status === 'loading' && <p className="es-muted" aria-live="polite">Choosing pieces and fitting them to the floor. This usually takes 15 to 30 seconds.</p>}
    {state.status === 'error' && <p className="es-stock-warning" role="alert">{state.message}</p>}
    {state.status === 'done' && <>
      <p className="es-muted" aria-live="polite">{state.source === 'claude' ? 'Planned by Claude, then fitted and checked against the floor and stock.' : 'Planned by the built-in planner, then fitted and checked against the floor and stock.'}{state.notice ? ` ${state.notice}` : ''}</p>
      {!state.options?.length && <p className="es-stock-warning">Nothing fits this floor with clear aisles. Try a smaller setup.</p>}
      {state.options?.map(option => {
        const pieces = option.placements.length, top = [...option.counts].sort((a, b) => b.count - a.count).slice(0, 4);
        return <article key={option.id} className={`es-ai-option${applied === option.id ? ' applied' : ''}`}>
          <PlanPreview footprint={footprint} placements={option.placements} byId={byId} label={`${option.title}: top view of ${pieces} pieces`}/>
          <div>
            <h3>{option.title}</h3>
            <p>{option.summary}</p>
            <p className="es-ai-stats"><b>{option.seats}</b> seats · <b>{pieces}</b> pieces</p>
            <ul>{top.map(item => <li key={item.productId}>{item.count} × {item.name}</li>)}{option.counts.length > top.length && <li>and {option.counts.length - top.length} more items</li>}</ul>
            {option.notes?.length > 0 && <p className="es-ai-note">{option.notes.slice(0, 2).join(' ')}</p>}
            <button className={applied === option.id ? 'es-secondary es-wide' : 'es-primary es-wide'} disabled={tent.locked || (state.keep && applied && applied !== option.id)}
              onClick={() => { onApply(tent.id, option, !state.keep); setApplied(option.id); }}>{applied === option.id ? 'Applied · Undo to go back' : 'Use this layout'}</button>
          </div>
        </article>;
      })}
    </>}
  </section>;
}
