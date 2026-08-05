'use client';
import { useState } from 'react';
import { pickListFor, selectionFit } from '@/lib/ministry/production';

// Which name plates / flags this meeting needs. Presets come from PICK_LISTS;
// anything else is typed in. Saves on every change.
export default function PickList({ quotationId, itemNo, values, qty }) {
    const list = pickListFor(itemNo);
    const [selected, setSelected] = useState(values || []);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(false);
    if (!list) return null;

    const presetAr = new Set(list.presets.map((p) => p.ar));

    async function persist(next) {
        setSelected(next);           // optimistic — the list on screen is the truth
        setBusy(true);
        setErr(false);
        try {
            const res = await fetch('/api/quotations/production', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quotationId, itemNo, selections: next }),
            });
            if (!res.ok) throw new Error();
        } catch { setErr(true); } finally { setBusy(false); }
    }

    const toggle = (ar) => persist(selected.includes(ar) ? selected.filter((t) => t !== ar) : [...selected, ar]);
    const addCustom = () => {
        const v = draft.trim();
        if (!v || selected.includes(v)) { setDraft(''); return; }
        persist([...selected, v]);
        setDraft('');
    };

    const custom = selected.filter((t) => !presetAr.has(t));
    const count = selected.length;
    const fit = selectionFit(count, qty);
    const badge = fit.state === 'ok'
        ? { bg: '#f0fdf4', fg: '#15803d', text: `${count} selected${fit.per > 1 ? ` · ${fit.per} of each = ${qty}` : ` · matches quotation`} ✓` }
        : fit.state === 'mismatch'
            ? { bg: '#fff7ed', fg: '#9a3412', text: `${count} selected · quotation says ${qty} ⚠` }
            : { bg: '#f1f5f9', fg: '#475569', text: `${count} selected${qty != null ? ` · quotation says ${qty}` : ''}` };

    return (
        <div style={{ borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', padding: '9px 11px', marginTop: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
                <strong style={{ fontSize: 11.5, color: '#22282B' }}>{list.label}</strong>
                <span style={{ borderRadius: 4, padding: '1px 7px', fontSize: 10.5, fontWeight: 700, background: badge.bg, color: badge.fg }}>{badge.text}</span>
                {busy ? <span style={{ fontSize: 10.5, color: '#94a3b8' }}>saving…</span> : null}
                {err ? <span style={{ fontSize: 10.5, color: '#dc2626' }}>save failed</span> : null}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 3 }}>
                {list.presets.map((p) => (
                    <label key={p.ar} style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 5, padding: '3px 6px', fontSize: 11.5, cursor: 'pointer', background: selected.includes(p.ar) ? '#f0fdfa' : 'transparent' }}>
                        <input type="checkbox" checked={selected.includes(p.ar)} onChange={() => toggle(p.ar)} style={{ cursor: 'pointer' }} />
                        <span dir="rtl" style={{ fontSize: 13, color: '#22282B' }}>{p.ar}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#94a3b8' }}>{p.en}</span>
                    </label>
                ))}
            </div>

            {custom.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                    {custom.map((t) => (
                        <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 12, background: '#f0fdfa', border: '1px solid #99f6e4', padding: '2px 5px 2px 10px', fontSize: 12 }}>
                            <span dir="rtl" style={{ color: '#22282B' }}>{t}</span>
                            <button type="button" onClick={() => persist(selected.filter((x) => x !== t))} aria-label={`Remove ${t}`}
                                style={{ border: 'none', background: 'none', color: '#dc2626', fontSize: 13, lineHeight: 1, cursor: 'pointer', padding: '0 2px' }}>×</button>
                        </span>
                    ))}
                </div>
            ) : null}

            <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                <input value={draft} onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
                    dir="auto" placeholder={`${list.addHint} then press Enter`}
                    style={{ flex: 1, minWidth: 0, borderRadius: 6, border: '1px solid #cbd5e1', padding: '4px 9px', fontSize: 11.5 }} />
                <button type="button" onClick={addCustom}
                    style={{ borderRadius: 6, background: '#00857A', color: '#fff', border: 'none', padding: '4px 11px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>Add</button>
            </div>
        </div>
    );
}
