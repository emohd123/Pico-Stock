'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatFils, VAT_RATE } from '@/lib/ministry/money';
import { APPROVAL_NOTICE, EXCLUSIONS, TERMS, PAYMENT_TERMS } from '@/lib/ministry/company';
import PdfModal from '@/components/ministry/PdfModal';
import PhotoAlbums from '@/components/ministry/PhotoAlbums';
import BookingsCalendar from '@/components/ministry/BookingsCalendar';
import { HEAD_TABLE_CONFIGS } from '@/lib/ministry/itemImages';

export default function PortalClient({ token, ministryId, ministryName, ministryNameAr, items, quotations, albums, galleryCount, bookedEntries = [] }) {
    const [tab, setTab] = useState('select');
    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#4D4D4F' }}>
            <header style={{ borderBottom: '4px solid #00C7B1', background: '#fff' }}>
                <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 20px' }}>
                    <img src="/brand/pico-logo.png" alt="PICO — Total Brand Activation" style={{ height: 40 }} />
                    <div style={{ borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', padding: '8px 14px', fontSize: 12, color: '#4D4D4F', lineHeight: 1.5 }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#00857A', fontWeight: 700 }}>For more info or any questions</div>
                        <div style={{ fontWeight: 600 }}>Ebrahim Mohammed <span style={{ fontWeight: 400, color: '#75787B' }}>· Project Executive</span></div>
                        <div><a href="tel:+97336357377" style={{ color: '#00857A', textDecoration: 'none' }}>+973 3635 7377</a> · <a href="mailto:Ebrahim@picobahrain.com" style={{ color: '#00857A', textDecoration: 'none' }}>Ebrahim@picobahrain.com</a></div>
                    </div>
                </div>
                <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 20px 8px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 12 }}>
                        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#4D4D4F', margin: 0 }}>{ministryName}</h1>
                        {ministryNameAr ? <span dir="rtl" style={{ fontSize: 16, color: '#75787B' }}>{ministryNameAr}</span> : null}
                    </div>
                    <p style={{ fontSize: 14, color: '#75787B', margin: '2px 0 0' }}>Ministerial Meeting — Services &amp; Quotation Portal</p>
                </div>
                <nav style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', gap: 4, padding: '0 20px' }}>
                    {[['select', 'Build Quotation'], ['quotes', `My Quotations (${quotations.length})`], ['gallery', `Gallery (${galleryCount})`]].map(([key, label]) => (
                        <button key={key} onClick={() => setTab(key)}
                            style={{ borderBottom: tab === key ? '2px solid #00C7B1' : '2px solid transparent', padding: '8px 16px', fontSize: 14, fontWeight: 500, color: tab === key ? '#00857A' : '#75787B', background: 'none', cursor: 'pointer' }}>
                            {label}
                        </button>
                    ))}
                </nav>
            </header>

            <div style={{ background: '#00C7B1', color: '#fff' }}>
                <div style={{ maxWidth: 1000, margin: '0 auto', padding: '8px 20px', textAlign: 'center', fontSize: 14, fontWeight: 600 }}>
                    ⚠ IMPORTANT: {APPROVAL_NOTICE}
                </div>
            </div>

            <main style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px' }}>
                {tab === 'select' && <Selector token={token} items={items} bookedEntries={bookedEntries} />}
                {tab === 'quotes' && <Quotations quotations={quotations} />}
                {tab === 'gallery' && (
                    galleryCount === 0
                        ? <Empty text="No photos have been shared yet." />
                        : <PhotoAlbums albums={albums} initialOpenId={ministryId} />
                )}
            </main>
        </div>
    );
}

