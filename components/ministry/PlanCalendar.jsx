'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import ItemThumb from './ItemThumb';

// Interactive season calendar. Click a day, see everything about it: which
// meetings touch it and in what phase, the items each needs, titles, plates,
// LPO state, and what the day demands in builds and crews.
//
// Data arrives fully serialised from the server page; this component only
// selects and presents.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const PHASE_META = {
    setup: { label: 'SETUP', bg: '#fff7ed', fg: '#9a3412', icon: '🔧' },
    event: { label: 'EVENT', bg: '#f0fdfa', fg: '#00857A', icon: '📍' },
    removal: { label: 'REMOVAL', bg: '#f1f5f9', fg: '#475569', icon: '🚚' },
};

const parts = (iso) => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }; };
const fmtLong = (iso) => {
    const p = parts(iso);
    const wd = new Date(Date.UTC(p.y, p.m - 1, p.d)).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
    return `${wd} ${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
};

export default function PlanCalendar({ meetings, days, monthKeys, todayIso, firstEventIso }) {
    const [selected, setSelected] = useState(
        days[todayIso] && days[todayIso].entries.length ? todayIso : firstEventIso,
    );

    // month grids, computed once
    const months = useMemo(() => monthKeys.map(({ y, m }) => {
        const first = new Date(Date.UTC(y, m - 1, 1));
        const lead = first.getUTCDay();
        const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const cells = [];
        for (let i = 0; i < lead; i++) cells.push(null);
        for (let d = 1; d <= count; d++) cells.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
        return { label: `${MONTHS[m - 1]} ${y}`, cells };
    }), [monthKeys]);

    const sel = selected ? days[selected] : null;
    const selEntries = sel ? sel.entries : [];
    // Union of everything to deliver across the selected day's event meetings.
    const dayItems = useMemo(() => {
        if (!sel) return [];
        const out = new Map();
        for (const e of selEntries.filter((x) => x.phase === 'event')) {
            for (const it of meetings[e.k].items) {
                const key = `${it.no}|${it.name}`;
                if (!out.has(key)) out.set(key, { ...it, from: [] });
                out.get(key).from.push(meetings[e.k].ministry);
            }
        }
        return [...out.values()].sort((a, b) => (a.no === b.no ? a.name.localeCompare(b.name) : a.no - b.no));
    }, [sel, selEntries, meetings]);

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 5fr) minmax(320px, 4fr)', gap: 14, alignItems: 'start' }}>

            {/* ============ calendar grids ============ */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {months.map((mo) => (
                    <section key={mo.label} style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                        <h3 style={{ margin: 0, padding: '9px 14px', fontSize: 13, fontWeight: 700, color: '#22282B', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>{mo.label}</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #f1f5f9' }}>
                            {WEEKDAYS.map((w, i) => (
                                <div key={w} style={{ textAlign: 'center', fontSize: 9.5, fontWeight: 700, padding: '4px 0', color: i >= 5 ? '#cbd5e1' : '#94a3b8' }}>{w}</div>
                            ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                            {mo.cells.map((iso, i) => {
                                if (!iso) return <div key={`x${i}`} />;
                                const d = days[iso];
                                const p = parts(iso);
                                const isSel = iso === selected;
                                const isToday = iso === todayIso;
                                const clash = d && d.pressure > 1;
                                const hasEvent = d && d.entries.some((e) => e.phase === 'event');
                                const weekend = p.wd === 5 || p.wd === 6;
                                return (
                                    <button key={iso} type="button" onClick={() => setSelected(iso)}
                                        style={{
                                            minHeight: 52, padding: '3px 4px 4px', border: 'none', cursor: 'pointer', textAlign: 'left',
                                            background: isSel ? '#e6fffb' : clash ? '#fef2f2' : weekend ? '#fbfdfd' : '#fff',
                                            outline: isSel ? '2px solid #00C7B1' : 'none', outlineOffset: -2,
                                            borderTop: '1px solid #f8fafc', borderRight: '1px solid #f8fafc',
                                            display: 'flex', flexDirection: 'column', gap: 2,
                                        }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{
                                                fontSize: 10.5, fontWeight: 700, lineHeight: '15px', minWidth: 15, textAlign: 'center', borderRadius: 8,
                                                color: isToday ? '#fff' : clash ? '#dc2626' : hasEvent ? '#22282B' : '#94a3b8',
                                                background: isToday ? '#dc2626' : 'transparent',
                                            }}>{p.d}</span>
                                            {clash ? <span title="needs 2 builds" style={{ fontSize: 8.5, fontWeight: 700, color: '#dc2626' }}>×2</span> : null}
                                        </span>
                                        {d ? d.entries.slice(0, 3).map((e, j) => (
                                            <span key={j} title={`${meetings[e.k].ministry} — ${PHASE_META[e.phase].label}`} style={{
                                                display: 'block', height: e.phase === 'event' ? 6 : 4, borderRadius: 2,
                                                background: meetings[e.k].color, opacity: e.phase === 'event' ? 1 : 0.35,
                                            }} />
                                        )) : null}
                                        {d && d.entries.length > 3 ? <span style={{ fontSize: 8, color: '#94a3b8' }}>+{d.entries.length - 3}</span> : null}
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>

            {/* ============ day detail ============ */}
            <div style={{ position: 'sticky', top: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {!sel || !selEntries.length ? (
                    <section style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.06)', padding: 24, textAlign: 'center' }}>
                        <p style={{ margin: 0, fontSize: 13, color: '#75787B' }}>
                            {selected ? `Nothing scheduled on ${fmtLong(selected)}.` : 'Click a day to see its detail.'}
                        </p>
                    </section>
                ) : (
                    <>
                        <section style={{ background: '#22282B', color: '#fff', borderRadius: 12, padding: '12px 16px' }}>
                            <div style={{ fontSize: 15, fontWeight: 700 }}>{fmtLong(selected)}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6, fontSize: 11 }}>
                                <span>🏗 {sel.pressure} build{sel.pressure === 1 ? '' : 's'} needed</span>
                                <span>👷 {sel.crew} setup/removal job{sel.crew === 1 ? '' : 's'}</span>
                                {sel.tableVenues.length ? <span>🪵 Head Table at {sel.tableVenues.join(' + ')}</span> : null}
                                {sel.pressure > 1 ? <span style={{ color: '#fca5a5', fontWeight: 700 }}>⚠ one-only items cannot cover this day</span> : null}
                            </div>
                        </section>

                        {selEntries.map((e) => {
                            const m = meetings[e.k];
                            const ph = PHASE_META[e.phase];
                            return (
                                <section key={`${e.k}${e.phase}`} style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>
                                        <span style={{ borderRadius: 4, background: ph.bg, color: ph.fg, padding: '1px 7px', fontSize: 9.5, fontWeight: 700 }}>{ph.icon} {ph.label}</span>
                                        <Link href={`/quotations/ministry/${m.ministryId}`} style={{ fontSize: 13, fontWeight: 700, color: '#22282B', textDecoration: 'none' }}>{m.ministry}</Link>
                                        <span style={{ marginLeft: 'auto', borderRadius: 4, padding: '1px 7px', fontSize: 9.5, fontWeight: 700, background: m.lpo ? '#f0fdf4' : '#fff7ed', color: m.lpo ? '#15803d' : '#9a3412' }}>{m.lpo ? 'LPO ✓' : 'NO LPO'}</span>
                                    </div>
                                    <div style={{ padding: '8px 14px', fontSize: 11.5, color: '#4D4D4F', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        {m.event ? <div style={{ color: '#22282B' }}>{m.event}</div> : null}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, color: '#75787B' }}>
                                            <span style={{ color: m.venue === 'Venue not set' ? '#dc2626' : '#75787B' }}>📍 {m.venue}</span>
                                            <span>📅 {m.range}</span>
                                            <span>🔧 {m.setupDay || '—'}</span>
                                            <span>🚚 {m.removalStart} → {m.removalEnd}</span>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 10.5 }}>
                                            <span style={{ color: '#94a3b8' }}>{m.refs.join(' · ')}</span>
                                            {/* the stored quotation PDFs, one link per document */}
                                            {m.pdfs && m.pdfs.map((p) => (
                                                <a key={p.url} href={p.url} target="_blank" rel="noreferrer"
                                                    style={{ borderRadius: 4, border: '1px solid #99f6e4', background: '#f0fdfa', color: '#00857A', padding: '1px 7px', fontWeight: 700, textDecoration: 'none' }}>
                                                    📄 {m.pdfs.length > 1 ? p.ref : 'Quotation'}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                    {e.phase === 'event' ? (
                                        <details style={{ borderTop: '1px solid #f8fafc' }}>
                                            <summary style={{ cursor: 'pointer', padding: '7px 14px', fontSize: 11, fontWeight: 700, color: '#00857A' }}>
                                                {m.items.length} items to deliver
                                            </summary>
                                            <ul style={{ listStyle: 'none', margin: 0, padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                {m.items.map((it) => (
                                                    <li key={`${it.no}|${it.name}`} style={{ display: 'flex', gap: 7, fontSize: 11, alignItems: 'center' }}>
                                                        <span style={{ color: '#94a3b8', minWidth: 20, textAlign: 'right' }}>{it.no > 899 ? '+' : it.no}</span>
                                                        {/* click to enlarge — ItemThumb opens its own popup, Esc/click closes */}
                                                        <span style={{ lineHeight: 0 }}><ItemThumb src={it.img} name={`${it.no}. ${it.name}`} /></span>
                                                        <span style={{ flex: 1, color: '#22282B' }}>
                                                            {it.name}
                                                            {it.oneOnly ? <b style={{ marginLeft: 5, fontSize: 8.5, color: '#475569', background: '#f1f5f9', borderRadius: 3, padding: '0 3px' }}>ONE ONLY</b> : null}
                                                            {it.title ? <span dir="rtl" style={{ display: 'block', fontSize: 10.5, color: '#00857A' }}>{it.title}</span> : null}
                                                            {it.selections && it.selections.length ? <span dir="rtl" style={{ display: 'block', fontSize: 10, color: '#75787B' }}>{it.selections.join(' · ')}</span> : null}
                                                        </span>
                                                        <b style={{ color: '#22282B' }}>{it.qty}</b>
                                                    </li>
                                                ))}
                                            </ul>
                                        </details>
                                    ) : null}
                                </section>
                            );
                        })}

                        {dayItems.length && selEntries.filter((e) => e.phase === 'event').length > 1 ? (
                            <section style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                                <h4 style={{ margin: 0, padding: '9px 14px', fontSize: 11.5, fontWeight: 700, color: '#22282B', borderBottom: '1px solid #f1f5f9' }}>
                                    Everything needed this day — both meetings combined
                                </h4>
                                <ul style={{ listStyle: 'none', margin: 0, padding: '8px 14px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {dayItems.map((it) => (
                                        <li key={`${it.no}|${it.name}`} style={{ display: 'flex', gap: 7, fontSize: 11, alignItems: 'center' }}>
                                            <span style={{ color: '#94a3b8', minWidth: 20, textAlign: 'right' }}>{it.no > 899 ? '+' : it.no}</span>
                                            <span style={{ lineHeight: 0 }}><ItemThumb src={it.img} name={`${it.no}. ${it.name}`} /></span>
                                            <span style={{ flex: 1, color: it.oneOnly && it.from.length > 1 ? '#dc2626' : '#22282B', fontWeight: it.oneOnly && it.from.length > 1 ? 700 : 400 }}>
                                                {it.name}{it.oneOnly && it.from.length > 1 ? ' — wanted by both!' : ''}
                                            </span>
                                            <span style={{ fontSize: 9.5, color: '#94a3b8' }}>{it.from.length > 1 ? 'both' : it.from[0].split(' ').slice(0, 2).join(' ')}</span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ) : null}
                    </>
                )}
            </div>
        </div>
    );
}
