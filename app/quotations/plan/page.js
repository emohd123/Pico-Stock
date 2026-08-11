import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAdmin } from '@/lib/ministry/auth';
import { getAllMinistries, getRecentQuotations, getQuotationLinesBulk, getProductionAssignments } from '@/lib/ministry/queries';
import { SINGLE_STOCK_ITEM_NOS, SINGLE_STOCK_LABELS, isProductionItem, MONTHS_FULL, isoAddDays, daysBetween } from '@/lib/ministry/production';
import { buildPlan, computeInventory } from '@/lib/ministry/plan';
import { VENUE_UNKNOWN } from '@/lib/ministry/venues';
import { itemImage } from '@/lib/ministry/itemImages';
import PlanCalendar from '@/components/ministry/PlanCalendar';

export const dynamic = 'force-dynamic';

const card = { background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' };
const COL = 26;
const ROW = 38;
const LABEL_W = 250;
const HEAD_TABLE = 6;

const VENUE_COLORS = ['#00857A', '#2563eb', '#9333ea', '#c2410c', '#0891b2', '#65a30d'];

const parts = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};
const shortDate = (iso) => { const p = parts(iso); return `${p.d} ${MONTHS_FULL[p.m - 1].slice(0, 3)}`; };
const rangeLabel = (m) => {
    const a = m.eventDays[0], b = m.eventDays[m.eventDays.length - 1];
    return a === b ? shortDate(a) : `${shortDate(a)} – ${shortDate(b)}`;
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
                token: m.token, venueRaw: q.venue || '', eventDateText: q.eventDate || '',
                event: q.eventName || '', quoteIds: [], refs: [], qList: [],
            });
        }
        grouped.get(key).quoteIds.push(q.id);
        grouped.get(key).refs.push(q.ref);
        grouped.get(key).qList.push({ id: q.id, ref: q.ref, pdfBlobUrl: q.pdfBlobUrl || null });
    }
    const lineMap = await getQuotationLinesBulk([...grouped.values()].flatMap((g) => g.quoteIds));
    for (const g of grouped.values()) {
        const nos = g.quoteIds.flatMap((id) => (lineMap.get(id) || []).map((l) => l.itemNo)).filter(isProductionItem);
        g.singleItems = new Set(nos.filter((n) => SINGLE_STOCK_ITEM_NOS.includes(n)));
        g.itemCount = new Set(nos).size;
        // Highest quantity across the meeting's quotations, for the clash detail.
        g.qtyByItem = {};
        for (const qid of g.quoteIds) for (const l of (lineMap.get(qid) || [])) {
            g.qtyByItem[l.itemNo] = Math.max(g.qtyByItem[l.itemNo] || 0, l.qty);
        }
    }

    const plan = buildPlan([...grouped.values()]);
    const todayIso = new Date().toISOString().slice(0, 10);
    const rows = plan.meetings.filter((m) => (m.removalEnd || m.eventDays[m.eventDays.length - 1]) >= todayIso);
    if (!rows.length) return <Empty />;

    // --- axis: start at today so the chart opens on what matters now ---
    const earliest = rows.map((m) => m.setupDay || m.eventDays[0]).reduce((a, b) => (a < b ? a : b));
    const from = earliest < todayIso ? earliest : todayIso;
    const to = rows.map((m) => m.removalEnd || m.eventDays[m.eventDays.length - 1]).reduce((a, b) => (a > b ? a : b));
    const span = daysBetween(from, to) + 1;
    const allDays = Array.from({ length: span }, (_, i) => isoAddDays(from, i));
    const idx = new Map(allDays.map((d, i) => [d, i]));
    const col = (iso) => (idx.has(iso) ? idx.get(iso) : 0);

    // --- per-day pressures ---
    const pressure = new Map();   // separate builds needed
    const crew = new Map();       // setup / removal jobs happening
    const tableAt = new Map();    // where the one Head Table is
    for (const d of allDays) {
        const live = rows.filter((m) => m.eventDays.includes(d) && m.singleItems.size);
        const known = new Set(live.filter((m) => m.venue !== VENUE_UNKNOWN).map((m) => m.venue));
        pressure.set(d, known.size + live.filter((m) => m.venue === VENUE_UNKNOWN).length);

        crew.set(d, rows.filter((m) => m.setupDay === d).length + rows.filter((m) => m.removalEnd === d).length);

        const holders = rows.filter((m) => m.singleItems.has(HEAD_TABLE)
            && d >= (m.setupDay || m.eventDays[0]) && d <= (m.removalEnd || m.eventDays[m.eventDays.length - 1]));
        if (holders.length) tableAt.set(d, holders);
    }

    const venues = [...new Set(rows.map((m) => m.venue))]
        .sort((a, b) => (a === VENUE_UNKNOWN ? 1 : b === VENUE_UNKNOWN ? -1 : a.localeCompare(b)));
    const colorOf = new Map(venues.map((v, i) => [v, v === VENUE_UNKNOWN ? '#dc2626' : VENUE_COLORS[i % VENUE_COLORS.length]]));
    const lanes = venues.map((v) => ({
        venue: v, color: colorOf.get(v),
        items: rows.filter((m) => m.venue === v).sort((a, b) => a.eventDays[0].localeCompare(b.eventDays[0])),
    }));
    // Each meeting draws at most one "stays up" link, back to the predecessor it
    // actually inherits the build from — the nearest one. Three meetings in a row
    // at one venue produce three chain pairs but only two links, which is right:
    // the build passes along the run rather than from every earlier meeting.
    const chainTo = new Map();
    for (const c of plan.chains) {
        const held = chainTo.get(c.to.key);
        if (!held || c.gap < held.gap) chainTo.set(c.to.key, c);
    }

    const monthSpans = [];
    for (const d of allDays) {
        const { y, m } = parts(d);
        const label = `${MONTHS_FULL[m - 1]} ${y}`;
        if (!monthSpans.length || monthSpans[monthSpans.length - 1].label !== label) monthSpans.push({ label, n: 0 });
        monthSpans[monthSpans.length - 1].n += 1;
    }

    const grid = { display: 'grid', gridTemplateColumns: `repeat(${span}, ${COL}px)`, width: span * COL };
    const shortfall = Object.values(plan.sets).filter((s) => s.needed > 1);
    const next = rows.slice().sort((a, b) => a.eventDays[0].localeCompare(b.eventDays[0]))[0];
    const daysToNext = next ? daysBetween(todayIso, next.eventDays[0]) : null;

    // ---- serialisable payload for the interactive calendar ----
    // Titles and plate/flag selections ride along so clicking a day answers
    // "what exactly do we deliver" without opening the production page.
    const overrides = await getProductionAssignments(rows.flatMap((m) => m.quoteIds));
    const calMeetings = {};
    for (const m of rows) {
        const items = [];
        const seen = new Set();
        for (const qid of m.quoteIds) {
            for (const l of (lineMap.get(qid) || [])) {
                if (!isProductionItem(l.itemNo)) continue;
                const dedup = `${qid}:${l.itemNo}`;
                if (seen.has(dedup)) continue;
                seen.add(dedup);
                const ov = overrides.get(`${qid}:${l.itemNo}`) || {};
                items.push({
                    no: l.itemNo, name: l.nameSnapshot, qty: l.qty,
                    oneOnly: SINGLE_STOCK_ITEM_NOS.includes(l.itemNo),
                    img: itemImage(l.itemNo) || null,
                    title: ov.title || null,
                    selections: ov.selections && ov.selections.length ? ov.selections : null,
                });
            }
        }
        items.sort((a, b) => a.no - b.no);
        calMeetings[m.key] = {
            ministryId: m.ministryId, ministry: m.ministry, event: m.event, lpo: m.lpo,
            venue: m.venue, color: colorOf.get(m.venue), refs: [...new Set(m.refs)],
            range: rangeLabel(m), setupDay: m.setupDay,
            removalStart: m.removalStart, removalEnd: m.removalEnd, items,
            // Stored quotation PDFs, viewable straight from the day panel. The
            // token in the URL is the access, same links the portal itself uses.
            pdfs: m.qList.filter((x) => x.pdfBlobUrl).map((x) => ({
                ref: x.ref,
                url: `/q/${m.token}/quote/${x.id}/pdf?v=${encodeURIComponent((x.pdfBlobUrl || '').split('/').pop() || x.id)}`,
            })),
        };
    }
    const calDays = {};
    const addCal = (iso, k, phase) => {
        if (!calDays[iso]) {
            calDays[iso] = {
                entries: [], pressure: pressure.get(iso) || 0, crew: crew.get(iso) || 0,
                tableVenues: [...new Set((tableAt.get(iso) || []).map((m) => m.venue))],
            };
        }
        calDays[iso].entries.push({ k, phase });
    };
    for (const m of rows) {
        if (m.setupDay) addCal(m.setupDay, m.key, 'setup');
        for (const d of m.eventDays) addCal(d, m.key, 'event');
        if (m.removalEnd) addCal(m.removalEnd, m.key, 'removal');
    }
    // setup first, then event, then removal within a day
    const phaseOrder = { setup: 0, event: 1, removal: 2 };
    for (const d of Object.values(calDays)) d.entries.sort((a, b) => phaseOrder[a.phase] - phaseOrder[b.phase]);
    const monthKeys = [];
    for (const d of allDays) {
        const p = parts(d);
        if (!monthKeys.some((k) => k.y === p.y && k.m === p.m)) monthKeys.push({ y: p.y, m: p.m });
    }
    const firstEventIso = next ? next.eventDays[0] : todayIso;

    // ---- season inventory: peak for reusables, total for consumables ----
    const namesByNo = new Map();
    for (const lines of lineMap.values()) for (const l of lines) if (!namesByNo.has(l.itemNo)) namesByNo.set(l.itemNo, l.nameSnapshot);
    const inventory = computeInventory(rows, namesByNo);
    const reusables = inventory.filter((i) => i.kind === 'reusable');
    const consumables = inventory.filter((i) => i.kind === 'consumable');

    // background wash for a day column, reused by every row so columns line up
    const wash = (d) => {
        const p = parts(d);
        if ((pressure.get(d) || 0) > 1) return '#fee2e2';
        if (p.wd === 5 || p.wd === 6) return '#fafcfc';
        return 'transparent';
    };
    const weekEdge = (d) => (parts(d).wd === 0 ? '1px solid #eef2f3' : 'none');

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#4D4D4F' }}>
            <style>{`@media print { .no-print { display:none !important } .p-card { break-inside: avoid; box-shadow:none !important; border:1px solid #ddd } body { background:#fff } }`}</style>

            <header className="no-print" style={{ borderBottom: '4px solid #00C7B1', background: '#fff' }}>
                <div style={{ maxWidth: 1500, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px' }}>
                    <img src="/brand/pico-logo.png" alt="PICO" style={{ height: 40 }} />
                    <img src="/brand/bahrain-emblem.png" alt="Kingdom of Bahrain" style={{ height: 44 }} />
                </div>
                <div style={{ maxWidth: 1500, margin: '0 auto', padding: '0 20px 12px' }}>
                    <Link href="/quotations" style={{ fontSize: 12, color: '#00857A' }}>← Admin dashboard</Link>
                    <h1 style={{ fontSize: 20, fontWeight: 600, margin: '4px 0 0' }}>Season plan</h1>
                    <p style={{ fontSize: 13, color: '#75787B', margin: '2px 0 0' }}>
                        Grouped by venue. Bars joined by a dashed line stay standing between meetings.
                    </p>
                </div>
            </header>

            <main style={{ maxWidth: 1500, margin: '0 auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                <section className="p-card" style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 10, padding: 12 }}>
                    <Stat n={rows.length} label="meetings ahead" />
                    <Stat n={daysToNext === 0 ? 'today' : `${daysToNext}d`} label={`until ${next.ministry.split(' ').slice(0, 3).join(' ')}`} tone={daysToNext <= 7 ? 'warn' : null} />
                    <Stat n={venues.filter((v) => v !== VENUE_UNKNOWN).length} label="venues" />
                    <Stat n={rows.filter((m) => !m.lpo).length} label="waiting on LPO" tone={rows.some((m) => !m.lpo) ? 'warn' : 'ok'} />
                    <Stat n={rows.filter((m) => m.venue === VENUE_UNKNOWN).length} label="venue not set" tone={rows.some((m) => m.venue === VENUE_UNKNOWN) ? 'danger' : 'ok'} />
                    <Stat n={[...pressure.values()].filter((n) => n > 1).length} label="days needing 2 builds" tone={[...pressure.values()].some((n) => n > 1) ? 'danger' : 'ok'} />
                    <Stat n={plan.chains.length} label="builds that stay up" tone="ok" />
                </section>

                <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11.5, alignItems: 'center' }}>
                    <Key sw={<i style={{ width: 22, height: 11, borderRadius: 2, background: '#00857A', display: 'inline-block' }} />} t="Event day" />
                    <Key sw={<i style={{ width: 22, height: 11, borderRadius: 2, background: '#00857A', opacity: 0.26, display: 'inline-block' }} />} t="Setup / removal" />
                    <Key sw={<i style={{ width: 22, height: 0, borderTop: '2px dashed #00857A', display: 'inline-block' }} />} t="Stays standing" />
                    <Key sw={<i style={{ width: 10, height: 14, background: '#fee2e2', border: '1px solid #fecaca', display: 'inline-block' }} />} t="Needs 2 builds" />
                    <Key sw={<i style={{ width: 2, height: 14, background: '#dc2626', display: 'inline-block' }} />} t="Today" />
                </div>

                <section className="p-card" style={{ ...card, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', overflowX: 'auto' }}>
                        {/* ---- sticky labels ---- */}
                        <div style={{ flexShrink: 0, width: LABEL_W, position: 'sticky', left: 0, zIndex: 3, background: '#fff', borderRight: '2px solid #e2e8f0' }}>
                            <div style={{ height: 44, borderBottom: '1px solid #e2e8f0' }} />
                            <TrackLabel text="BUILDS NEEDED" hint="separate sets that must exist that day" />
                            <TrackLabel text="SETUP / REMOVAL JOBS" hint="crews working that day" />
                            <TrackLabel text="HEAD TABLE" hint="where the one custom table is" />
                            {lanes.map((lane) => (
                                <div key={lane.venue}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', background: '#f1f5f9', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
                                        <span style={{ width: 10, height: 10, borderRadius: 2, background: lane.color, flexShrink: 0 }} />
                                        <span style={{ fontSize: 12, fontWeight: 700, color: lane.venue === VENUE_UNKNOWN ? '#dc2626' : '#22282B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lane.venue}</span>
                                        <span style={{ marginLeft: 'auto', fontSize: 9.5, color: '#94a3b8' }}>{lane.items.length}</span>
                                    </div>
                                    {lane.items.map((m) => (
                                        <div key={m.key} style={{ height: ROW, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 10px', borderBottom: '1px solid #f8fafc' }}>
                                            <Link href={`/quotations/ministry/${m.ministryId}`} title={m.ministry}
                                                style={{ fontSize: 11.5, color: '#22282B', textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.ministry}</Link>
                                            <span style={{ fontSize: 9.5, color: '#94a3b8', display: 'flex', gap: 5, alignItems: 'center' }}>
                                                {m.itemCount} items
                                                {!m.lpo ? <b style={{ color: '#9a3412' }}>· NO LPO</b> : <b style={{ color: '#15803d' }}>· LPO</b>}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>

                        {/* ---- chart ---- */}
                        <div style={{ flexShrink: 0, position: 'relative' }}>
                            {/* today marker spans the whole chart */}
                            {idx.has(todayIso) ? (
                                <div style={{ position: 'absolute', top: 0, bottom: 0, left: col(todayIso) * COL, width: 2, background: '#dc2626', zIndex: 2, pointerEvents: 'none' }} />
                            ) : null}

                            <div style={{ display: 'grid', gridTemplateColumns: monthSpans.map((s) => `${s.n * COL}px`).join(' '), height: 22, borderBottom: '1px solid #f1f5f9' }}>
                                {monthSpans.map((s) => (
                                    <div key={s.label} style={{ fontSize: 10.5, fontWeight: 700, color: '#22282B', padding: '4px 0 0 6px', borderLeft: '1px solid #e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden' }}>{s.label}</div>
                                ))}
                            </div>
                            <div style={{ ...grid, height: 22, borderBottom: '1px solid #e2e8f0' }}>
                                {allDays.map((d) => {
                                    const p = parts(d);
                                    return (
                                        <div key={d} title={d} style={{ fontSize: 9, textAlign: 'center', paddingTop: 5, background: wash(d), borderLeft: weekEdge(d), color: d === todayIso ? '#dc2626' : (p.wd === 5 || p.wd === 6) ? '#cbd5e1' : '#94a3b8', fontWeight: d === todayIso ? 700 : 400 }}>{p.d}</div>
                                    );
                                })}
                            </div>

                            <Track days={allDays} grid={grid} wash={wash} weekEdge={weekEdge}
                                value={(d) => pressure.get(d) || 0}
                                render={(n) => n > 1 ? { text: String(n), color: '#dc2626', bg: '#fee2e2' } : n === 1 ? { text: '·', color: '#cbd5e1' } : null} />

                            <Track days={allDays} grid={grid} wash={wash} weekEdge={weekEdge}
                                value={(d) => crew.get(d) || 0}
                                render={(n) => n > 1 ? { text: String(n), color: '#9a3412', bg: '#fff7ed' } : n === 1 ? { text: '1', color: '#cbd5e1' } : null} />

                            {/* head table occupancy */}
                            <div style={{ ...grid, height: 20, borderBottom: '1px solid #e2e8f0' }}>
                                {allDays.map((d) => {
                                    const h = tableAt.get(d) || [];
                                    const clash = new Set(h.map((m) => m.venue)).size > 1;
                                    return (
                                        <div key={d} title={h.length ? `Head Table at ${[...new Set(h.map((m) => m.venue))].join(' + ')}` : ''}
                                            style={{ background: wash(d), borderLeft: weekEdge(d), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {h.length ? <span style={{ width: '100%', height: 8, background: clash ? '#dc2626' : colorOf.get(h[0].venue), opacity: clash ? 1 : 0.75 }} /> : null}
                                        </div>
                                    );
                                })}
                            </div>

                            {lanes.map((lane) => (
                                <div key={lane.venue}>
                                    <div style={{ ...grid, height: 28, background: '#f1f5f9', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }} />
                                    {lane.items.map((m) => {
                                        const s = m.setupDay || m.eventDays[0];
                                        const e = m.removalEnd || m.eventDays[m.eventDays.length - 1];
                                        const evS = m.eventDays[0], evE = m.eventDays[m.eventDays.length - 1];
                                        const chain = chainTo.get(m.key);
                                        const wide = m.eventDays.length >= 3;
                                        const tip = `${m.ministry}\n${m.event || ''}\n${rangeLabel(m)} · ${m.eventDays.length} day(s)\nVenue: ${m.venue}\nSetup ${s} · Removal ${e}\n${m.itemCount} items${m.lpo ? '' : '\nLPO NOT RECEIVED'}`;
                                        return (
                                            <div key={m.key} style={{ ...grid, height: ROW, borderBottom: '1px solid #f8fafc' }}>
                                                {allDays.map((d) => <div key={d} style={{ background: wash(d), borderLeft: weekEdge(d) }} />)}

                                                {/* stays-standing link back to the previous meeting here */}
                                                {chain ? (
                                                    <div title={`Build stays up from ${chain.from.ministry} — ${chain.items.length} items`}
                                                        style={{
                                                            gridColumn: `${col(chain.from.eventDays[chain.from.eventDays.length - 1]) + 1} / ${col(evS) + 2}`,
                                                            gridRow: 1, alignSelf: 'center', height: 0,
                                                            borderTop: `2px dashed ${lane.color}`, opacity: 0.85,
                                                        }} />
                                                ) : null}

                                                <div style={{ gridColumn: `${col(s) + 1} / ${col(e) + 2}`, gridRow: 1, alignSelf: 'center', height: 18, borderRadius: 4, background: lane.color, opacity: 0.22 }} />

                                                <div title={tip} style={{
                                                    gridColumn: `${col(evS) + 1} / ${col(evE) + 2}`, gridRow: 1, alignSelf: 'center',
                                                    height: 20, borderRadius: 4, background: lane.color, display: 'flex', alignItems: 'center',
                                                    padding: '0 5px', boxShadow: '0 1px 3px rgba(0,0,0,0.22)', overflow: 'hidden',
                                                }}>
                                                    {wide ? (
                                                        <span style={{ fontSize: 9.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{m.eventDays.length} days</span>
                                                    ) : null}
                                                </div>

                                                {/* detail sits after the bar and is allowed to overflow its cell */}
                                                <div style={{ gridColumn: `${col(evE) + 2} / ${span + 1}`, gridRow: 1, alignSelf: 'center', paddingLeft: 6, whiteSpace: 'nowrap', overflow: 'visible', pointerEvents: 'none' }}>
                                                    <span style={{ fontSize: 9.5, color: '#64748b' }}>
                                                        {rangeLabel(m)}{m.eventDays.length > 1 ? ` · ${m.eventDays.length}d` : ''}
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

                {/* ---- season inventory: what to have ready, counted honestly ---- */}
                <section className="p-card" style={{ ...card, overflow: 'hidden' }}>
                    <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0, padding: '11px 16px', borderBottom: '1px solid #f1f5f9', color: '#22282B' }}>
                        📦 Inventory — have this much ready for the season
                        <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 11, color: '#94a3b8' }}>
                            reusables = the most needed on any one day (kept builds and moved sets count once) · stationery = total consumed across all meetings
                        </span>
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 0 }}>
                        <div style={{ borderRight: '1px solid #f1f5f9' }}>
                            <h3 style={{ margin: 0, padding: '8px 16px 4px', fontSize: 11, fontWeight: 700, color: '#00857A' }}>REUSABLE — peak on one day</h3>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                                <tbody>
                                    {reusables.map((i) => (
                                        <tr key={i.no} style={{ borderTop: '1px solid #f8fafc', background: i.oneOnly && i.needed > 1 ? '#fef2f2' : 'transparent' }}>
                                            <td style={{ padding: "4px 8px 4px 16px", color: "#94a3b8", width: 30 }}>{i.no > 899 ? "+" : i.no}</td>
                                            <td style={{ padding: '4px 8px', color: '#22282B' }}>
                                                {i.name}
                                                {i.oneOnly ? <span style={{ marginLeft: 5, borderRadius: 3, background: '#f1f5f9', padding: '0 4px', fontSize: 8.5, fontWeight: 700, color: '#475569' }}>ONE ONLY</span> : null}
                                            </td>
                                            <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, width: 46, color: i.oneOnly && i.needed > 1 ? '#dc2626' : '#22282B' }}>{i.needed}</td>
                                            <td title={i.peakUsers.map((u) => `${u.ministry} ×${u.qty}`).join('  +  ')}
                                                style={{ padding: '4px 16px 4px 8px', color: '#94a3b8', fontSize: 10, whiteSpace: 'nowrap' }}>
                                                peak {shortDate(i.peakDay)}{i.peakUsers.length > 1 ? ` · ${i.peakUsers.length} meetings` : ''}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div>
                            <h3 style={{ margin: 0, padding: '8px 16px 4px', fontSize: 11, fontWeight: 700, color: '#9a3412' }}>CONSUMED — total across the season</h3>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                                <tbody>
                                    {consumables.map((i) => (
                                        <tr key={i.no} style={{ borderTop: '1px solid #f8fafc' }}>
                                            <td style={{ padding: "4px 8px 4px 16px", color: "#94a3b8", width: 30 }}>{i.no > 899 ? "+" : i.no}</td>
                                            <td style={{ padding: '4px 8px', color: '#22282B' }}>{i.name}</td>
                                            <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, width: 60 }}>{i.needed.toLocaleString()}</td>
                                            <td style={{ padding: '4px 16px 4px 8px', color: '#94a3b8', fontSize: 10, whiteSpace: 'nowrap' }}>{i.meetings} meeting{i.meetings === 1 ? '' : 's'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                {/* ---- interactive calendar: click a day for the full picture ---- */}
                <section>
                    <h2 style={{ fontSize: 14, fontWeight: 700, color: '#22282B', margin: '6px 0 10px' }}>
                        📅 Calendar <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 12 }}>— click any day to see its meetings, items and crew load</span>
                    </h2>
                    <PlanCalendar meetings={calMeetings} days={calDays} monthKeys={monthKeys} todayIso={todayIso} firstEventIso={firstEventIso} />
                </section>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14 }}>
                    <Panel title={shortfall.length ? '⚠ Build a second set' : '✓ Current stock covers the season'}>
                        {shortfall.length === 0
                            ? <li style={{ fontSize: 11.5, color: '#15803d' }}>No day needs two of any one-only item.</li>
                            : shortfall.map((s) => (
                                <li key={s.itemNo} style={{ borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', padding: '7px 10px', fontSize: 11.5 }}>
                                    <strong style={{ color: '#22282B' }}>{s.label}</strong>
                                    <span style={{ color: '#dc2626', fontWeight: 700 }}> — {s.needed} needed by {shortDate(s.firstNeededBy)}</span>
                                    {/* every day the shortage bites, and who is driving it */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                                        {s.clashDays.map((cd) => (
                                            <div key={cd.iso} style={{ fontSize: 10.5, color: '#4D4D4F' }}>
                                                <b style={{ color: '#dc2626' }}>{shortDate(cd.iso)}</b>{' — '}
                                                {cd.needs.map((n, j) => (
                                                    <span key={j}>
                                                        {j > 0 ? '  +  ' : ''}
                                                        {n.ministry.split(' ').slice(0, 4).join(' ')}
                                                        <span style={{ color: n.venue === VENUE_UNKNOWN ? '#dc2626' : '#75787B' }}> @ {n.venue}</span>
                                                        <span style={{ color: '#94a3b8' }}> (×{n.qty})</span>
                                                    </span>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                    {s.clashDays.some((cd) => cd.resolvable) ? (
                                        <div style={{ marginTop: 4, fontSize: 10.5, fontWeight: 600, color: '#15803d' }}>
                                            💡 One side&apos;s venue is not set — confirming it at the other meeting&apos;s hotel removes that day without building anything.
                                        </div>
                                    ) : null}
                                </li>
                            ))}
                    </Panel>

                    <Panel title="✓ Leave standing — do not dismantle">
                        {plan.chains.length === 0
                            ? <li style={{ fontSize: 11.5, color: '#75787B' }}>No back-to-back meetings share a venue.</li>
                            : plan.chains.map((c, i) => {
                                // The structure stays, but everything carrying the meeting's
                                // name or flags must still change hands between them.
                                const toItems = (calMeetings[c.to.key] || {}).items || [];
                                const rebrand = [];
                                if (toItems.some((it) => it.no === 1 || it.no === 2)) rebrand.push('backdrop graphics & meeting title');
                                for (const [no, label] of [[41, 'title boards'], [26, 'name plates'], [12, 'platform flags'], [14, 'table-top flags']]) {
                                    const it = toItems.find((x) => x.no === no);
                                    if (it) rebrand.push(`${label} ×${it.qty}`);
                                }
                                return (
                                    <li key={i} style={{ borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '7px 10px', fontSize: 11.5 }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'baseline' }}>
                                            <strong style={{ color: '#15803d' }}>{c.venue}</strong>
                                            <span style={{ color: '#75787B', fontSize: 10.5 }}>
                                                {shortDate(c.from.eventDays[c.from.eventDays.length - 1])} → {shortDate(c.to.eventDays[0])} · {c.gap} day{c.gap === 1 ? '' : 's'} between
                                            </span>
                                        </div>
                                        <div style={{ color: '#22282B' }}>{c.from.ministry} → {c.to.ministry}</div>
                                        <div style={{ color: '#4D4D4F', fontSize: 10.5, marginTop: 3 }}>
                                            <b style={{ color: '#15803d' }}>Stays up:</b> {c.items.join(', ')}
                                        </div>
                                        {rebrand.length ? (
                                            <div style={{ color: '#9a3412', fontSize: 10.5, marginTop: 2 }}>
                                                <b>Still changes for {c.to.ministry.split(' ').slice(0, 3).join(' ')}:</b> {rebrand.join(' · ')}
                                            </div>
                                        ) : null}
                                    </li>
                                );
                            })}
                    </Panel>

                    <Panel title="Next steps">
                        {plan.actions.slice(0, 12).map((a, i) => (
                            <li key={i} style={{ display: 'flex', gap: 8, fontSize: 11.5, alignItems: 'flex-start' }}>
                                <span style={{ flexShrink: 0, fontWeight: 700, minWidth: 62, color: a.level === 'danger' ? '#dc2626' : a.level === 'warn' ? '#9a3412' : '#94a3b8' }}>{a.by ? shortDate(a.by) : '—'}</span>
                                <span style={{ color: '#22282B' }}>{a.text}</span>
                            </li>
                        ))}
                    </Panel>
                </div>
            </main>
        </div>
    );
}

/* one horizontal summary strip above the venue lanes */
function Track({ days, grid, wash, weekEdge, value, render }) {
    return (
        <div style={{ ...grid, height: 20, borderBottom: '1px solid #f1f5f9' }}>
            {days.map((d) => {
                const out = render(value(d));
                return (
                    <div key={d} title={out ? `${d}: ${value(d)}` : ''}
                        style={{ fontSize: 9.5, fontWeight: 700, textAlign: 'center', paddingTop: 3, color: out ? out.color : 'transparent', background: out && out.bg ? out.bg : wash(d), borderLeft: weekEdge(d) }}>
                        {out ? out.text : ''}
                    </div>
                );
            })}
        </div>
    );
}
function TrackLabel({ text, hint }) {
    return (
        <div title={hint} style={{ height: 20, borderBottom: '1px solid #f1f5f9', fontSize: 8.5, fontWeight: 700, color: '#94a3b8', padding: '4px 10px 0', whiteSpace: 'nowrap', overflow: 'hidden' }}>{text}</div>
    );
}
function Panel({ title, children }) {
    return (
        <section className="p-card" style={{ ...card, overflow: 'hidden' }}>
            <h2 style={{ fontSize: 12.5, fontWeight: 700, margin: 0, padding: '10px 14px', borderBottom: '1px solid #f1f5f9', color: '#22282B' }}>{title}</h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>{children}</ul>
        </section>
    );
}
function Stat({ n, label, tone }) {
    const fg = tone === 'danger' ? '#dc2626' : tone === 'warn' ? '#9a3412' : tone === 'ok' ? '#15803d' : '#00857A';
    return (
        <div style={{ flex: '1 1 140px', borderRadius: 8, border: '1px solid #e2e8f0', padding: '8px 12px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: fg, lineHeight: 1.15 }}>{n}</div>
            <div style={{ fontSize: 10.5, color: '#75787B' }}>{label}</div>
        </div>
    );
}
function Key({ sw, t }) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{sw}<span>{t}</span></span>;
}
function Empty() {
    return <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'grid', placeItems: 'center', color: '#75787B' }}><p style={{ fontSize: 14 }}>No upcoming meetings with a readable date.</p></div>;
}