const card = { background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' };
const inputStyle = { width: '100%', borderRadius: 8, border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: 14, boxSizing: 'border-box' };
const btn = { borderRadius: 8, background: '#00857A', color: '#fff', padding: '10px 16px', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer' };

// Official Chair (item 4) = one seat per delegation. Setting its quantity
// auto-fills every per-delegate item to the same number, plus the Head Table
// "pax" (ministries) value. Item numbers, not ids.
const CHAIR_ITEM_NO = 4;
const CHAIR_LINKED_NOS = [8, 11, 12, 13, 14, 19, 20, 25, 26, 39];

// Main Backdrop (Banner), Main Backdrop (Backwall) and Platform (with Carpet)
// form one staging set — selecting or clearing any one toggles all three.
const STRUCTURE_LINKED_NOS = [1, 2, 3];
// Every quotation must include Event Management Staff (item 38).
const REQUIRED_ITEM_NO = 38;

function Selector({ token, items, bookedEntries = [] }) {
    const router = useRouter();
    const [selected, setSelected] = useState({});
    const [eventName, setEventName] = useState('');
    const [venue, setVenue] = useState('');
    const [eventDate, setEventDate] = useState('');
    const [duration, setDuration] = useState('');
    const [address, setAddress] = useState('');
    const [contact1, setContact1] = useState('');
    const [title1, setTitle1] = useState('');
    const [phone1, setPhone1] = useState('');
    const [email1, setEmail1] = useState('');
    const [contact2, setContact2] = useState('');
    const [title2, setTitle2] = useState('');
    const [phone2, setPhone2] = useState('');
    const [email2, setEmail2] = useState('');
    const [heads, setHeads] = useState('');
    const [adminNote, setAdminNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);
    const [lightbox, setLightbox] = useState(null);
    const [agreed, setAgreed] = useState(false);
    const [termsOpen, setTermsOpen] = useState(false); // 'accept' | 'view' | false

    const sortedItems = useMemo(() => [...items].sort((a, b) => a.itemNo - b.itemNo), [items]);
    const byNo = useMemo(() => { const m = new Map(); for (const it of items) m.set(it.itemNo, it); return m; }, [items]);
    const totals = useMemo(() => {
        let subtotal = 0;
        for (const it of items) { const q = selected[it.id]; if (q > 0) subtotal += it.unitPriceFils * q; }
        const vat = Math.round(subtotal * VAT_RATE);
        return { subtotal, vat, total: subtotal + vat };
    }, [selected, items]);
    const selectedCount = Object.values(selected).filter((q) => q > 0).length;

    // Setting the Official Chair count auto-fills all per-delegate items + pax.
    function propagateChair(rawN) {
        const chair = byNo.get(CHAIR_ITEM_NO);
        const n = Math.max(1, Math.min(chair ? chair.maxQty : rawN, parseInt(rawN, 10) || 1));
        setSelected((s) => {
            const next = { ...s };
            if (chair) next[chair.id] = n;
            for (const no of CHAIR_LINKED_NOS) {
                const it = byNo.get(no);
                if (it) next[it.id] = Math.min(it.maxQty, Math.max(1, n));
            }
            return next;
        });
        // Head Table pax (ministries) mirrors the count when it's an offered value.
        setHeads(n >= 7 && n <= 10 ? String(n) : '');
    }

    function toggle(it, on) {
        if (it.itemNo === CHAIR_ITEM_NO) {
            if (on) propagateChair(it.defaultQty);
            else setSelected((s) => { const n = { ...s }; delete n[it.id]; return n; });
            return;
        }
        if (STRUCTURE_LINKED_NOS.includes(it.itemNo)) {
            setSelected((s) => {
                const n = { ...s };
                for (const no of STRUCTURE_LINKED_NOS) {
                    const g = byNo.get(no);
                    if (!g) continue;
                    if (on) n[g.id] = g.defaultQty; else delete n[g.id];
                }
                return n;
            });
            return;
        }
        setSelected((s) => { const n = { ...s }; if (on) n[it.id] = it.defaultQty; else delete n[it.id]; return n; });
    }
    function setQty(it, qty) {
        if (it.itemNo === CHAIR_ITEM_NO) { propagateChair(qty); return; }
        setSelected((s) => ({ ...s, [it.id]: Math.min(it.maxQty, Math.max(1, qty || 1)) }));
    }

    async function submit() {
        setError('');
        setResult(null);
        if (selectedCount === 0) { setError('Please select at least one item.'); return; }
        const required = byNo.get(REQUIRED_ITEM_NO);
        if (!required || !(selected[required.id] > 0)) {
            setError(`Please add “${REQUIRED_ITEM_NO}. Event Management Staff” — it is required for every quotation.`);
            return;
        }
        if (!agreed) { setTermsOpen('accept'); return; }
        setBusy(true);
        try {
            const lines = items.filter((it) => selected[it.id] > 0).map((it) => ({ itemId: it.id, qty: selected[it.id] }));
            const res = await fetch(`/q/${token}/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventName, venue, eventDate, duration, address, contact1, title1, phone1, email1, contact2, title2, phone2, email2, heads, adminNote, agreedTerms: true, lines }) });
            if (!res.ok) throw new Error((await res.text()) || 'Failed to generate quotation');
            const data = await res.json();
            // Show a persistent success panel with a reliable click-to-open link.
            // (Opening a new tab automatically after an await is blocked by popup blockers.)
            setResult({ ref: data.ref, pdfUrl: data.pdfUrl });
            // Refresh the server-fetched quotations list so the new quote shows
            // under "My Quotations" without a full page reload.
            router.refresh();
        } catch (e) { setError(e.message || 'Something went wrong'); } finally { setBusy(false); }
    }

    return (
        <div style={{ display: 'grid', gap: 24, gridTemplateColumns: '1fr 300px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div style={{ ...card, padding: 16 }}>
                    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
                        <label style={{ gridColumn: '1 / -1', fontSize: 12, textTransform: 'uppercase', color: '#75787B' }}>Event / Meeting name
                            <input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="e.g. GCC Finance Ministers Meeting 2026" style={{ ...inputStyle, marginTop: 4 }} /></label>
                        <label style={{ fontSize: 12, textTransform: 'uppercase', color: '#75787B' }}>Venue
                            <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Ritz Carlton" style={{ ...inputStyle, marginTop: 4 }} /></label>
                        <label style={{ fontSize: 12, textTransform: 'uppercase', color: '#75787B' }}>Duration
                            <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 1 Day" style={{ ...inputStyle, marginTop: 4 }} /></label>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <span style={{ fontSize: 12, textTransform: 'uppercase', color: '#75787B' }}>Date</span>
                            <DateCalendar value={eventDate} onChange={setEventDate} />
                        </div>
                        <label style={{ gridColumn: '1 / -1', fontSize: 12, textTransform: 'uppercase', color: '#75787B' }}>Ministry address
                            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Building 123, Road 45, Manama, Kingdom of Bahrain" style={{ ...inputStyle, marginTop: 4 }} /></label>
                        <label style={{ fontSize: 12, textTransform: 'uppercase', color: '#75787B' }}>Contact 1 name
                            <input value={contact1} onChange={(e) => setContact1(e.target.value)} placeholder="" style={{ ...inputStyle, marginTop: 4 }} /></label>
                        <label style={{ fontSize: 12, textTransform: 'uppercase', color: '#75787B' }}>Job title
                            <input value={title1} onChange={(e) => setTitle1(e.target.value)} placeholder="e.g. Protocol Manager" style={{ ...inputStyle, marginTop: 4 }} /></label>
                        <label style={{ fontSize: 12, textTransform: 'uppercase', color: '#75787B' }}>Phone number
                            <input value={phone1} onChange={(e) => setPhone1(e.target.value)} placeholder="e.g. +973 3600 0000" style={{ ...inputStyle, marginTop: 4 }} /></label>
                        <label style={{ fontSize: 12, textTransform: 'uppercase', color: '#75787B' }}>Email address
                            <input type="email" value={email1} onChange={(e) => setEmail1(e.target.value)} placeholder="e.g. name@ministry.gov.bh" style={{ ...inputStyle, marginTop: 4 }} /></label>
                        <label style={{ fontSize: 12, textTransform: 'uppercase', color: '#75787B' }}>Contact name 2
                            <input value={contact2} onChange={(e) => setContact2(e.target.value)} placeholder="Optional" style={{ ...inputStyle, marginTop: 4 }} /></label>
                        <label style={{ fontSize: 12, textTransform: 'uppercase', color: '#75787B' }}>Job title
                            <input value={title2} onChange={(e) => setTitle2(e.target.value)} placeholder="Optional" style={{ ...inputStyle, marginTop: 4 }} /></label>
                        <label style={{ fontSize: 12, textTransform: 'uppercase', color: '#75787B' }}>Phone number
                            <input value={phone2} onChange={(e) => setPhone2(e.target.value)} placeholder="Optional" style={{ ...inputStyle, marginTop: 4 }} /></label>
                        <label style={{ fontSize: 12, textTransform: 'uppercase', color: '#75787B' }}>Email address
                            <input type="email" value={email2} onChange={(e) => setEmail2(e.target.value)} placeholder="Optional" style={{ ...inputStyle, marginTop: 4 }} /></label>
                    </div>
                    <p style={{ marginTop: 12, borderRadius: 6, background: '#f1f5f9', padding: '8px 12px', fontSize: 12, color: '#75787B' }}>
                        Listed quantities are the <strong>maximum allowed</strong> per item — you may reduce them but not exceed them. Items marked <em>fixed qty</em> cannot be changed.
                    </p>
                    {agreed ? (
                        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRadius: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', padding: '8px 12px' }}>
                            <span style={{ fontSize: 12, color: '#15803d' }}>✓ You have accepted the Exclusions, Terms &amp; Conditions and Payment Terms.</span>
                            <button type="button" onClick={() => setTermsOpen('view')} style={{ fontSize: 12, fontWeight: 600, color: '#00857A', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>View terms</button>
                        </div>
                    ) : (
                        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRadius: 6, border: '1px solid #fed7aa', background: '#fff7ed', padding: '8px 12px' }}>
                            <span style={{ fontSize: 12, color: '#9a3412' }}>⚠ You must review &amp; accept the Exclusions, Terms &amp; Conditions and Payment Terms before generating a quotation.</span>
                            <button type="button" onClick={() => setTermsOpen('accept')} style={{ borderRadius: 6, background: '#00857A', color: '#fff', border: 'none', padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Review &amp; accept</button>
                        </div>
                    )}
                </div>

                <section style={card}>
                    <h2 style={{ borderBottom: '1px solid #f1f5f9', padding: '12px 16px', fontSize: 14, fontWeight: 600, color: '#00857A', margin: 0 }}>Tender items (1–40)</h2>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {sortedItems.map((it) => {
                            const on = selected[it.id] > 0;
                            return (
                                <li key={it.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderTop: '1px solid #f1f5f9' }}>
                                    <input type="checkbox" checked={on} onChange={(e) => toggle(it, e.target.checked)} style={{ marginTop: 4, width: 16, height: 16, accentColor: '#00857A' }} />
                                    {it.imageUrl ? (
                                        <button type="button" onClick={() => setLightbox({ url: it.imageUrl, name: `${it.itemNo}. ${it.name}` })} title="Click to enlarge"
                                            style={{ height: 48, width: 48, flexShrink: 0, overflow: 'hidden', borderRadius: 4, border: '1px solid #e2e8f0', padding: 0, cursor: 'pointer' }}>
                                            <img src={it.imageUrl} alt={it.name} style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
                                        </button>
                                    ) : <span style={{ height: 48, width: 48, flexShrink: 0 }} />}
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                            <span style={{ fontSize: 14, fontWeight: 500 }}>{it.itemNo}. {it.name}
                                                {it.qtyFixed ? <span style={{ marginLeft: 8, borderRadius: 4, background: '#f1f5f9', padding: '1px 6px', fontSize: 10, fontWeight: 400, color: '#75787B' }}>fixed qty</span> : null}
                                                {it.itemNo === REQUIRED_ITEM_NO ? <span style={{ marginLeft: 8, borderRadius: 4, background: '#fef2f2', padding: '1px 6px', fontSize: 10, fontWeight: 600, color: '#dc2626' }}>required</span> : null}
                                                {STRUCTURE_LINKED_NOS.includes(it.itemNo) ? <span style={{ marginLeft: 8, borderRadius: 4, background: '#eff6ff', padding: '1px 6px', fontSize: 10, fontWeight: 400, color: '#2563eb' }}>staging set</span> : null}</span>
                                            <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#75787B' }}>BD {formatFils(it.unitPriceFils)}</span>
                                        </div>
                                        {it.description ? <p style={{ margin: '2px 0 0', fontSize: 12, color: '#75787B' }}>{it.description}</p> : null}
                                        {on ? (
                                            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 12, color: '#75787B' }}>Qty</span>
                                                {it.qtyFixed ? (
                                                    <span style={{ borderRadius: 4, border: '1px solid #e2e8f0', background: '#f8fafc', padding: '4px 8px', fontSize: 14 }}>{it.maxQty} (fixed)</span>
                                                ) : (
                                                    <>
                                                        <input type="number" min={1} max={it.maxQty} value={selected[it.id]} onChange={(e) => setQty(it, parseInt(e.target.value, 10))} style={{ width: 80, borderRadius: 4, border: '1px solid #cbd5e1', padding: '4px 8px', fontSize: 14 }} />
                                                        <span style={{ fontSize: 11, color: '#75787B' }}>max {it.maxQty}</span>
                                                    </>
                                                )}
                                                <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 500 }}>BD {formatFils(it.unitPriceFils * selected[it.id])}</span>
                                            </div>
                                        ) : null}
                                        {on && it.itemNo === 6 ? (
                                            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 12, color: '#75787B' }}>Number of ministries</span>
                                                <select value={heads} onChange={(e) => setHeads(e.target.value)} style={{ width: 110, borderRadius: 4, border: '1px solid #cbd5e1', padding: '4px 8px', fontSize: 14 }}>
                                                    <option value="">—</option>
                                                    <option value="7">7 pax</option>
                                                    <option value="8">8 pax</option>
                                                    <option value="9">9 pax</option>
                                                    <option value="10">10 pax</option>
                                                </select>
                                                <span style={{ fontSize: 11, color: '#94a3b8' }}>seating only — does not change the price</span>
                                            </div>
                                        ) : null}
                                        {on && it.itemNo === 6 && heads ? (() => {
                                            const cfg = HEAD_TABLE_CONFIGS[heads];
                                            const label = `Head Table — ${heads}-pax configuration`;
                                            if (!cfg) return (
                                                <p style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>Reference photo for {heads} pax is being prepared.</p>
                                            );
                                            return (
                                                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <button type="button" onClick={() => setLightbox({ url: cfg.img, name: label, video: cfg.video || null })} title="Click to see how the table looks"
                                                        style={{ position: 'relative', height: 56, width: 84, flexShrink: 0, overflow: 'hidden', borderRadius: 6, border: '1px solid #e2e8f0', padding: 0, cursor: 'pointer' }}>
                                                        <img src={cfg.img} alt={label} style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
                                                        {cfg.video ? <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)', color: '#fff', fontSize: 20 }}>▶</span> : null}
                                                    </button>
                                                    <div style={{ minWidth: 0 }}>
                                                        <button type="button" onClick={() => setLightbox({ url: cfg.img, name: label, video: cfg.video || null })}
                                                            style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#00857A' }}>
                                                            View {heads}-pax table layout {cfg.video ? '· photo + video' : ''}
                                                        </button>
                                                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>See how the Head Table looks set up for {heads} delegations.</p>
                                                    </div>
                                                </div>
                                            );
                                        })() : null}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            </div>

            <aside style={{ position: 'sticky', top: 24, alignSelf: 'flex-start' }}>
                <div style={{ ...card, padding: 20 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: '#00857A', margin: 0 }}>Summary</h3>
                    <div style={{ marginTop: 12, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <Row label="Items selected" value={String(selectedCount)} />
                        <Row label="Subtotal (w/o VAT)" value={`BD ${formatFils(totals.subtotal)}`} />
                        <Row label="VAT (10%)" value={`BD ${formatFils(totals.vat)}`} />
                        <div style={{ marginTop: 8, borderTop: '1px solid #e2e8f0', paddingTop: 8 }}><Row label="Grand Total" value={`BD ${formatFils(totals.total)}`} bold /></div>
                    </div>
                    {error ? <p style={{ marginTop: 12, borderRadius: 4, background: '#fef2f2', padding: '8px 12px', fontSize: 12, color: '#dc2626' }}>{error}</p> : null}
                    {result ? (
                        <div style={{ marginTop: 12, borderRadius: 8, border: '1px solid #bbf7d0', background: '#f0fdf4', padding: 12 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>✓ Quotation {result.ref} ready</div>
                            <a href={result.pdfUrl} target="_blank" rel="noreferrer"
                                style={{ display: 'block', marginTop: 8, textAlign: 'center', borderRadius: 8, background: '#00857A', color: '#fff', padding: '10px 16px', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
                                Open / Print PDF
                            </a>
                            <a href={`${result.pdfUrl}?download=1`}
                                style={{ display: 'block', marginTop: 8, textAlign: 'center', borderRadius: 8, border: '1px solid #00857A', color: '#00857A', padding: '9px 16px', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
                                Save PDF (soft copy)
                            </a>
                            <p style={{ marginTop: 8, fontSize: 11, color: '#15803d', textAlign: 'center' }}>Also saved under “My Quotations”.</p>
                        </div>
                    ) : null}
                    <button onClick={submit} disabled={busy} style={{ ...btn, width: '100%', marginTop: 16, opacity: busy ? 0.5 : 1 }}>{busy ? 'Generating…' : (result ? 'Generate Another' : 'Generate Quotation PDF')}</button>
                    <label style={{ display: 'block', marginTop: 12, fontSize: 12, color: '#75787B' }}>Note to PICO team (optional)
                        <textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={3} placeholder="Anything you'd like PICO to know — sent to admin with this quotation." style={{ ...inputStyle, marginTop: 4, resize: 'vertical' }} /></label>
                    <p style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>Fixed tender rates · Bahraini Dinars</p>
                </div>

                <div style={{ ...card, marginTop: 16 }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #f1f5f9', padding: '12px 16px', fontSize: 14, fontWeight: 600, color: '#00857A', margin: 0 }}>📅 Booked dates</h3>
                    <p style={{ padding: '10px 16px 0', margin: 0, fontSize: 12, color: '#75787B' }}>Dates already reserved by ministries — please pick days that are still free.</p>
                    <BookingsCalendar entries={bookedEntries} />
                </div>
            </aside>

            {termsOpen ? (
                <TermsModal mode={termsOpen} onAgree={() => { setAgreed(true); setTermsOpen(false); }} onClose={() => setTermsOpen(false)} />
            ) : null}

            {lightbox ? (
                <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: 16 }}>
                    <div onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh', maxWidth: 768, overflow: 'hidden', borderRadius: 12, background: '#fff' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #f1f5f9', padding: '8px 16px' }}>
                            <span style={{ fontSize: 14, fontWeight: 500, color: '#4D4D4F' }}>{lightbox.name}</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                {lightbox.video ? (
                                    <button onClick={() => setLightbox({ ...lightbox, showVideo: !lightbox.showVideo })} style={{ fontSize: 13, fontWeight: 600, color: '#00857A', background: 'none', border: 'none', cursor: 'pointer' }}>
                                        {lightbox.showVideo ? '🖼 View photo' : '▶ Watch video'}
                                    </button>
                                ) : null}
                                <button onClick={() => setLightbox(null)} style={{ fontSize: 14, color: '#75787B', background: 'none', border: 'none', cursor: 'pointer' }}>✕ Close</button>
                            </span>
                        </div>
                        {lightbox.video && lightbox.showVideo ? (
                            <video src={lightbox.video} controls autoPlay playsInline style={{ maxHeight: '80vh', width: '100%', background: '#000', objectFit: 'contain' }} />
                        ) : (
                            <img src={lightbox.url} alt={lightbox.name} style={{ maxHeight: '80vh', width: '100%', objectFit: 'contain' }} />
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function iso(y, m, d) { return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }

// Turn the selected ISO days into a readable string, grouped by month/year,
// e.g. "2, 3 July 2026" or "30 July 2026, 1 August 2026".
function formatSelected(isoList) {
    const sorted = [...isoList].sort();
    const groups = new Map();
    for (const s of sorted) {
        const [y, m, d] = s.split('-').map(Number);
        const key = `${y}-${m}`;
        if (!groups.has(key)) groups.set(key, { y, m, days: [] });
        groups.get(key).days.push(d);
    }
    return [...groups.values()].map((g) => `${g.days.join(', ')} ${MONTHS[g.m - 1]} ${g.y}`).join(' · ');
}

// Dropdown calendar with multi-day selection. The box shows the chosen dates;
// clicking it opens a single-month calendar; picking days then "OK" commits the
// readable date string through onChange (used by the form / PDF).
function DateCalendar({ value, onChange }) {
    const today = new Date();
    const [open, setOpen] = useState(false);
    const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });
    const [draft, setDraft] = useState(() => new Set()); // selection while the dropdown is open

    function openPicker() {
        setDraft(new Set()); // start fresh each open; box keeps last committed value
        setView({ y: today.getFullYear(), m: today.getMonth() });
        setOpen(true);
    }
    function toggle(d) {
        const key = iso(view.y, view.m, d);
        const next = new Set(draft);
        if (next.has(key)) next.delete(key); else next.add(key);
        setDraft(next);
    }
    function move(delta) {
        let m = view.m + delta, y = view.y;
        if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
        setView({ y, m });
    }
    function confirm() { onChange(formatSelected([...draft])); setOpen(false); }
    function clearAll() { setDraft(new Set()); onChange(''); setOpen(false); }

    const first = new Date(view.y, view.m, 1).getDay();
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const navBtn = { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', color: '#475569', fontSize: 16, lineHeight: 1 };

    return (
        <div style={{ position: 'relative', marginTop: 4 }}>
            <button type="button" onClick={() => (open ? setOpen(false) : openPicker())}
                style={{ ...inputStyle, textAlign: 'left', cursor: 'pointer', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: value ? '#334155' : '#94a3b8' }}>
                <span>{value || 'Select date(s)…'}</span>
                <span style={{ color: '#94a3b8' }}>▾</span>
            </button>

            {open ? (
                <div style={{ position: 'absolute', zIndex: 40, marginTop: 4, border: '1px solid #cbd5e1', borderRadius: 8, padding: 12, width: 300, background: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <button type="button" onClick={() => move(-1)} style={navBtn} aria-label="Previous month">‹</button>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>{MONTHS[view.m]} {view.y}</span>
                        <button type="button" onClick={() => move(1)} style={navBtn} aria-label="Next month">›</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
                        {WEEKDAYS.map((w) => <span key={w} style={{ fontSize: 11, color: '#94a3b8', padding: '2px 0' }}>{w}</span>)}
                        {cells.map((d, i) => {
                            if (d === null) return <span key={`e${i}`} />;
                            const key = iso(view.y, view.m, d);
                            const on = draft.has(key);
                            const isToday = d === today.getDate() && view.m === today.getMonth() && view.y === today.getFullYear();
                            return (
                                <button type="button" key={key} onClick={() => toggle(d)}
                                    style={{ height: 32, borderRadius: 6, cursor: 'pointer', fontSize: 13,
                                        border: isToday && !on ? '1px solid #00C7B1' : '1px solid transparent',
                                        background: on ? '#00857A' : 'transparent', color: on ? '#fff' : '#334155', fontWeight: on ? 600 : 400 }}>
                                    {d}
                                </button>
                            );
                        })}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: draft.size ? '#00857A' : '#94a3b8', minHeight: 16 }}>
                        {draft.size ? formatSelected([...draft]) : 'Pick one or more days'}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
                        <button type="button" onClick={clearAll} style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>Clear</button>
                        <button type="button" onClick={confirm} disabled={!draft.size} style={{ border: 'none', background: '#00857A', color: '#fff', borderRadius: 6, padding: '6px 18px', fontSize: 13, fontWeight: 600, cursor: draft.size ? 'pointer' : 'not-allowed', opacity: draft.size ? 1 : 0.5 }}>OK</button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function Row({ label, value, bold }) {
    return (<div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: bold ? '#00857A' : '#64748b', fontWeight: bold ? 600 : 400 }}>{label}</span>
        <span style={{ color: bold ? '#00857A' : 'inherit', fontWeight: bold ? 600 : 400 }}>{value}</span>
    </div>);
}

function TermsModal({ mode, onAgree, onClose }) {
    const [checked, setChecked] = useState(false);
    const accept = mode === 'accept';
    const secTitle = { margin: '14px 0 4px', fontSize: 13, fontWeight: 700, color: '#00857A' };
    const clause = { display: 'flex', gap: 8, margin: '2px 0', fontSize: 12, color: '#4D4D4F', lineHeight: 1.4 };
    const clauseNo = { flexShrink: 0, width: 16, color: '#75787B' };
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', padding: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '88vh', width: '100%', maxWidth: 640, borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #f1f5f9', padding: '12px 20px' }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#4D4D4F' }}>Exclusions, Terms &amp; Payment Terms</h2>
                    {!accept ? <button onClick={onClose} style={{ fontSize: 14, color: '#75787B', background: 'none', border: 'none', cursor: 'pointer' }}>✕ Close</button> : null}
                </div>
                <div style={{ overflowY: 'auto', padding: '4px 20px 16px' }}>
                    <h3 style={secTitle}>EXCLUSIONS</h3>
                    <p style={{ margin: '0 0 4px', fontSize: 12, color: '#75787B' }}>The following items are not provided for within the main scope of work and should be provided by client (or third party suppliers as necessary):</p>
                    {EXCLUSIONS.map((e, i) => (<div key={i} style={clause}><span style={clauseNo}>{i + 1}</span><span>{e}</span></div>))}
                    <h3 style={secTitle}>TERMS &amp; CONDITIONS OF CONTRACT</h3>
                    <p style={{ margin: 0, fontSize: 12, color: '#4D4D4F' }}>{TERMS}</p>
                    <h3 style={secTitle}>PAYMENT TERMS &amp; SCHEDULE</h3>
                    {PAYMENT_TERMS.map((p, i) => (<div key={i} style={clause}><span style={clauseNo}>{i + 1}</span><span>{p}</span></div>))}
                </div>
                <div style={{ borderTop: '1px solid #f1f5f9', padding: '12px 20px' }}>
                    {accept ? (
                        <>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#4D4D4F', cursor: 'pointer' }}>
                                <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, accentColor: '#00857A' }} />
                                <span>I have read and agree to the Exclusions, Terms &amp; Conditions and Payment Terms above.</span>
                            </label>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                                <button onClick={onClose} style={{ borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                                <button onClick={onAgree} disabled={!checked} style={{ borderRadius: 8, background: '#00857A', color: '#fff', border: 'none', padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: checked ? 'pointer' : 'not-allowed', opacity: checked ? 1 : 0.5 }}>I Agree &amp; Continue</button>
                            </div>
                        </>
                    ) : (
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={onClose} style={{ borderRadius: 8, background: '#00857A', color: '#fff', border: 'none', padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function Quotations({ quotations }) {
    const [modal, setModal] = useState(null); // { url, title }
    if (quotations.length === 0) return <Empty text="No quotations yet. Build one from the “Build Quotation” tab." />;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {quotations.map((q) => (
                <div key={q.id} style={{ ...card, padding: 16 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 500 }}>{q.ref}</span>
                            <span style={{ borderRadius: 4, background: '#f1f5f9', padding: '1px 6px', fontSize: 11, color: '#75787B' }}>Rev {q.revision}</span>
                            {q.isCurrent
                                ? <span style={{ borderRadius: 4, background: '#00C7B1', padding: '1px 6px', fontSize: 11, fontWeight: 600, color: '#fff' }}>LATEST</span>
                                : <span style={{ borderRadius: 4, background: '#e2e8f0', padding: '1px 6px', fontSize: 11, color: '#75787B' }}>Superseded</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
                            <span style={{ color: '#75787B' }}>{new Date(q.createdAt).toLocaleDateString('en-GB')}</span>
                            <span style={{ fontWeight: 500 }}>BD {formatFils(q.totalFils)}</span>
                            {q.pdfBlobUrl ? <button type="button" onClick={() => setModal({ url: q.pdfBlobUrl, title: `Quotation ${q.ref}` })} style={{ border: 'none', background: 'none', padding: 0, fontWeight: 600, color: '#00857A', textDecoration: 'underline', cursor: 'pointer', fontSize: 14 }}>View</button> : null}
                            {q.pdfBlobUrl ? <a href={`${q.pdfBlobUrl}${q.pdfBlobUrl.includes('?') ? '&' : '?'}download=1`} style={{ fontWeight: 500, color: '#00857A', textDecoration: 'underline' }}>Save PDF</a> : null}
                        </div>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, color: '#75787B' }}>{q.eventName || '—'}</div>
                    {q.notes ? <div style={{ marginTop: 8, borderRadius: 4, background: '#fffbeb', padding: '4px 8px', fontSize: 12, color: '#92400e' }}>Update: {q.notes}</div> : null}
                </div>
            ))}
            {modal ? <PdfModal url={modal.url} title={modal.title} onClose={() => setModal(null)} /> : null}
        </div>
    );
}

function Gallery({ photos, token, ministryName }) {
    const [open, setOpen] = useState(null); // index in the lightbox
    const [zoom, setZoom] = useState(false);
    const touch = useMemo(() => ({ x: 0 }), []);

    const close = () => { setOpen(null); setZoom(false); };
    const go = (delta) => { setZoom(false); setOpen((i) => (i === null ? i : (i + delta + photos.length) % photos.length)); };

    useEffect(() => {
        if (open === null) return;
        function onKey(e) {
            if (e.key === 'Escape') close();
            else if (e.key === 'ArrowRight') go(1);
            else if (e.key === 'ArrowLeft') go(-1);
        }
        window.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    }, [open, photos.length]);

    if (photos.length === 0) return <Empty text="No photos have been shared with you yet." />;

    const current = open === null ? null : photos[open];
    const thumb = (p, w, q = 62) => `${p.url}?w=${w}&q=${q}`;
    const downloadBtn = { display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 8, background: '#fff', color: '#00857A', padding: '11px 20px', fontSize: 14, fontWeight: 700, textDecoration: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.18)' };

    return (
        <div>
            {/* Branded cover header — first photo as a darkened background */}
            <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', marginBottom: 18, minHeight: 160 }}>
                <img src={thumb(photos[0], 1400, 55)} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.45)' }} />
                <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, padding: '30px 26px', color: '#fff' }}>
                    <div>
                        <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.85 }}>Event Photo Gallery</div>
                        <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}>{ministryName}</div>
                        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 3 }}>{photos.length} photo{photos.length === 1 ? '' : 's'} · shared by PICO</div>
                    </div>
                    <a href={`/q/${token}/gallery/zip`} style={downloadBtn}>⬇ Download all ({photos.length})</a>
                </div>
            </div>

            {/* Masonry grid — keeps each photo's real aspect ratio */}
            <div style={{ columnWidth: 230, columnGap: 12 }}>
                {photos.map((p, i) => (
                    <button key={p.id} type="button" onClick={() => setOpen(i)} title="Click to view"
                        style={{ display: 'block', width: '100%', marginBottom: 12, breakInside: 'avoid', WebkitColumnBreakInside: 'avoid', padding: 0, border: 'none', borderRadius: 10, overflow: 'hidden', cursor: 'zoom-in', background: '#eef2f6', position: 'relative', lineHeight: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
                        <img src={thumb(p, 500)} alt={p.caption || 'Event photo'} loading="lazy" style={{ display: 'block', width: '100%', height: 'auto' }} />
                    </button>
                ))}
            </div>

            {current ? (
                <div onClick={close}
                    onTouchStart={(e) => { touch.x = e.changedTouches[0].clientX; }}
                    onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - touch.x; if (Math.abs(dx) > 50) { e.stopPropagation(); go(dx < 0 ? 1 : -1); } }}
                    style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column', background: 'rgba(11,17,29,0.95)' }}>
                    {/* Top bar */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', color: '#e2e8f0' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ministryName}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 13, color: '#cbd5e1' }}>{open + 1} / {photos.length}</span>
                            <a href={`${current.url}?w=2400&q=90`} download onClick={(e) => e.stopPropagation()} title="Download this photo"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, background: 'rgba(255,255,255,0.14)', color: '#fff', padding: '7px 12px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>⬇ Download</a>
                            <button type="button" onClick={close} aria-label="Close" style={{ width: 38, height: 38, borderRadius: 19, border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 20, cursor: 'pointer' }}>✕</button>
                        </div>
                    </div>

                    {/* Stage */}
                    <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: '0 8px' }}>
                        {photos.length > 1 ? (
                            <button type="button" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous"
                                style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 48, height: 48, borderRadius: 24, border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 26, cursor: 'pointer', zIndex: 2 }}>‹</button>
                        ) : null}
                        <img src={`${current.url}?w=1800&q=82`} alt={current.caption || 'Event photo'}
                            onClick={(e) => { e.stopPropagation(); setZoom((z) => !z); }}
                            style={{ maxHeight: zoom ? 'none' : '100%', maxWidth: zoom ? 'none' : '100%', width: zoom ? 'auto' : undefined, objectFit: 'contain', borderRadius: 4, cursor: zoom ? 'zoom-out' : 'zoom-in', transition: 'max-height 0.15s' }} />
                        {photos.length > 1 ? (
                            <button type="button" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next"
                                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 48, height: 48, borderRadius: 24, border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 26, cursor: 'pointer', zIndex: 2 }}>›</button>
                        ) : null}
                    </div>

                    {current.caption ? <div onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center', color: '#e2e8f0', fontSize: 13, padding: '2px 16px 8px' }}>{current.caption}</div> : null}

                    {/* Filmstrip */}
                    {photos.length > 1 ? (
                        <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '8px 12px 12px', background: 'rgba(0,0,0,0.25)' }}>
                            {photos.map((p, i) => (
                                <img key={p.id} src={thumb(p, 120, 50)} alt="" onClick={() => { setZoom(false); setOpen(i); }}
                                    style={{ height: 56, width: 74, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', flexShrink: 0, opacity: i === open ? 1 : 0.55, outline: i === open ? '2px solid #00C7B1' : 'none', outlineOffset: -2 }} />
                            ))}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

function Empty({ text }) {
    return <div style={{ ...card, padding: 40, textAlign: 'center', fontSize: 14, color: '#75787B' }}>{text}</div>;
}
