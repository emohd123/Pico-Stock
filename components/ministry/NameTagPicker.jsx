'use client';
import { useState } from 'react';
import { GCC_NAME_TAGS, NAME_TAG_ITEM_NO } from '@/lib/ministry/production';

const PRESET_AR = new Set(GCC_NAME_TAGS.map((t) => t.ar));

// Which table-top name plates this meeting needs. Presets are the six GCC
// states plus الرئيس / الأمانة العامة; anything else is typed in below.
export default function NameTagPicker({ quotationId, tags, qty }) {
    const [selected, setSelected] = useState(tags || []);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(false);

    async function persist(next) {
        setSelected(next);           // optimistic — the list is the source of truth on screen
        setBusy(true);
        setErr(false);
        try {
            const res = await fetch('/api/quotations/production', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quotationId, itemNo: NAME_TAG_ITEM_NO, nameTags: next }),
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

    const custom = selected.filter((t) => !PRESET_AR.has(t));
    const count = selected.length;
    // The quotation says how many plates were priced — flag a mismatch rather
    // than letting production discover it in the workshop.
    const match = qty == null ? null : count === qty;

    return (
        <div style={{ borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', padding: '9px 11px', marginTop: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
                <strong style={{ fontSize: 11.5, color: '#22282B' }}>Name plates needed</strong>
                <span style={{
                    borderRadius: 4, padding: '1px 7px', fontSize: 10.5, fontWeight: 700,
                    background: match === null ? '#f1f5f9' : match ? '#f0fdf4' : '#fff7ed',
                    color: match === null ? '#475569' : match ? '#15803d' : '#9a3412',
                }}>
                    {count} selected{qty != null ? ` · quotation says ${qty}` : ''}{match === false ? ' ⚠' : match ? ' ✓' : ''}
                </span>
                {busy ? <span style={{ fontSize: 10.5, color: '#94a3b8' }}>saving…</span> : null}
                {err ? <span style={{ fontSize: 10.5, color: '#dc2626' }}>save failed</span> : null}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 3 }}>
                {GCC_NAME_TAGS.map((t) => (
                    <label key={t.ar} style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 5, padding: '3px 6px', fontSize: 11.5, cursor: 'pointer', background: selected.includes(t.ar) ? '#f0fdfa' : 'transparent' }}>
                        <input type="checkbox" checked={selected.includes(t.ar)} onChange={() => toggle(t.ar)} style={{ cursor: 'pointer' }} />
                        <span dir="rtl" style={{ fontSize: 13, color: '#22282B' }}>{t.ar}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#94a3b8' }}>{t.en}</span>
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
                    dir="auto" placeholder="Add another plate (e.g. نائب الرئيس) then press Enter"
                    style={{ flex: 1, minWidth: 0, borderRadius: 6, border: '1px solid #cbd5e1', padding: '4px 9px', fontSize: 11.5 }} />
                <button type="button" onClick={addCustom}
                    style={{ borderRadius: 6, background: '#00857A', color: '#fff', border: 'none', padding: '4px 11px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>Add</button>
            </div>
        </div>
    );
}
