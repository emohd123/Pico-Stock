import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAdmin } from '@/lib/ministry/auth';
import { getAllMinistries, getRecentQuotations, getQuotationLinesBulk } from '@/lib/ministry/queries';
import { SINGLE_STOCK_ITEM_NOS, isProductionItem, MONTHS_FULL, isoAddDays, daysBetween } from '@/lib/ministry/production';
import { buildPlan } from '@/lib/ministry/plan';
import { VENUE_UNKNOWN } from '@/lib/ministry/venues';

export const dynamic = 'force-dynamic';

const card = { background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' };
const COL = 26;          // px per day
const ROW = 34;          // px per meeting row
const LABEL_W = 250;

// Venue colours — one per hotel, so a run of bars in the same colour reads as
// "this all stays in one place".
const VENUE_COLORS = ['#00857A', '#2563eb', '#9333ea', '#c2410c', '#0891b2', '#65a30d'];

const parts = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};

export default async function PlanPage() {
    if (!isAdmin()) notFound();

    const [ministries, quotes] = await Promise.all([getAllMinistries(), getRecentQuotations(300)]);
    const byId = new Map(ministries.map((m) => [m.id, m]));

    const grouped = new Map();
    for (const q of quotes) {
        const m = byId.get(q.ministryId);
        if (!m) continue;
        const key = `${q.ministryId}|${q.eventDate || ''}`;
        if (!grouped.has(key)) {
            grouped.set(key, {
                key, ministryId: m.id, ministry: m.name, lpo: Boolean(m.lpoReceived),
                venueRaw: q.venue || '', eventDateText: q.eventDate || '', quoteIds: [],
            });
        }
        grouped.get(key).quoteIds.push(q.id);
    }
    const lineMap = await getQuotationLinesBulk([...grouped.values()].flatMap((g) => g.quoteIds));
    for (const g of grouped.values()) {
        const nos = g.quoteIds.flatMap((id) => (lineMap.get(id) || []).map((l) => l.itemNo)).filter(isProductionItem);
        g.singleItems = new Set(nos.filter((n) => SINGLE_STOCK_ITEM_NOS.includes(n)));
        g.itemCount = new Set(nos).size;
    }

    const plan = buildPlan([...grouped.values()]);
    const todayIso = new Date().toISOString().slice(0, 10);

    // Only what is still ahead — a plan is about what you can still act on.
    const rows = plan.meetings.filter((m) => (m.removalEnd || m.eventDays[m.eventDays.length - 1]) >= todayIso);
    if (!rows.length) {
        return <Empty />;
    }

    // --- date axis ---
    const starts = rows.map((m) => m.setupDay || m.eventDays[0]);
    const ends = rows.map((m) => m.removalEnd || m.eventDays[m.eventDays.length - 1]);
    const from = starts.reduce((a, b) => (a < b ? a : b));
    const to = ends.reduce((a, b) => (a > b ? a : b));
    const span = daysBetween(from, to) + 1;
    const allDays = Array.from({ length: span }, (_, i) => isoAddDays(from, i));
    const idx = new Map(allDays.map((d, i) => [d, i]));

    // --- how many venues need a build each day (the pressure line) ---
    const pressure = new Map();
    for (const d of allDays) {
        const live = rows.filter((m) => m.eventDays.includes(d) && m.singleItems.size);
        const known = new Set(live.filter((m) => m.venue !== VENUE_UNKNOWN).map((m) => m.venue));
        const unknown = live.filter((m) => m.venue === VENUE_UNKNOWN).length;
        pressure.set(d, known.size + unknown);
    }

    // --- group rows by venue so shared builds sit together ---
    const venues = [...new Set(rows.map((m) => m.venue))]
        .sort((a, b) => (a === VENUE_UNKNOWN ? 1 : b === VENUE_UNKNOWN ? -1 : a.localeCompare(b)));
    const colorOf = new Map(venues.map((v, i) => [v, v === VENUE_UNKNOWN ? '#dc2626' : VENUE_COLORS[i % VENUE_COLORS.length]]));
    const lanes = venues.map((v) => ({
        venue: v,
        color: colorOf.get(v),
        items: rows.filter((m) => m.venue === v).sort((a, b) => a.eventDays[0].localeCompare(b.eventDays[0])),
    }));

    // month header spans
    const monthSpans = [];
    for (const d of allDays) {
        const { y, m } = parts(d);
        const label = `${MONTHS_FULL[m - 1]} ${y}`;
        if (!monthSpans.length || monthSpans[monthSpans.length - 1].label !== label) monthSpans.push({ label, n: 0 });
        monthSpans[monthSpans.length - 1].n += 1;
    }

    const grid = { display: 'grid', gridTemplateColumns: `repeat(${span}, ${COL}px)`, width: span * COL };
    const shortfall = Object.values(plan.sets).filter((s) => s.needed > 1);

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#4D4D4F' }}>
            <style>{`@media print { .no-print { display:none !important } .p-card { break-inside: avoid; box-shadow:none !important; border:1px solid #ddd } body { background:#fff } }`}</style>

            <header className="no-print" style={{ borderBottom: '4px solid #00C7B1', background: '#fff' }}>
                <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px' }}>
                    <img src="/brand/pico-logo.png" alt="PICO" style={{ height: 40 }} />
                    <img src="/brand/bahrain-emblem.png" alt="Kingdom of Bahrain" style={{ height: 44 }} />
                </div>
                <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 20px 12px' }}>
                    <Link href="/quotations" style={{ fontSize: 12, color: '#00857A' }}>← Admin dashboard</Link>
                    <h1 style={{ fontSize: 20, fontWeight: 600, margin: '4px 0 0' }}>Season plan</h1>
                    <p style={{ fontSize: 13, color: '#75787B', margin: '2px 0 0' }}>
                        Meetings grouped by venue. Bars in the same colour and touching = the build can stay standing.
                    </p>
                </div>
            </header>

            <main style={{ maxWidth: 1400, margin: '0 auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* headline */}
                <section className="p-card" style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 10, padding: 12 }}>
                    <Stat n={rows.length} label="meetings ahead" />
                    <Stat n={venues.filter((v) => v !== VENUE_UNKNOWN).length} label="venues" />
                    <Stat n={rows.filter((m) => !m.lpo).length} label="waiting on LPO" tone={rows.filter((m) => !m.lpo).length ? 'warn' : 'ok'} />
                    <Stat n={rows.filter((m) => m.venue === VENUE_UNKNOWN).length} label="venue not set" tone={rows.some((m) => m.venue === VENUE_UNKNOWN) ? 'danger' : 'ok'} />
                    <Stat n={[...pressure.values()].filter((n) => n > 1).length} label="days needing 2 builds" tone={[...pressure.values()].some((n) => n > 1) ? 'danger' : 'ok'} />
                </section>

                {/* legend */}
                <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11.5, color: '#4D4D4F', alignItems: 'center' }}>
                    <Key swatch={<span style={{ width: 22, height: 10, borderRadius: 2, background: '#00857A', display: 'inline-block' }} />} text="Event day" />
                    <Key swatch={<span style={{ width: 22, height: 10, borderRadius: 2, background: '#00857A', opacity: 0.28, display: 'inline-block' }} />} text="Setup / removal" />
                    <Key swatch={<span style={{ width: 22, height: 10, borderRadius: 2, background: '#dc2626', display: 'inline-block' }} />} text="Venue not set" />
                    <Key swatch={<span style={{ width: 10, height: 14, background: '#fee2e2', border: '1px solid #fecaca', display: 'inline-block' }} />} text="Day needing 2 builds" />
                </div>

                {/* ---------- the timeline ---------- */}
                <section className="p-card" style={{ ...card, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', overflowX: 'auto' }}>
                        {/* sticky labels */}
                        <div style={{ flexShrink: 0, width: LABEL_W, position: 'sticky', left: 0, zIndex: 2, background: '#fff', borderRight: '1px solid #e2e8f0' }}>
                            <div style={{ height: 44, borderBottom: '1px solid #e2e8f0' }} />
                            <div style={{ height: 22, borderBottom: '1px solid #f1f5f9', fontSize: 9.5, fontWeight: 700, color: '#94a3b8', padding: '4px 10px' }}>BUILDS NEEDED PER DAY</div>
                            {lanes.map((lane) => (
                                <div key={lane.venue}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #f1f5f9' }}>
                                        <span style={{ width: 9, height: 9, borderRadius: 2, background: lane.color, flexShrink: 0 }} />
                                        <span style={{ fontSize: 11.5, fontWeight: 700, color: lane.venue === VENUE_UNKNOWN ? '#dc2626' : '#22282B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lane.venue}</span>
                                    </div>
                                    {lane.items.map((m) => (
                                        <div key={m.key} style={{ height: ROW, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 10px', borderBottom: '1px solid #f8fafc' }}>
                                            <Link href={`/quotations/ministry/${m.ministryId}`} style={{ fontSize: 11.5, color: '#22282B', textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.ministry}</Link>
                                            <span style={{ fontSize: 9.5, color: '#94a3b8' }}>
                                                {m.itemCount} items{!m.lpo ? ' · no LPO' : ''}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>

                        {/* scrolling chart */}
                        <div style={{ flexShrink: 0 }}>
                            {/* months */}
                            <div style={{ display: 'grid', gridTemplateColumns: monthSpans.map((s) => `${s.n * COL}px`).join(' '), height: 22, borderBottom: '1px solid #f1f5f9' }}>
                                {monthSpans.map((s) => (
                                    <div key={s.label} style={{ fontSize: 10.5, fontWeight: 700, color: '#22282B', padding: '4px 0 0 6px', borderLeft: '1px solid #e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden' }}>{s.label}</div>
                                ))}
                            </div>
                            {/* day numbers */}
                            <div style={{ ...grid, height: 22, borderBottom: '1px solid #e2e8f0' }}>
                                {allDays.map((d) => {
                                    const p = parts(d);
                                    const weekend = p.wd === 5 || p.wd === 6;   // Fri/Sat in Bahrain
                                    return (
                                        <div key={d} title={d} style={{ fontSize: 9, textAlign: 'center', paddingTop: 5, color: d === todayIso ? '#dc2626' : weekend ? '#cbd5e1' : '#94a3b8', fontWeight: d === todayIso ? 700 : 400, background: weekend ? '#fbfdfd' : 'transparent' }}>{p.d}</div>
                                    );
                                })}
                            </div>
                            {/* pressure lane */}
                            <div style={{ ...grid, height: 22, borderBottom: '1px solid #f1f5f9' }}>
                                {allDays.map((d) => {
                                    const n = pressure.get(d) || 0;
                                    return (
                                        <div key={d} title={n > 1 ? `${n} separate builds needed on ${d}` : ''} style={{ fontSize: 9.5, fontWeight: 700, textAlign: 'center', paddingTop: 4, color: n > 1 ? '#dc2626' : '#cbd5e1', background: n > 1 ? '#fee2e2' : 'transparent' }}>{n > 1 ? n : n === 1 ? '·' : ''}</div>
                                    );
                                })}
                            </div>

                            {lanes.map((lane) => (
                                <div key={lane.venue}>
                                    <div style={{ ...grid, height: 26, background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #f1f5f9' }} />
                                    {lane.items.map((m) => {
                                        const s = m.setupDay || m.eventDays[0];
                                        const e = m.removalEnd || m.eventDays[m.eventDays.length - 1];
                                        const evS = m.eventDays[0], evE = m.eventDays[m.eventDays.length - 1];
                                        return (
                                            <div key={m.key} style={{ ...grid, height: ROW, position: 'relative', borderBottom: '1px solid #f8fafc' }}>
                                                {/* weekend + clash shading behind the bar */}
                                                {allDays.map((d) => {
                                                    const p = parts(d);
                                                    const weekend = p.wd === 5 || p.wd === 6;
                                                    const hot = (pressure.get(d) || 0) > 1;
                                                    return <div key={d} style={{ background: hot ? '#fee2e2' : weekend ? '#fbfdfd' : 'transparent' }} />;
                                                })}
                                                {/* setup → removal (light) */}
                                                <div style={{
                                                    gridColumn: `${idx.get(s) + 1} / ${idx.get(e) + 2}`, gridRow: 1,
                                                    alignSelf: 'center', height: 16, borderRadius: 4,
                                                    background: lane.color, opacity: 0.24,
                                                }} />
                                                {/* event days (solid) */}
                                                <div style={{
                                                    gridColumn: `${idx.get(evS) + 1} / ${idx.get(evE) + 2}`, gridRow: 1,
                                                    alignSelf: 'center', height: 18, borderRadius: 4,
                                                    background: lane.color, display: 'flex', alignItems: 'center', paddingLeft: 5,
                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
                                                }}>
                                                    <span style={{ fontSize: 9.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                                                        {m.eventDays.length}d
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ---------- what it means ---------- */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14 }}>
                    <section className="p-card" style={{ ...card, overflow: 'hidden' }}>
                        <h2 style={{ fontSize: 12.5, fontWeight: 700, margin: 0, padding: '10px 14px', borderBottom: '1px solid #f1f5f9', color: '#22282B' }}>
                            {shortfall.length ? '⚠ Build a second set' : '✓ Current stock covers the season'}
                        </h2>
                        <ul style={{ listStyle: 'none', margin: 0, padding: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {shortfall.length === 0 ? (
                                <li style={{ fontSize: 11.5, color: '#15803d' }}>No day needs two of any one-only item.</li>
                            ) : shortfall.map((s) => (
                                <li key={s.itemNo} style={{ borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', padding: '6px 10px', fontSize: 11.5 }}>
                                    <strong style={{ color: '#22282B' }}>{s.label}</strong>
                                    <span style={{ color: '#dc2626', fontWeight: 700 }}> — {s.needed} needed by {s.firstNeededBy}</span>
                                    <div style={{ color: '#9a3412', fontSize: 10.5 }}>{s.venues.join(' + ')}</div>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="p-card" style={{ ...card, overflow: 'hidden' }}>
                        <h2 style={{ fontSize: 12.5, fontWeight: 700, margin: 0, padding: '10px 14px', borderBottom: '1px solid #f1f5f9', color: '#22282B' }}>
                            ✓ Leave standing — do not dismantle
                        </h2>
                        <ul style={{ listStyle: 'none', margin: 0, padding: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {plan.chains.length === 0 ? (
                                <li style={{ fontSize: 11.5, color: '#75787B' }}>No back-to-back meetings share a venue.</li>
                            ) : plan.chains.map((c, i) => (
                                <li key={i} style={{ borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '6px 10px', fontSize: 11.5 }}>
                                    <strong style={{ color: '#15803d' }}>{c.venue}</strong>
                                    <span style={{ color: '#4D4D4F' }}> · {c.from.ministry} → {c.to.ministry}</span>
                                    <div style={{ color: '#4D4D4F', fontSize: 10.5 }}>{c.gap} day{c.gap === 1 ? '' : 's'} between · {c.items.length} items stay up</div>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="p-card" style={{ ...card, overflow: 'hidden' }}>
                        <h2 style={{ fontSize: 12.5, fontWeight: 700, margin: 0, padding: '10px 14px', borderBottom: '1px solid #f1f5f9', color: '#22282B' }}>Next steps</h2>
                        <ul style={{ listStyle: 'none', margin: 0, padding: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {plan.actions.slice(0, 12).map((a, i) => (
                                <li key={i} style={{ display: 'flex', gap: 8, fontSize: 11.5, alignItems: 'flex-start' }}>
                                    <span style={{ flexShrink: 0, fontWeight: 700, color: a.level === 'danger' ? '#dc2626' : a.level === 'warn' ? '#9a3412' : '#94a3b8', minWidth: 70 }}>{a.by || '—'}</span>
                                    <span style={{ color: '#22282B' }}>{a.text}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                </div>
            </main>
        </div>
    );
}

function Stat({ n, label, tone }) {
    const fg = tone === 'danger' ? '#dc2626' : tone === 'warn' ? '#9a3412' : tone === 'ok' ? '#15803d' : '#00857A';
    return (
        <div style={{ flex: '1 1 150px', borderRadius: 8, border: '1px solid #e2e8f0', padding: '8px 12px' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: fg, lineHeight: 1.1 }}>{n}</div>
            <div style={{ fontSize: 10.5, color: '#75787B' }}>{label}</div>
        </div>
    );
}
function Key({ swatch, text }) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{swatch}<span>{text}</span></span>;
}
function Empty() {
    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'grid', placeItems: 'center', color: '#75787B' }}>
            <p style={{ fontSize: 14 }}>No upcoming meetings with a readable date.</p>
        </div>
    );
}
