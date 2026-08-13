'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatFils, computeTotals, lineTotal } from '@/lib/ministry/money';
import { deriveSchedule, MONTHS_FULL } from '@/lib/ministry/production';

const shortDay = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} ${MONTHS_FULL[m - 1].slice(0, 3)} ${y}`;
};

// Record a quotation produced outside the portal: the PDF plus the event details
// and items, so it behaves like a generated one everywhere downstream.
export default function UploadQuotation({ ministryId, catalog }) {
    const router = useRouter();
    const fileRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [qty, setQty] = useState({});          // itemId -> qty (absent = not included)
    const [dateText, setDateText] = useState('');
    const [meta, setMeta] = useState(null);      // event fields read off the PDF
    const [metaKey, setMetaKey] = useState(0);   // bumped per scan to reset those inputs
    const [extras, setExtras] = useState([]);    // rows with no catalogue equivalent
    const [scan, setScan] = useState(null);      // {state, matched, extras} for the banner
    const [kind, setKind] = useState('main');    // main meeting or a side meeting
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');

    // The calendar and the Production schedule are both derived from this text,
    // so show what was understood rather than letting a typo fail silently.
    const sched = useMemo(() => deriveSchedule(dateText), [dateText]);

    const picked = useMemo(
        () => catalog.filter((c) => qty[c.id] > 0).map((c) => ({ item: c, q: qty[c.id] })),
        [catalog, qty],
    );
    const totals = useMemo(
        () => computeTotals([
            ...picked.map((p) => lineTotal(p.item.unitPriceFils, p.q)),
            ...extras.map((e) => lineTotal(Math.round(Number(e.unitPriceFils) || 0), Math.max(1, parseInt(e.qty, 10) || 1))),
        ]),
        [picked, extras],
    );

    // Read the PDF as soon as it is chosen: tick the items it lists, fill the
    // event details, and surface anything the catalogue has no equivalent for.
    async function onFile(e) {
        const file = e.target.files?.[0];
        setErr('');
        setScan(null);
        if (!file) return;
        setScan({ state: 'reading' });
        try {
            const fd = new FormData();
            fd.set('file', file);
            const res = await fetch('/api/quotations/upload/scan', { method: 'POST', body: fd });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            if (!data.readable) { setScan({ state: 'unreadable' }); return; }

            const byNo = new Map(catalog.map((c) => [c.itemNo, c]));
            const next = {};
            let missed = 0;
            for (const m of data.matched) {
                const c = byNo.get(m.itemNo);
                if (c) next[c.id] = m.qty; else missed++;
            }
            setQty(next);
            setExtras(data.extras.map((x) => ({ ...x, qty: x.qty || 1 })));
            setMeta(data.meta || null);
            setMetaKey((k) => k + 1);
            if (data.meta?.eventDate) setDateText(data.meta.eventDate);
            setScan({ state: 'done', matched: data.matched.length - missed, extras: data.extras.length });
        } catch {
            setScan({ state: 'unreadable' });
        }
    }

    const setExtra = (i, patch) => setExtras((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    const addExtra = () => setExtras((prev) => [...prev, { name: '', qty: 1, unit: 'nos', unitPriceFils: 0 }]);

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
        const cleanExtras = extras.filter((x) => String(x.name || '').trim());
        if (!picked.length && !cleanExtras.length) { setErr('Tick at least one item so Production knows what to deliver.'); return; }

        const fd = new FormData(e.target);
        fd.set('ministryId', String(ministryId));
        fd.set('items', JSON.stringify(picked.map((p) => ({ itemId: p.item.id, qty: p.q }))));
        fd.set('extras', JSON.stringify(cleanExtras.map((x) => ({
            name: x.name, qty: x.qty, unit: x.unit, unitPriceFils: Math.round(Number(x.unitPriceFils) || 0),
        }))));

        setBusy(true);
        try {
            const res = await fetch('/api/quotations/upload', { method: 'POST', body: fd });
            if (!res.ok) throw new Error(await res.text());
            setOpen(false);
            setQty({});
            setExtras([]);
            setMeta(null);
            setScan(null);
            setDateText('');
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
                <label style={label}>Quotation PDF <span style={{ fontWeight: 400, color: '#94a3b8' }}>— read automatically, then check what it found</span></label>
                <input ref={fileRef} type="file" name="file" accept="application/pdf" onChange={onFile} style={{ fontSize: 12.5 }} />
                {scan?.state === 'reading' ? (
                    <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#75787B' }}>Reading the PDF…</p>
                ) : scan?.state === 'done' ? (
                    <p style={{ margin: '6px 0 0', borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '4px 9px', fontSize: 11.5, color: '#15803d' }}>
                        {scan.matched === 0 && scan.extras
                            // A side-meeting quotation prices by section and matches
                            // nothing in the catalogue — "found 0 items" would read as
                            // a failure when in fact the whole document was read.
                            ? <>✓ Nothing matched the catalogue — read <strong>{scan.extras}</strong> priced row{scan.extras === 1 ? '' : 's'} and added {scan.extras === 1 ? 'it' : 'them'} below as additional</>
                            : <>
                                ✓ Found <strong>{scan.matched}</strong> catalogue item{scan.matched === 1 ? '' : 's'} and ticked them
                                {scan.extras ? <> · <strong>{scan.extras}</strong> row{scan.extras === 1 ? '' : 's'} not in the catalogue, added below as additional</> : null}
                            </>}
                        {' — check the quantities and prices against the PDF.'}
                    </p>
                ) : scan?.state === 'unreadable' ? (
                    <p style={{ margin: '6px 0 0', borderRadius: 6, background: '#fff7ed', border: '1px solid #fed7aa', padding: '4px 9px', fontSize: 11.5, color: '#9a3412' }}>
                        Could not read this PDF (likely a scan with no text). Tick the items by hand below.
                    </p>
                ) : null}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 10 }}>
                {/* keyed on the scan so a freshly read PDF replaces what is typed */}
                <div><label style={label}>Event name</label><input key={`en${metaKey}`} name="eventName" defaultValue={meta?.eventName || ''} style={input} placeholder="GCC Ministers Meeting" /></div>
                <div><label style={label}>Venue</label><input key={`vn${metaKey}`} name="venue" defaultValue={meta?.venue || ''} style={input} placeholder="Ritz Carlton" /></div>
                <div>
                    <label style={label}>Event date</label>
                    <input name="eventDate" value={dateText} onChange={(e) => setDateText(e.target.value)}
                        style={input} placeholder="27 August 2026  ·  5-6 September 2026" />
                </div>
                <div><label style={label}>Duration</label><input key={`du${metaKey}`} name="duration" defaultValue={meta?.duration || ''} style={input} placeholder="1 Day" /></div>
                <div style={{ gridColumn: '1 / -1' }}>
                    {!dateText.trim() ? (
                        <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>
                            Day, month, year — e.g. <code>27 August 2026</code>, <code>5-6 September 2026</code>, or <code>2, 3 July 2026 · 1 August 2026</code> for split dates.
                        </p>
                    ) : sched.eventDays.length ? (
                        <p style={{ margin: 0, borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '4px 9px', fontSize: 11.5, color: '#15803d' }}>
                            ✓ Calendar: <strong>{sched.eventDays.map(shortDay).join(', ')}</strong>
                            {' · '}Setup <strong>{shortDay(sched.setupDay)}</strong>
                            {' · '}Removal <strong>{shortDay(sched.removalStart)} – {shortDay(sched.removalEnd)}</strong>
                            {' — shows on Production once LPO received is ticked.'}
                        </p>
                    ) : (
                        <p style={{ margin: 0, borderRadius: 6, background: '#fff7ed', border: '1px solid #fed7aa', padding: '4px 9px', fontSize: 11.5, color: '#9a3412' }}>
                            ⚠ Date not recognised — it will save, but this meeting won&apos;t appear on the calendar or get a Production schedule. Try <code>27 August 2026</code>.
                        </p>
                    )}
                </div>
                {/* A ministry can run a main meeting plus side meetings in other
                    halls on nearby days. Production and planning both need to know
                    which is which — a side meeting is its own room, so it never
                    shares a build with the main one. */}
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
                    <div>
                        <label style={label}>This quotation is for</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {[['main', 'Main meeting'], ['side', 'Side meeting']].map(([v, t]) => (
                                <label key={v} style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                                    borderRadius: 6, border: `1px solid ${kind === v ? '#00857A' : '#cbd5e1'}`,
                                    background: kind === v ? '#f0fdfa' : '#fff', padding: '6px 11px',
                                    fontSize: 12, fontWeight: kind === v ? 700 : 400, color: kind === v ? '#00857A' : '#4D4D4F',
                                }}>
                                    <input type="radio" name="meetingKind" value={v} checked={kind === v}
                                        onChange={() => setKind(v)} style={{ cursor: 'pointer' }} />
                                    {t}
                                </label>
                            ))}
                        </div>
                    </div>
                    <div style={{ flex: '1 1 220px' }}>
                        <label style={label}>Hall / room <span style={{ fontWeight: 400, color: '#94a3b8' }}>— optional, e.g. Sky 1 &amp; 2</span></label>
                        <input key={`hl${metaKey}`} name="hall" defaultValue={meta?.hall || ''} style={input} placeholder="AlGhazal Hall 2" />
                    </div>
                </div>
                {kind === 'side' ? (
                    <p style={{ gridColumn: '1 / -1', margin: 0, borderRadius: 6, background: '#faf5ff', border: '1px solid #e9d5ff', padding: '5px 9px', fontSize: 11.5, color: '#6b21a8' }}>
                        Marked as a <strong>side meeting</strong> — it shows as SIDE on the calendar, the season plan and production, and is planned as its own room, so it never shares a build with the main meeting.
                    </p>
                ) : null}
                <div style={{ gridColumn: '1 / -1' }}>
                    <label style={label}>Reference on the PDF <span style={{ fontWeight: 400, color: '#94a3b8' }}>— leave blank to use this ministry&apos;s number</span></label>
                    <input key={`rf${metaKey}`} name="ref" defaultValue={meta?.ref || ''} style={input} placeholder="Q/07/2026/EM/11976" />
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

            {/* Rows the catalogue has no equivalent for. Production still has to
                build them, so they are kept rather than dropped. */}
            <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <label style={{ ...label, marginBottom: 0 }}>Additional items <span style={{ fontWeight: 400, color: '#94a3b8' }}>— not in the catalogue, still delivered</span></label>
                    <button type="button" onClick={addExtra}
                        style={{ borderRadius: 5, background: '#fff', color: '#00857A', border: '1px solid #00857A', padding: '2px 9px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>＋ Add</button>
                </div>
                {extras.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>None — everything on the PDF matched the catalogue.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {extras.map((x, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 6, background: '#fff7ed', border: '1px solid #fed7aa', padding: '4px 8px' }}>
                                <input value={x.name} onChange={(e) => setExtra(i, { name: e.target.value })} placeholder="What is it? e.g. Custom Welcome Arch"
                                    style={{ flex: 1, minWidth: 0, borderRadius: 5, border: '1px solid #cbd5e1', padding: '3px 7px', fontSize: 12 }} />
                                <input type="number" min="1" value={x.qty} onChange={(e) => setExtra(i, { qty: e.target.value })} title="Quantity"
                                    style={{ width: 58, borderRadius: 5, border: '1px solid #cbd5e1', padding: '3px 6px', fontSize: 12 }} />
                                <input value={x.unit || ''} onChange={(e) => setExtra(i, { unit: e.target.value })} placeholder="unit" title="Unit"
                                    style={{ width: 52, borderRadius: 5, border: '1px solid #cbd5e1', padding: '3px 6px', fontSize: 12 }} />
                                <input type="number" min="0" step="0.001" value={(Number(x.unitPriceFils) || 0) / 1000}
                                    onChange={(e) => setExtra(i, { unitPriceFils: Math.round((parseFloat(e.target.value) || 0) * 1000) })}
                                    title="Rate in BHD" style={{ width: 92, borderRadius: 5, border: '1px solid #cbd5e1', padding: '3px 6px', fontSize: 12 }} />
                                <button type="button" onClick={() => setExtras((p) => p.filter((_, j) => j !== i))} aria-label="Remove"
                                    style={{ border: 'none', background: 'none', color: '#dc2626', fontSize: 14, lineHeight: 1, cursor: 'pointer' }}>×</button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 10 }}>
                <span style={{ fontSize: 12.5, color: '#4D4D4F' }}>
                    {picked.length} item{picked.length === 1 ? '' : 's'}
                    {extras.length ? ` + ${extras.length} additional` : ''}
                    {' · '}Subtotal <strong>BHD {formatFils(totals.subtotal)}</strong>
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
