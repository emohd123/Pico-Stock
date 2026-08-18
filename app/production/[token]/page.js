import { notFound } from 'next/navigation';
import {
    getQuotationByShareToken, getMinistryById, getQuotationLines, getMinistryQuotations,
    getProductionAssignments, getProductionFiles, getSharedNotes,
} from '@/lib/ministry/queries';
import {
    isProductionItem, SINGLE_STOCK_ITEM_NOS,
    TITLE_ITEM_NOS, pickListFor, PICK_LIST_EN, selectionFit, deriveSchedule, fmtSize,
} from '@/lib/ministry/production';
import { itemImage } from '@/lib/ministry/itemImages';
import { itemDescription } from '@/lib/ministry/catalog';
import { isCustomItemNo } from '@/lib/ministry/quotationScan';
import { fmtIso } from '@/components/ministry/ClashNotice';
import ItemThumb from '@/components/ministry/ItemThumb';

export const dynamic = 'force-dynamic';

// Anyone holding the link can read this page, so keep it out of search results.
export const metadata = { robots: { index: false, follow: false } };

const card = { background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' };

export default async function SharedProductionPage({ params }) {
    const quote = await getQuotationByShareToken(params.token);
    if (!quote) notFound();

    const [ministry, siblings, filesByQuote, sharedNotes] = await Promise.all([
        getMinistryById(quote.ministryId),
        getMinistryQuotations(quote.ministryId),
        getProductionFiles([quote.id]),
        // Project-note attachments PICO ticked as visible to the crew.
        getSharedNotes(quote.ministryId),
    ]);
    // A meeting can be covered by more than one quotation (added scope, or a
    // second room quoted separately). The token unlocks the meeting, so the
    // sheet must show all of them — otherwise production builds half the job.
    // They stay separate: quantities across quotations are not additive.
    const meetingQuotes = siblings
        .filter((q) => (q.eventDate || '') === (quote.eventDate || ''))
        .sort((a, b) => a.id - b.id);
    const multi = meetingQuotes.length > 1;

    const [overrides, ...lineSets] = await Promise.all([
        getProductionAssignments(meetingQuotes.map((q) => q.id)),
        ...meetingQuotes.map((q) => getQuotationLines(q.id)),
    ]);
    const files = filesByQuote.get(quote.id) || [];
    const sched = deriveSchedule(quote.eventDate);

    // Deliberately no rates or costs: this sheet is about what to deliver.
    // One list, not split by department: the same link goes to every team, so
    // splitting it just made each of them scroll past the other three sections.
    const rows = meetingQuotes.flatMap((q, i) => lineSets[i]
        .filter((l) => isProductionItem(l.itemNo))
        .map((l) => {
            const ov = overrides.get(`${q.id}:${l.itemNo}`) || {};
            return {
                ...l, quoteId: q.id, quoteRef: q.ref, revision: q.revision,
                title: ov.title || '', selections: ov.selections || [], clientNote: ov.clientNote || '',
            };
        }));

    const meta = [
        ['📍 Venue', `${quote.venue || '—'}${quote.hall ? ` — ${quote.hall}` : ''}`],
        quote.meetingKind === 'side' ? ['🏷 Meeting', 'SIDE MEETING — own room, separate build'] : null,
        sched.setupDay ? ['🔧 Setup', fmtIso(sched.setupDay)] : null,
        ['📅 Event', sched.eventDays.length ? sched.eventDays.map(fmtIso).join(', ') : (quote.eventDate || '—')],
        quote.duration ? ['⏱ Duration', quote.duration] : null,
        sched.removalStart ? ['🚚 Removal', `${fmtIso(sched.removalStart)} (night) – ${fmtIso(sched.removalEnd)}`] : null,
    ].filter(Boolean);

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#4D4D4F' }}>
            <style>{`@media print { .no-print { display: none !important } .p-card { break-inside: avoid; box-shadow: none !important; border: 1px solid #ddd } }`}</style>

            <header style={{ borderBottom: '4px solid #00C7B1', background: '#fff' }}>
                <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px' }}>
                    <img src="/brand/pico-logo.png" alt="PICO" style={{ height: 40 }} />
                    <img src="/brand/bahrain-emblem.png" alt="Kingdom of Bahrain" style={{ height: 44 }} />
                </div>
                <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px 14px' }}>
                    <span style={{ borderRadius: 4, background: '#00857A', color: '#fff', padding: '1px 8px', fontSize: 10.5, fontWeight: 700 }}>PRODUCTION SHEET</span>
                    <h1 style={{ fontSize: 20, fontWeight: 700, margin: '6px 0 0', color: '#22282B' }}>{ministry?.name || 'Meeting'}</h1>
                    {quote.eventName ? <p style={{ fontSize: 13.5, color: '#4D4D4F', margin: '2px 0 0' }}>{quote.eventName}</p> : null}
                    <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '4px 0 0' }}>
                        Reference {quote.ref} · view only — nothing here can be changed from this page.
                    </p>
                    {/* The same list as a file, for a crew that will be off the link */}
                    <a className="no-print" href={`/production/${params.token}/pdf`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, borderRadius: 6, background: '#00857A', color: '#fff', padding: '7px 13px', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                        <span aria-hidden>⬇</span> Save as PDF
                    </a>
                </div>
            </header>

            <main style={{ maxWidth: 900, margin: '0 auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <section className="p-card" style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 18, padding: '12px 16px', fontSize: 12.5 }}>
                    {meta.map(([label, value]) => (
                        <span key={label}><strong style={{ color: '#00857A' }}>{label}:</strong> {value}</span>
                    ))}
                </section>

                {quote.productionNote ? (
                    <section className="p-card" style={{ ...card, background: '#fff7ed', border: '1px solid #fed7aa', padding: '10px 16px', fontSize: 12.5, color: '#9a3412' }}>
                        <strong>Note from PICO:</strong> {quote.productionNote}
                    </section>
                ) : null}

                {sharedNotes.length ? (
                    <section className="p-card" style={{ ...card, padding: '12px 16px' }}>
                        <h2 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px', color: '#22282B' }}>Notes &amp; attachments from PICO</h2>
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {sharedNotes.map((n) => (
                                <li key={n.id}>
                                    <div style={{ fontSize: 12.5, color: '#22282B', marginBottom: n.fileName ? 3 : 0 }}>
                                        <span aria-hidden style={{ color: '#00857A' }}>•</span> {n.note}
                                    </div>
                                    {/* a shared note may be text only — the file is optional */}
                                    {n.fileName ? (
                                        <a href={`/production/${params.token}/note/${n.id}`}
                                            style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 6, background: '#f0fdfa', border: '1px solid #99f6e4', padding: '7px 11px', fontSize: 12.5, color: '#00857A', textDecoration: 'none', fontWeight: 600 }}>
                                            <span aria-hidden>⬇</span>
                                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.fileName}</span>
                                            <span style={{ color: '#94a3b8', fontWeight: 400 }}>{fmtSize(n.fileSizeBytes)}</span>
                                        </a>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {files.length ? (
                    <section className="p-card" style={{ ...card, padding: '12px 16px' }}>
                        <h2 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px', color: '#22282B' }}>Files to download</h2>
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {files.map((f) => (
                                <li key={f.id}>
                                    <a href={`/production/${params.token}/file/${f.id}`}
                                        style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 6, background: '#f0fdfa', border: '1px solid #99f6e4', padding: '7px 11px', fontSize: 12.5, color: '#00857A', textDecoration: 'none', fontWeight: 600 }}>
                                        <span aria-hidden>⬇</span>
                                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                        <span style={{ color: '#94a3b8', fontWeight: 400 }}>{fmtSize(f.sizeBytes)}</span>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {[{ id: 'all', label: 'Items to deliver', rows }].map((d) => (
                    <section key={d.id} className="p-card" style={{ ...card, overflow: 'hidden' }}>
                        <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0, padding: '11px 16px', borderBottom: '1px solid #f1f5f9', color: '#22282B' }}>
                            {d.label} <span style={{ color: '#94a3b8', fontWeight: 400 }}>· {d.rows.length} item{d.rows.length === 1 ? '' : 's'}</span>
                        </h2>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                            <thead>
                                <tr style={{ textAlign: 'left', color: '#75787B', fontSize: 11 }}>
                                    <th style={{ padding: '9px 8px 6px 16px', width: 34 }}>No</th>
                                    <th style={{ padding: '9px 8px 6px', width: 44 }} aria-label="Photo" />
                                    <th style={{ padding: '9px 8px 6px' }}>Item</th>
                                    <th style={{ padding: '9px 16px 6px 8px', width: 52 }}>Qty</th>
                                </tr>
                            </thead>
                            <tbody>
                                {d.rows.map((r) => (
                                    <tr key={`${r.quoteId}:${r.itemNo}`} style={{ borderTop: '1px solid #f8fafc' }}>
                                        <td style={{ padding: '6px 8px 6px 16px', color: '#94a3b8', verticalAlign: 'top' }}>{isCustomItemNo(r.itemNo) ? '+' : r.itemNo}</td>
                                        <td style={{ padding: '5px 8px', lineHeight: 0, verticalAlign: 'top' }}>
                                            <ItemThumb src={itemImage(r.itemNo)} name={`${r.itemNo}. ${r.nameSnapshot}`} />
                                        </td>
                                        <td style={{ padding: '6px 8px', color: '#22282B' }}>
                                            {r.nameSnapshot}
                                            {SINGLE_STOCK_ITEM_NOS.includes(r.itemNo) ? <span style={{ marginLeft: 6, borderRadius: 3, background: '#f1f5f9', padding: '0 4px', fontSize: 9, fontWeight: 700, color: '#475569' }}>ONE ONLY</span> : null}
                                            {isCustomItemNo(r.itemNo) ? <span style={{ marginLeft: 6, borderRadius: 3, background: '#fff7ed', border: '1px solid #fed7aa', padding: '0 4px', fontSize: 9, fontWeight: 700, color: '#9a3412' }}>ADDITIONAL</span> : null}
                                            {/* With two quotations on one meeting the same item can appear
                                                twice with different quantities — say which one it came from. */}
                                            {multi ? <span style={{ marginLeft: 6, borderRadius: 3, background: '#eef2f3', padding: '0 5px', fontSize: 9, fontWeight: 700, color: '#475569' }}>{r.quoteRef}</span> : null}
                                            {/* The quoted specification — sizes, finish, what is included —
                                                so this link answers what the quotation says without the money. */}
                                            {itemDescription(r.itemNo)
                                                ? <div style={{ fontSize: 11, color: '#75787B', marginTop: 1 }}>{itemDescription(r.itemNo)}</div>
                                                : null}
                                            {/* What the client asked for on this item. Amber, because
                                                it overrides the specification printed above it. */}
                                            {r.clientNote ? (
                                                <div style={{ marginTop: 3, borderRadius: 5, background: '#fff7ed', border: '1px solid #fed7aa', padding: '3px 8px', fontSize: 11.5, color: '#9a3412' }}>
                                                    <strong>Client asked:</strong> {r.clientNote}
                                                </div>
                                            ) : null}
                                            {TITLE_ITEM_NOS.includes(r.itemNo) && r.title ? (
                                                <div style={{ marginTop: 3, borderRadius: 5, background: '#f0fdfa', border: '1px solid #99f6e4', padding: '3px 8px', fontSize: 11.5, color: '#00857A' }}>
                                                    <strong>Title:</strong> {r.title}
                                                </div>
                                            ) : null}
                                            {/* The exact wording to engrave / which flags, so nobody has to ask. */}
                                            {pickListFor(r.itemNo) && r.selections.length ? (() => {
                                                const fit = selectionFit(r.selections.length, r.qty);
                                                return (
                                                    <>
                                                        <ol style={{ margin: '5px 0 0', paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                            {r.selections.map((t) => (
                                                                <li key={t} style={{ fontSize: 12 }}>
                                                                    <span dir="rtl" style={{ fontSize: 13.5, color: '#22282B' }}>{t}</span>
                                                                    {PICK_LIST_EN[t] ? <span style={{ marginInlineStart: 8, fontSize: 10.5, color: '#94a3b8' }}>{PICK_LIST_EN[t]}</span> : null}
                                                                </li>
                                                            ))}
                                                        </ol>
                                                        {fit.per > 1 ? (
                                                            <p style={{ margin: '3px 0 0', fontSize: 11.5, fontWeight: 700, color: '#00857A' }}>
                                                                {fit.per} of each — {r.qty} total
                                                            </p>
                                                        ) : null}
                                                    </>
                                                );
                                            })() : null}
                                        </td>
                                        <td style={{ padding: '6px 16px 6px 8px', fontWeight: 700, verticalAlign: 'top' }}>{r.qty}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                ))}

                <p className="no-print" style={{ fontSize: 11.5, color: '#94a3b8', margin: 0, textAlign: 'center' }}>
                    Questions? Ebrahim Mohammed, Project Executive — +973 36357377 · Ebrahim@picobahrain.com
                </p>
            </main>
        </div>
    );
}
