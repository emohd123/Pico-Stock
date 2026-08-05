import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAdmin } from '@/lib/ministry/auth';
import { getAllMinistries, getRecentQuotations, getQuotationLinesBulk, getProductionAssignments, getProductionFiles } from '@/lib/ministry/queries';
import { DEPARTMENTS, DEPT_LABEL, deptForItem, SINGLE_STOCK_ITEM_NOS, TITLE_ITEM_NOS, TITLE_ITEM_HINT, pickListFor, deriveSchedule, computeAutoNotes } from '@/lib/ministry/production';
import { itemImage } from '@/lib/ministry/itemImages';
import { fmtIso } from '@/components/ministry/ClashNotice';
import DeptSelect from '@/components/ministry/DeptSelect';
import ProductionNote from '@/components/ministry/ProductionNote';
import ItemThumb from '@/components/ministry/ItemThumb';
import ItemTitle from '@/components/ministry/ItemTitle';
import PickList from '@/components/ministry/PickList';
import ShareLink from '@/components/ministry/ShareLink';
import ProductionFiles from '@/components/ministry/ProductionFiles';

export const dynamic = 'force-dynamic';

const card = { background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' };
const NOTE_STYLE = {
    ok: { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' },
    warn: { background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412' },
    danger: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' },
};

export default async function ProductionPage({ searchParams }) {
    if (!isAdmin()) notFound();
    const deptFilter = typeof searchParams?.dept === 'string' && DEPARTMENTS.some((d) => d.id === searchParams.dept)
        ? searchParams.dept : null;

    const [ministryRows, allQuotes] = await Promise.all([getAllMinistries(), getRecentQuotations(200)]);
    const ministryById = new Map(ministryRows.map((m) => [m.id, m]));

    // Confirmed (LPO received) meetings only; one card per meeting — a ministry
    // may hold several meetings (different eventDate), revisions dedupe to the
    // newest quote (allQuotes is newest-first).
    const seen = new Set();
    const meetings = [];
    for (const q of allQuotes) {
        const m = ministryById.get(q.ministryId);
        if (!m || !m.lpoReceived) continue;
        const key = `${q.ministryId}|${q.eventDate || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const sched = deriveSchedule(q.eventDate);
        meetings.push({
            quoteId: q.id, ref: q.ref, ministry: m.name, event: q.eventName || '', venue: q.venue || '',
            duration: q.duration || '', productionNote: q.productionNote || '',
            shareToken: q.shareToken || null, ...sched,
        });
    }
    meetings.sort((a, b) => {
        const da = a.eventDays[0] || '9999', db2 = b.eventDays[0] || '9999';
        return da < db2 ? -1 : da > db2 ? 1 : 0;
    });

    const ids = meetings.map((mt) => mt.quoteId);
    const [linesByQuote, overrides, filesByQuote] = await Promise.all([
        getQuotationLinesBulk(ids), getProductionAssignments(ids), getProductionFiles(ids),
    ]);
    for (const mt of meetings) {
        mt.files = filesByQuote.get(mt.quoteId) || [];
        mt.lines = (linesByQuote.get(mt.quoteId) || []).map((l) => {
            const ov = overrides.get(`${mt.quoteId}:${l.itemNo}`) || {};
            return { ...l, dept: ov.dept || deptForItem(l.itemNo), title: ov.title || '', selections: ov.selections || [] };
        });
        mt.singleStockItems = new Set(mt.lines.map((l) => l.itemNo).filter((n) => SINGLE_STOCK_ITEM_NOS.includes(n)));
    }
    const autoNotes = computeAutoNotes(meetings);

    const todayIso = new Date().toISOString().slice(0, 10);
    const isPast = (mt) => (mt.removalEnd || '9999') < todayIso;
    const upcoming = meetings.filter((mt) => !isPast(mt));
    const past = meetings.filter(isPast);

    const visibleLines = (mt) => deptFilter ? mt.lines.filter((l) => l.dept === deptFilter) : mt.lines;

    const MeetingCard = ({ mt }) => {
        const lines = visibleLines(mt);
        if (deptFilter && lines.length === 0) return null;
        const notes = autoNotes.get(mt.quoteId) || [];
        return (
            <details open className="prod-card prod-details" style={{ ...card, overflow: 'hidden' }}>
                <summary style={{ listStyle: 'none', cursor: 'pointer' }} title="Click to open / close details">
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #f1f5f9', padding: '12px 16px' }}>
                        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="chevron no-print" style={{ fontSize: 13, color: '#94a3b8', transition: 'transform 0.15s', display: 'inline-block' }}>▸</span>
                            <span style={{ fontSize: 15, fontWeight: 700, color: '#22282B' }}>{mt.ministry}</span>
                            {mt.event ? <span style={{ marginLeft: 4, fontSize: 12.5, color: '#75787B' }}>{mt.event}</span> : null}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>{mt.ref}</span>
                            <span style={{ borderRadius: 4, background: '#dc2626', color: '#fff', padding: '1px 8px', fontSize: 10.5, fontWeight: 700 }}>CONFIRMED · LPO</span>
                        </div>
                    </div>

                    {/* schedule strip — always visible, even when collapsed */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                        <span><strong style={{ color: '#00857A' }}>📍 Venue:</strong> {mt.venue || '—'}</span>
                        {mt.setupDay ? <span><strong style={{ color: '#9a3412' }}>🔧 Setup:</strong> {fmtIso(mt.setupDay)}</span> : null}
                        <span><strong style={{ color: '#22282B' }}>📅 Event:</strong> {mt.eventDays.length ? mt.eventDays.map(fmtIso).join(', ') : (mt.duration || '—')}</span>
                        {mt.duration ? <span><strong>⏱</strong> {mt.duration}</span> : null}
                        {mt.removalStart ? <span><strong style={{ color: '#9a3412' }}>🚚 Removal:</strong> {fmtIso(mt.removalStart)} (night) – {fmtIso(mt.removalEnd)}</span> : null}
                    </div>
                </summary>

                {notes.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 16px 0' }}>
                        {notes.map((n, i) => (
                            <div key={i} style={{ ...NOTE_STYLE[n.level], borderRadius: 6, padding: '5px 9px', fontSize: 11.5, fontWeight: 600, lineHeight: 1.4 }}>{n.text}</div>
                        ))}
                    </div>
                ) : null}

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                        <tr style={{ textAlign: 'left', color: '#75787B', fontSize: 11 }}>
                            <th style={{ padding: '10px 8px 6px 16px', width: 34 }}>No</th>
                            <th style={{ padding: '10px 8px 6px', width: 44 }} aria-label="Photo" />
                            <th style={{ padding: '10px 8px 6px' }}>Item</th>
                            <th style={{ padding: '10px 8px 6px', width: 52 }}>Qty</th>
                            <th style={{ padding: '10px 16px 6px 8px', width: 170 }}>Department</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((l) => (
                            <tr key={l.itemNo} style={{ borderTop: '1px solid #f8fafc' }}>
                                <td style={{ padding: '5px 8px 5px 16px', color: '#94a3b8' }}>{l.itemNo}</td>
                                <td style={{ padding: '4px 8px', lineHeight: 0 }}>
                                    <ItemThumb src={itemImage(l.itemNo)} name={`${l.itemNo}. ${l.nameSnapshot}`} />
                                </td>
                                <td style={{ padding: '5px 8px', color: '#22282B' }}>
                                    {l.nameSnapshot}
                                    {SINGLE_STOCK_ITEM_NOS.includes(l.itemNo) ? <span style={{ marginLeft: 6, borderRadius: 3, background: '#f1f5f9', padding: '0 4px', fontSize: 9, fontWeight: 700, color: '#475569' }}>ONE ONLY</span> : null}
                                    {/* Each meeting carries its own printed title, so it is stored per quotation. */}
                                    {TITLE_ITEM_NOS.includes(l.itemNo) ? (
                                        <>
                                            <span className="no-print">
                                                <ItemTitle quotationId={mt.quoteId} itemNo={l.itemNo} title={l.title} hint={TITLE_ITEM_HINT[l.itemNo]} />
                                            </span>
                                            {l.title ? <div className="print-only-block" style={{ display: 'none', marginTop: 3, fontSize: 11 }}><strong>Title:</strong> {l.title}</div> : null}
                                        </>
                                    ) : null}
                                    {pickListFor(l.itemNo) ? (
                                        <>
                                            <span className="no-print">
                                                <PickList quotationId={mt.quoteId} itemNo={l.itemNo} values={l.selections} qty={l.qty} />
                                            </span>
                                            {l.selections.length ? (
                                                <div className="print-only-block" style={{ display: 'none', marginTop: 3, fontSize: 11 }}>
                                                    <strong>({l.selections.length}):</strong> <span dir="rtl">{l.selections.join(' · ')}</span>
                                                </div>
                                            ) : null}
                                        </>
                                    ) : null}
                                </td>
                                <td style={{ padding: '5px 8px', fontWeight: 600, verticalAlign: 'top' }}>{l.qty}</td>
                                <td className="no-print" style={{ padding: '4px 16px 4px 8px' }}>
                                    <DeptSelect quotationId={mt.quoteId} itemNo={l.itemNo} dept={l.dept} />
                                </td>
                                <td className="print-only" style={{ display: 'none', padding: '5px 16px 5px 8px', fontSize: 11 }}>{DEPT_LABEL[l.dept]}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="no-print" style={{ borderTop: '1px solid #f1f5f9', padding: '10px 16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <ProductionNote quotationId={mt.quoteId} note={mt.productionNote} />
                    <ProductionFiles quotationId={mt.quoteId} files={mt.files} />
                    <ShareLink quotationId={mt.quoteId} token={mt.shareToken} />
                </div>
                {mt.productionNote ? (
                    <p className="print-only" style={{ display: 'none', margin: 0, padding: '8px 16px 12px', fontSize: 11, color: '#4D4D4F' }}><strong>Note:</strong> {mt.productionNote}</p>
                ) : null}
            </details>
        );
    };

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#4D4D4F' }}>
            <style>{`.prod-details > summary::-webkit-details-marker { display: none } .prod-details > summary::marker { content: '' } .prod-details[open] .chevron { transform: rotate(90deg) } @media print { .no-print { display: none !important } .print-only { display: table-cell !important } p.print-only, .print-only-block { display: block !important } .prod-card { break-inside: avoid; box-shadow: none !important; border: 1px solid #ddd } }`}</style>
            <header className="no-print" style={{ borderBottom: '4px solid #00C7B1', background: '#fff' }}>
                <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px' }}>
                    <img src="/brand/pico-logo.png" alt="PICO" style={{ height: 40 }} />
                    <img src="/brand/bahrain-emblem.png" alt="Kingdom of Bahrain" style={{ height: 44 }} />
                </div>
                <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 20px 12px' }}>
                    <Link href="/quotations" style={{ fontSize: 12, color: '#00857A' }}>← Admin dashboard</Link>
                    <h1 style={{ fontSize: 20, fontWeight: 600, margin: '4px 0 0' }}>Production</h1>
                    <p style={{ fontSize: 13, color: '#75787B', margin: '2px 0 0' }}>
                        Confirmed (LPO received) meetings only — setup the day before, removal after. Filter by department, then print for that team.
                    </p>
                </div>
            </header>

            <main style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <Link href="/quotations/production" style={{ borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, textDecoration: 'none', background: !deptFilter ? '#00857A' : '#fff', color: !deptFilter ? '#fff' : '#00857A', border: '1px solid #00857A' }}>All departments</Link>
                    {DEPARTMENTS.map((d) => (
                        <Link key={d.id} href={`/quotations/production?dept=${d.id}`} style={{ borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, textDecoration: 'none', background: deptFilter === d.id ? '#00857A' : '#fff', color: deptFilter === d.id ? '#fff' : '#00857A', border: '1px solid #00857A' }}>{d.label}</Link>
                    ))}
                </div>

                {upcoming.length === 0 ? (
                    <section style={{ ...card, padding: 32, textAlign: 'center', fontSize: 14, color: '#75787B' }}>
                        No confirmed meetings yet. Tick <strong>LPO received</strong> on a ministry&apos;s Manage page and it appears here for production.
                    </section>
                ) : upcoming.map((mt) => <MeetingCard key={mt.quoteId} mt={mt} />)}

                {past.length > 0 ? (
                    <details className="no-print">
                        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#75787B', padding: '4px 0' }}>Past meetings ({past.length})</summary>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 12 }}>
                            {past.map((mt) => <MeetingCard key={mt.quoteId} mt={mt} />)}
                        </div>
                    </details>
                ) : null}
            </main>
        </div>
    );
}
