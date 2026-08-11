import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAdmin } from '@/lib/ministry/auth';
import { getAllMinistries, getRecentQuotations, getQuotationLinesBulk } from '@/lib/ministry/queries';
import { SINGLE_STOCK_ITEM_NOS, isProductionItem, MONTHS_FULL } from '@/lib/ministry/production';
import { buildPlan, fmtRange, PHASE } from '@/lib/ministry/plan';
import { VENUE_UNKNOWN } from '@/lib/ministry/venues';

export const dynamic = 'force-dynamic';

const card = { background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' };
const LEVEL = {
    danger: { bg: '#fef2f2', br: '#fecaca', fg: '#dc2626' },
    warn: { bg: '#fff7ed', br: '#fed7aa', fg: '#9a3412' },
    info: { bg: '#f8fafc', br: '#e2e8f0', fg: '#475569' },
};
const PHASE_STYLE = {
    setup: { bg: '#fff7ed', fg: '#9a3412', label: 'SETUP' },
    event: { bg: '#f0fdfa', fg: '#00857A', label: 'EVENT' },
    removal: { bg: '#f1f5f9', fg: '#475569', label: 'REMOVAL' },
};

const fmtDay = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return {
        day: dt.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
        date: `${d} ${MONTHS_FULL[m - 1].slice(0, 3)}`,
        month: `${MONTHS_FULL[m - 1]} ${y}`,
    };
};

