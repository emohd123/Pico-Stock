'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatFils, computeTotals, lineTotal } from '@/lib/ministry/money';

// Record a quotation produced outside the portal: the PDF plus the event details
// and items, so it behaves like a generated one everywhere downstream.
export default function UploadQuotation({ ministryId, catalog }) {
    const router = useRouter();
    const fileRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [qty, setQty] = useState({});          // itemId -> qty (absent = not included)
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');

    const picked = useMemo(
        () => catalog.filter((c) => qty[c.id] > 0).map((c) => ({ item: c, q: qty[c.id] })),
        [catalog, qty],
    );
    const totals = useMemo(
        () => computeTotals(picked.map((p) => lineTotal(p.item.unitPriceFils, p.q))),
        [picked],
    );

    const toggle = (c) => setQty((prev) => {
        const next = { ...prev };
        if (next[c.id] > 0) delete next[c.id];
        else next[c.id] = c.defaultQty || 1;
        return next;
    });
    const setOne = (c, v) => setQty((prev) => {
        const n = parseInt(v, 10);
        const next = { ...prev };
        if (!n || n < 1) delete next[c.id]; else next[c.id] = n;
        return next;
    });

    async function submit(e) {
        e.preventDefault();
        setErr('');
        const file = fileRef.current?.files?.[0];
        if (!file) { setErr('Choose the quotation PDF first.'); return; }
        if (!picked.length) { setErr('Tick at least one item so Production knows what to deliver.'); return; }

        const fd = new FormData(e.target);
        fd.set('ministryId', String(ministryId));
        fd.set('items', JSON.stringify(picked.map((p) => ({ itemId: p.item.id, qty: p.q }))));

        setBusy(true);
        try {
            const res = await fetch('/api/quotations/upload', { method: 'POST', body: fd });
            if (!res.ok) throw new Error(await res.text());
            setOpen(false);
            setQty({});
            e.target.reset();
            router.refresh();
        } catch (e2) { setErr(e2.message || 'Upload failed'); } finally { setBusy(false); }
    }

    const input = { borderRadius: 6, border: '1px solid #cbd5e1', padding: '5px 9px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
    const label = { fontSize: 11.5, fontWeight: 600, color: '#4D4D4F', display: 'block', marginBottom: 3 };

    if (!open) {
        return (
            <button type="button" onClick={() => setOpen(true)}
                style={{ borderRadius: 6, background: '#00857A', color: '#fff', border: 'none', padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                ⬆ Upload a quotation
            </button>
        );
    }

    return (
        <form onSubmit={submit} style={{ borderRadius: 8, border: '1px solid #99f6e4', background: '#f8fafc', padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                <strong style={{ fontSize: 13.5, color: '#22282B' }}>Upload a quotation</strong>
                <button type="button" onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', color: '#75787B', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            </div>

            <div style={{ marginBottom: 10 }}>
                <label style={label}>Quotation PDF</label>
                <input ref={fileRef} type="file" name="file" accept="application/pdf" style={{ fontSize: 12.5 }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 10 }}>
                <div><label style={label}>Event name</label><input name="eventName" style={input} placeholder="GCC Ministers Meeting" /></div>
                <div><label style={label}>Venue</label><input name="venue" style={input} placeholder="Ritz Carlton" /></div>
                <div><label style={label}>Event date</label><input name="eventDate" style={input} placeholder="27 August 2026" /></div>
                <div><label style={label}>Duration</label><input name="duration" style={input} placeholder="1 Day" /></div>
                <div style={{ gridColumn: '1 / -1' }}>
                    <label style={label}>Reference on the PDF <span style={{ fontWeight: 400, color: '#94a3b8' }}>— leave blank to use this ministry&apos;s number</span></label>
                    <input name="ref" style={input} placeholder="Q/07/2026/EM/11976" />
                </div>
            </div>

            <div style={{ marginBottom: 8 }}>
                <label style={label}>Items in this quotation <span style={{ fontWeight: 400, color: '#94a3b8' }}>— tick and set the quantity shown on the PDF</span></label>
                <div style={{ maxHeight: 260, overflowY: 'auto', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', padding: 6 }}>
                    {catalog.map((c) => {
                        const on = qty[c.id] > 0;
                        return (
                            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px', background: on ? '#f0fdfa' : 'transparent', borderRadius: 4 }}>
                                <input type="checkbox" checked={on} onChange={() => toggle(c)} style={{ cursor: 'pointer' }} />
                                <span style={{ width: 26, fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>{c.itemNo}</span>
                                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#22282B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>{formatFils(c.unitPriceFils)}</span>
                                <input type="number" min="1" value={qty[c.id] || ''} onChange={(e) => setOne(c, e.target.value)}
                                    placeholder="qty" style={{ width: 62, borderRadius: 5, border: '1px solid #cbd5e1', padding: '2px 6px', fontSize: 12 }} />
                            </div>
                        );
                    })}
                </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 10 }}>
                <span style={{ fontSize: 12.5, color: '#4D4D4F' }}>
                    {picked.length} item{picked.length === 1 ? '' : 's'} · Subtotal <strong>BHD {formatFils(totals.subtotal)}</strong>
                    {' · '}VAT <strong>BHD {formatFils(totals.vat)}</strong>
                    {' · '}Total <strong style={{ color: '#00857A' }}>BHD {formatFils(totals.total)}</strong>
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>← check this against the PDF before saving</span>
                <button type="submit" disabled={busy}
                    style={{ marginLeft: 'auto', borderRadius: 6, background: busy ? '#cbd5e1' : '#00857A', color: '#fff', border: 'none', padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>
                    {busy ? 'Saving…' : 'Save quotation'}
                </button>
            </div>
            {err ? <p style={{ margin: '8px 0 0', fontSize: 12, color: '#dc2626' }}>{err}</p> : null}
        </form>
    );
}
