'use client';
import { useState } from 'react';
import CopyLink from './CopyLink';
import DeleteMinistryButton from './DeleteMinistryButton';
import PdfModal from './PdfModal';

// Admin ministries list with: quick "View quotation" popup per ministry, and
// multi-select + "Compile selected" to merge their latest quotations into one PDF.
export default function MinistriesPanel({ ministries, origin, deleteAction }) {
    const [selected, setSelected] = useState(() => new Set());
    const [modal, setModal] = useState(null); // { url, title }
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const selectableWithQuote = ministries.filter((m) => m.quoteViewUrl);

    async function compile() {
        setError('');
        const ids = [...selected];
        if (ids.length === 0) { setError('Select at least one ministry (with a quotation) to compile.'); return; }
        setBusy(true);
        try {
            const res = await fetch('/api/quotations/compile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ministryIds: ids }) });
            if (!res.ok) throw new Error((await res.text()) || 'Compile failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (e) { setError(e.message || 'Compile failed'); } finally { setBusy(false); }
    }

    const btnLink = { borderRadius: 6, background: '#00857A', color: '#fff', padding: '4px 12px', fontSize: 12, fontWeight: 500, textDecoration: 'none', border: 'none', cursor: 'pointer' };

    return (
        <section style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottom: '1px solid #f1f5f9', padding: '12px 20px' }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: '#00857A', margin: 0 }}>Ministries ({ministries.length})</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {selected.size > 0 ? <span style={{ fontSize: 12, color: '#75787B' }}>{selected.size} selected</span> : null}
                    <button type="button" onClick={compile} disabled={busy || selected.size === 0}
                        style={{ borderRadius: 8, background: selected.size ? '#00857A' : '#cbd5e1', color: '#fff', padding: '8px 14px', fontSize: 13, fontWeight: 600, border: 'none', cursor: selected.size ? 'pointer' : 'not-allowed', opacity: busy ? 0.6 : 1 }}>
                        {busy ? 'Compiling…' : '🗎 Compile selected'}
                    </button>
                </div>
            </div>
            {error ? <p style={{ margin: 0, padding: '8px 20px', fontSize: 12, color: '#dc2626' }}>{error}</p> : null}

            {ministries.length === 0 ? (
                <p style={{ padding: '24px 20px', fontSize: 14, color: '#75787B' }}>No ministries yet. Add one above.</p>
            ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {ministries.map((m) => (
                        <li key={m.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 20px', borderTop: '1px solid #f1f5f9' }}>
                            <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} disabled={!m.quoteViewUrl}
                                title={m.quoteViewUrl ? 'Select to compile' : 'No quotation yet'} style={{ width: 16, height: 16, accentColor: '#00857A' }} />
                            <div style={{ flex: 1, minWidth: 180 }}>
                                <a href={`/quotations/ministry/${m.id}`} style={{ fontWeight: 500, color: '#00857A', textDecoration: 'none' }}>{m.name}</a>
                                {m.nameAr ? <span dir="rtl" style={{ display: 'inline-block', marginLeft: 8, fontSize: 14, color: '#75787B' }}>{m.nameAr}</span> : null}
                                {m.internalNote ? <div style={{ fontSize: 12, color: '#d97706' }}>● {m.internalNote}</div> : null}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                                {!m.quotes || m.quotes.length === 0
                                    ? <span style={{ fontSize: 12, color: '#94a3b8' }}>No quote</span>
                                    : m.quotes.length === 1
                                        ? <button type="button" onClick={() => setModal({ url: m.quotes[0].url, title: `${m.name} — ${m.quotes[0].ref}` })} style={btnLink}>View quote</button>
                                        : (
                                            <select defaultValue=""
                                                onChange={(e) => {
                                                    const pick = m.quotes.find((x) => String(x.id) === e.target.value);
                                                    e.target.value = '';
                                                    if (pick) setModal({ url: pick.url, title: `${m.name} — ${pick.ref}` });
                                                }}
                                                title="This ministry has more than one quotation — pick the one to view"
                                                style={{ border: '1px solid #99f6e4', background: '#f0fdfa', color: '#00857A', borderRadius: 6, padding: '3px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer', maxWidth: 210 }}>
                                                <option value="">View quote ({m.quotes.length})…</option>
                                                {m.quotes.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
                                            </select>
                                        )}
                                {/* the LPOs, readable from here rather than only inside Manage */}
                                {(m.lpos || []).length === 1 ? (
                                    <button type="button"
                                        onClick={() => setModal({ url: `/api/quotations/lpo-file?id=${m.lpos[0].id}`, title: `${m.name} — LPO` })}
                                        title={m.lpos[0].fileName}
                                        style={{ ...btnLink, borderColor: '#fecaca', background: '#fef2f2', color: '#dc2626' }}>
                                        View LPO
                                    </button>
                                ) : (m.lpos || []).length > 1 ? (
                                    <select defaultValue=""
                                        onChange={(e) => {
                                            const pick = m.lpos.find((x) => String(x.id) === e.target.value);
                                            e.target.value = '';
                                            if (pick) setModal({ url: `/api/quotations/lpo-file?id=${pick.id}`, title: `${m.name} — ${pick.fileName}` });
                                        }}
                                        title="This ministry has more than one LPO on file"
                                        style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', borderRadius: 6, padding: '3px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer', maxWidth: 190 }}>
                                        <option value="">View LPO ({m.lpos.length})…</option>
                                        {m.lpos.map((f) => <option key={f.id} value={f.id}>{f.fileName}</option>)}
                                    </select>
                                ) : null}
                                <CopyLink url={`${origin}/q/${m.token}`} />
                                <a href={`/quotations/ministry/${m.id}`} style={btnLink}>Manage</a>
                                <DeleteMinistryButton ministryId={m.id} ministryName={m.name} action={deleteAction} />
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {modal ? <PdfModal url={modal.url} title={modal.title} onClose={() => setModal(null)} /> : null}
        </section>
    );
}