export default async function PlanPage() {
    if (!isAdmin()) notFound();

    const [ministries, quotes] = await Promise.all([getAllMinistries(), getRecentQuotations(300)]);
    const byId = new Map(ministries.map((m) => [m.id, m]));

    // One meeting per ministry + event date; a meeting may carry several quotations.
    const grouped = new Map();
    for (const q of quotes) {
        const m = byId.get(q.ministryId);
        if (!m) continue;
        const key = `${q.ministryId}|${q.eventDate || ''}`;
        if (!grouped.has(key)) {
            grouped.set(key, {
                key, ministryId: m.id, ministry: m.name, lpo: Boolean(m.lpoReceived),
                venueRaw: q.venue || '', eventDateText: q.eventDate || '', refs: [], quoteIds: [],
            });
        }
        grouped.get(key).refs.push(q.ref);
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
    const upcomingDays = plan.days.filter((d) => d.iso >= todayIso);
    const shortfall = Object.values(plan.sets).filter((s) => s.needed > 1);

    // Group the day strip by month for reading.
    const months = [];
    for (const d of upcomingDays) {
        const label = fmtDay(d.iso).month;
        if (!months.length || months[months.length - 1].label !== label) months.push({ label, days: [] });
        months[months.length - 1].days.push(d);
    }

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#4D4D4F' }}>
            <style>{`@media print { .no-print { display: none !important } .p-card { break-inside: avoid; box-shadow: none !important; border: 1px solid #ddd } body { background: #fff } }`}</style>

            <header className="no-print" style={{ borderBottom: '4px solid #00C7B1', background: '#fff' }}>
                <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px' }}>
                    <img src="/brand/pico-logo.png" alt="PICO" style={{ height: 40 }} />
                    <img src="/brand/bahrain-emblem.png" alt="Kingdom of Bahrain" style={{ height: 44 }} />
                </div>
                <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 20px 12px' }}>
                    <Link href="/quotations" style={{ fontSize: 12, color: '#00857A' }}>← Admin dashboard</Link>
                    <h1 style={{ fontSize: 20, fontWeight: 600, margin: '4px 0 0' }}>Season plan</h1>
                    <p style={{ fontSize: 13, color: '#75787B', margin: '2px 0 0' }}>
                        Every meeting on one line, what each needs, and where the one-only items collide.
                    </p>
                </div>
            </header>

            <main style={{ maxWidth: 1080, margin: '0 auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* ---- how many sets you actually need ---- */}
                <section className="p-card" style={{ ...card, overflow: 'hidden' }}>
                    <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0, padding: '11px 16px', borderBottom: '1px solid #f1f5f9', color: '#22282B' }}>
                        Sets required — PICO owns one of each
                    </h2>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
                        {Object.values(plan.sets).map((s) => (
                            <div key={s.itemNo} style={{ flex: '1 1 210px', borderRadius: 8, border: `1px solid ${s.needed > 1 ? '#fecaca' : '#e2e8f0'}`, background: s.needed > 1 ? '#fef2f2' : '#fff', padding: '8px 11px' }}>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#22282B' }}>{s.label}</div>
                                <div style={{ fontSize: 11.5, color: s.needed > 1 ? '#dc2626' : '#15803d', fontWeight: 700, marginTop: 2 }}>
                                    {s.needed} set{s.needed > 1 ? 's' : ''} needed{s.needed > 1 ? ` · by ${s.firstNeededBy}` : ' · current stock is enough'}
                                </div>
                                {s.needed > 1 ? <div style={{ fontSize: 10.5, color: '#9a3412', marginTop: 2 }}>{s.venues.join(' + ')}</div> : null}
                            </div>
                        ))}
                    </div>
                </section>

                {/* ---- next steps ---- */}
                {plan.actions.length ? (
                    <section className="p-card" style={{ ...card, overflow: 'hidden' }}>
                        <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0, padding: '11px 16px', borderBottom: '1px solid #f1f5f9', color: '#22282B' }}>
                            Next steps <span style={{ fontWeight: 400, color: '#94a3b8' }}>· soonest first</span>
                        </h2>
                        <ul style={{ listStyle: 'none', margin: 0, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {plan.actions.map((a, i) => {
                                const s = LEVEL[a.level] || LEVEL.info;
                                return (
                                    <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', borderRadius: 6, background: s.bg, border: `1px solid ${s.br}`, padding: '6px 10px' }}>
                                        <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: s.fg, minWidth: 78 }}>{a.by || '—'}</span>
                                        <span style={{ fontSize: 11.5, color: '#22282B' }}>{a.text}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ) : null}

                {/* ---- builds that can stay standing ---- */}
                {plan.chains.length ? (
                    <section className="p-card" style={{ ...card, overflow: 'hidden' }}>
                        <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0, padding: '11px 16px', borderBottom: '1px solid #f1f5f9', color: '#22282B' }}>
                            Keep in place <span style={{ fontWeight: 400, color: '#94a3b8' }}>· same venue, back to back — do not dismantle</span>
                        </h2>
                        <ul style={{ listStyle: 'none', margin: 0, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {plan.chains.map((c, i) => (
                                <li key={i} style={{ borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '7px 11px' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>
                                        {c.venue} · {c.from.eventDays[c.from.eventDays.length - 1]} → {c.to.eventDays[0]} ({c.gap} day{c.gap === 1 ? '' : 's'} between)
                                    </div>
                                    <div style={{ fontSize: 11.5, color: '#22282B', marginTop: 2 }}>{c.from.ministry} → {c.to.ministry}</div>
                                    <div style={{ fontSize: 10.5, color: '#4D4D4F', marginTop: 2 }}>Stays up: {c.items.join(', ')}</div>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {/* ---- the timeline ---- */}
                {months.map((mo) => (
                    <section key={mo.label} className="p-card" style={{ ...card, overflow: 'hidden' }}>
                        <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0, padding: '11px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', color: '#22282B' }}>{mo.label}</h2>
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                            {mo.days.map((d) => {
                                const eventsToday = d.entries.filter((e) => e.phase === 'event');
                                const venues = [...new Set(eventsToday.map((e) => e.m.venue))];
                                const clash = venues.length > 1 || eventsToday.some((e) => e.m.venue === VENUE_UNKNOWN) && eventsToday.length > 1;
                                const f = fmtDay(d.iso);
                                return (
                                    <li key={d.iso} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 16px', borderTop: '1px solid #f8fafc', background: clash ? '#fef2f2' : 'transparent' }}>
                                        <span style={{ flexShrink: 0, width: 62 }}>
                                            <span style={{ display: 'block', fontSize: 11, color: '#94a3b8' }}>{f.day}</span>
                                            <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#22282B' }}>{f.date}</span>
                                        </span>
                                        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {d.entries.map((e, i) => {
                                                const ps = PHASE_STYLE[e.phase];
                                                return (
                                                    <span key={i} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7, fontSize: 12 }}>
                                                        <span style={{ borderRadius: 3, background: ps.bg, color: ps.fg, padding: '0 5px', fontSize: 9, fontWeight: 700, minWidth: 52, textAlign: 'center' }}>{ps.label}</span>
                                                        <Link href={`/quotations/ministry/${e.m.ministryId}`} style={{ color: '#22282B', textDecoration: 'none', fontWeight: e.phase === 'event' ? 600 : 400 }}>{e.m.ministry}</Link>
                                                        <span style={{ color: e.m.venue === VENUE_UNKNOWN ? '#dc2626' : '#75787B' }}>📍 {e.m.venue}</span>
                                                        {e.phase === 'event' ? <span style={{ color: '#94a3b8' }}>{e.m.itemCount} items</span> : null}
                                                        {!e.m.lpo ? <span style={{ borderRadius: 3, background: '#f1f5f9', padding: '0 5px', fontSize: 9, fontWeight: 700, color: '#475569' }}>NO LPO</span> : null}
                                                    </span>
                                                );
                                            })}
                                            {clash ? (
                                                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#dc2626' }}>
                                                    ⚠ {eventsToday.length} meetings at {venues.length} location{venues.length === 1 ? '' : 's'} — one-only items cannot cover both
                                                </span>
                                            ) : null}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}

                {upcomingDays.length === 0 ? (
                    <section style={{ ...card, padding: 32, textAlign: 'center', fontSize: 14, color: '#75787B' }}>No upcoming meetings with a readable date.</section>
                ) : null}
            </main>
        </div>
    );
}
