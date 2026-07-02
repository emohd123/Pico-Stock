'use client';

import { useMemo, useState } from 'react';
import { formatFils, VAT_RATE } from '@/lib/ministry/money';
import { APPROVAL_NOTICE, EXCLUSIONS, TERMS, PAYMENT_TERMS } from '@/lib/ministry/company';

export default function PortalClient({ token, ministryName, ministryNameAr, items, quotations, photos }) {
    const [tab, setTab] = useState('select');
    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#4D4D4F' }}>
            <header style={{ borderBottom: '4px solid #00C7B1', background: '#fff' }}>
                <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 20px' }}>
                    <img src="/brand/pico-logo.png" alt="PICO — Total Brand Activation" style={{ height: 40 }} />
                    <img src="/brand/bahrain-emblem.png" alt="Kingdom of Bahrain" style={{ height: 44 }} />
                </div>
                <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 20px 8px' }}>
                    <h1 style={{ fontSize: 20, fontWeight: 600, color: '#4D4D4F', margin: 0 }}>{ministryName}</h1>
                    {ministryNameAr ? <div dir="rtl" style={{ fontSize: 16, color: '#75787B' }}>{ministryNameAr}</div> : null}
                    <p style={{ fontSize: 14, color: '#75787B', margin: '2px 0 0' }}>Ministerial Meeting — Services &amp; Quotation Portal</p>
                </div>
                <nav style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', gap: 4, padding: '0 20px' }}>
                    {[['select', 'Build Quotation'], ['quotes', `My Quotations (${quotations.length})`], ['gallery', `Gallery (${photos.length})`]].map(([key, label]) => (
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
                {tab === 'select' && <Selector token={token} items={items} />}
                {tab === 'quotes' && <Quotations quotations={quotations} />}
                {tab === 'gallery' && <Gallery photos={photos} />}
            </main>
        </div>
    );
}

const card = { background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' };
const inputStyle = { width: '100%', borderRadius: 8, border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: 14, boxSizing: 'border-box' };
const btn = { borderRadius: 8, background: '#00857A', color: '#fff', padding: '10px 16px', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer' };

function Selector({ token, items }) {
    const [selected, setSelected] = useState({});
    const [eventName, setEventName] = useState('');
    const [venue, setVenue] = useState('');
    const [eventDate, setEventDate] = useState('');
    const [duration, setDuration] = useState('');
    const [contact1, setContact1] = useState('');
    const [phone1, setPhone1] = useState('');
    const [contact2, setContact2] = useState('');
    const [phone2, setPhone2] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);
    const [lightbox, setLightbox] = useState(null);
    const [agreed, setAgreed] = useState(false);
    const [termsOpen, setTermsOpen] = useState(false); // 'accept' | 'view' | false

    const sortedItems = useMemo(() => [...items].sort((a, b) => a.itemNo - b.itemNo), [items]);
    const totals = useMemo(() => {
        let subtotal = 0;
        for (const it of items) { const q = selected[it.id]; if (q > 0) subtotal += it.unitPriceFils * q; }
        const vat = Math.round(subtotal * VAT_RATE);
        return { subtotal, vat, total: subtotal + vat };
    }, [selected, items]);
    const selectedCount = Object.values(selected).filter((q) => q > 0).length;

    function toggle(it, on) { setSelected((s) => { const n = { ...s }; if (on) n[it.id] = it.defaultQty; else delete n[it.id]; return n; }); }
    function setQty(it, qty) { setSelected((s) => ({ ...s, [it.id]: Math.min(it.maxQty, Math.max(1, qty || 1)) })); }

    async function submit() {
        setError('');
        setResult(null);
        if (selectedCount === 0) { setError('Please select at least one item.'); return; }
        if (!agreed) { setTermsOpen('accept'); return; }
        setBusy(true);
        try {
            const lines = items.filter((it) => selected[it.id] > 0).map((it) => ({ itemId: it.id, qty: selected[it.id] }));
            const res = await fetch(`/q/${token}/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventName, venue, eventDate, duration, contact1, phone1, contact2, phone2, agreedTerms: true, lines }) });
            if (!res.ok) throw new Error((await res.text()) || 'Failed to generate quotation');
            const data = await res.json();
            // Show a persistent success panel with a reliable click-to-open link.
            // (Opening a new tab automatically after an await is blocked by popup blockers.)
            setResult({ ref: data.ref, pdfUrl: data.pdfUrl });
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
                        <label style={{ fontSize: 12, textTransform: 'uppercase', color: '#75787B' }}>Date
                            <input value={eventDate} onChange={(e) => setEventDate(e.target.value)} placeholder="e.g. 27 August 2026" style={{ ...inputStyle, marginTop: 4 }} /></label>
                        <label style={{ fontSize: 12, textTransform: 'uppercase', color: '#75787B' }}>Duration
                            <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 1 Day" style={{ ...inputStyle, marginTop: 4 }} /></label>
                        <label style={{ fontSize: 12, textTransform: 'uppercase', color: '#75787B' }}>Contact 1
                            <input value={contact1} onChange={(e) => setContact1(e.target.value)} placeholder="e.g. Ahmed Al Khalifa" style={{ ...inputStyle, marginTop: 4 }} /></label>
                        <label style={{ fontSize: 12, textTransform: 'uppercase', color: '#75787B' }}>Phone number
                            <input value={phone1} onChange={(e) => setPhone1(e.target.value)} placeholder="e.g. +973 3600 0000" style={{ ...inputStyle, marginTop: 4 }} /></label>
                        <label style={{ fontSize: 12, textTransform: 'uppercase', color: '#75787B' }}>Contact 2
                            <input value={contact2} onChange={(e) => setContact2(e.target.value)} placeholder="Optional" style={{ ...inputStyle, marginTop: 4 }} /></label>
                        <label style={{ fontSize: 12, textTransform: 'uppercase', color: '#75787B' }}>Phone number
                            <input value={phone2} onChange={(e) => setPhone2(e.target.value)} placeholder="Optional" style={{ ...inputStyle, marginTop: 4 }} /></label>
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
                                                {it.qtyFixed ? <span style={{ marginLeft: 8, borderRadius: 4, background: '#f1f5f9', padding: '1px 6px', fontSize: 10, fontWeight: 400, color: '#75787B' }}>fixed qty</span> : null}</span>
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
                    <p style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>Fixed tender rates · Bahraini Dinars</p>
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
                            <button onClick={() => setLightbox(null)} style={{ fontSize: 14, color: '#75787B', background: 'none', border: 'none', cursor: 'pointer' }}>✕ Close</button>
                        </div>
                        <img src={lightbox.url} alt={lightbox.name} style={{ maxHeight: '80vh', width: '100%', objectFit: 'contain' }} />
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
                            {q.pdfBlobUrl ? <a href={q.pdfBlobUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 500, color: '#00857A', textDecoration: 'underline' }}>Open</a> : null}
                            {q.pdfBlobUrl ? <a href={`${q.pdfBlobUrl}?download=1`} style={{ fontWeight: 500, color: '#00857A', textDecoration: 'underline' }}>Save PDF</a> : null}
                        </div>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, color: '#75787B' }}>{q.eventName || '—'}</div>
                    {q.notes ? <div style={{ marginTop: 8, borderRadius: 4, background: '#fffbeb', padding: '4px 8px', fontSize: 12, color: '#92400e' }}>Update: {q.notes}</div> : null}
                </div>
            ))}
        </div>
    );
}

function Gallery({ photos }) {
    if (photos.length === 0) return <Empty text="No photos have been shared with you yet." />;
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {photos.map((p) => (
                <figure key={p.id} style={{ ...card, overflow: 'hidden', margin: 0 }}>
                    <img src={p.url} alt={p.caption || 'Reference photo'} style={{ height: 176, width: '100%', objectFit: 'cover' }} />
                    {p.caption ? <figcaption style={{ padding: '8px 12px', fontSize: 12, color: '#75787B' }}>{p.caption}</figcaption> : null}
                </figure>
            ))}
        </div>
    );
}

function Empty({ text }) {
    return <div style={{ ...card, padding: 40, textAlign: 'center', fontSize: 14, color: '#75787B' }}>{text}</div>;
}
