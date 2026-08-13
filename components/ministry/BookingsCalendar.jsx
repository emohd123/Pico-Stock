'use client';

import { useMemo, useState } from 'react';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const GREEN = '#00857A';
const RED = '#dc2626';
// Side meetings carry the same purple everywhere in the portal.
const PLUM = '#7e22ce';

// entries: [{ iso, ministry, event, venue, confirmed?, side?, hall?, ref?, quoteUrl?, ministryUrl? }]
// A day is "confirmed" (red) if any booking on it has LPO received.
export default function BookingsCalendar({ entries }) {
    const byDay = useMemo(() => {
        const m = new Map();
        for (const e of entries) {
            if (!m.has(e.iso)) m.set(e.iso, { items: [], confirmed: false, mains: 0, sides: 0 });
            const day = m.get(e.iso);
            day.items.push(e);
            if (e.side) day.sides += 1; else day.mains += 1;
            if (e.confirmed) day.confirmed = true;
        }
        return m;
    }, [entries]);
    const tip = (day) => day.items
        .map((i) => [i.side ? 'SIDE:' : 'MAIN:', i.ministry, i.event, i.venue].filter(Boolean).join(' · '))
        .join('\n');

    // Open on the month of the earliest booked day (upcoming preferred), else today.
    const initial = useMemo(() => {
        const isos = [...byDay.keys()].sort();
        const todayIso = new Date().toISOString().slice(0, 10);
        const pick = isos.find((d) => d >= todayIso) || isos[isos.length - 1];
        const d = pick ? pick.split('-').map(Number) : null;
        const now = new Date();
        return d ? { y: d[0], m: d[1] - 1 } : { y: now.getFullYear(), m: now.getMonth() };
    }, [byDay]);

    const [view, setView] = useState(initial);
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);

    function move(delta) {
        let m = view.m + delta, y = view.y;
        if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
        setView({ y, m });
    }

    const first = new Date(view.y, view.m, 1).getDay();
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const iso = (d) => `${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const monthDays = [...Array(daysInMonth)].map((_, i) => i + 1).filter((d) => byDay.has(iso(d)));

    const navBtn = { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 6, width: 26, height: 26, cursor: 'pointer', color: '#475569', fontSize: 15, lineHeight: 1 };

    return (
        <div style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <button type="button" onClick={() => move(-1)} style={navBtn} aria-label="Previous month">‹</button>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{MONTHS[view.m]} {view.y}</span>
                <button type="button" onClick={() => move(1)} style={navBtn} aria-label="Next month">›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
                {WEEKDAYS.map((w) => <span key={w} style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', padding: '1px 0' }}>{w}</span>)}
                {cells.map((d, i) => {
                    if (d === null) return <span key={`e${i}`} />;
                    const key = iso(d);
                    const day = byDay.get(key);
                    const isToday = key === todayIso;
                    const bg = day ? (day.confirmed ? RED : GREEN) : '#f8fafc';
                    return (
                        <div key={key} title={day ? tip(day) : ''}
                            style={{ position: 'relative', height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, fontSize: 12,
                                border: isToday ? '1px solid #00C7B1' : '1px solid transparent',
                                background: bg, color: day ? '#fff' : '#334155', fontWeight: day ? 700 : 400 }}>
                            {d}
                            {/* Main meetings count on the right, side meetings on the
                                left in purple — a day holding both is the one that must
                                never read as a single booking. */}
                            {day && day.mains > 1 ? (
                                <span title={`${day.mains} main meetings`}
                                    style={{ position: 'absolute', top: 1, right: 2, fontSize: 8, background: '#fff', color: day.confirmed ? RED : GREEN, borderRadius: 8, padding: '0 3px', fontWeight: 700 }}>{day.mains}</span>
                            ) : null}
                            {day && day.sides > 0 ? (
                                <span title={`${day.sides} side meeting${day.sides === 1 ? '' : 's'}`}
                                    style={{ position: 'absolute', top: 1, left: 2, fontSize: 8, background: '#fff', color: PLUM, border: `1px solid ${PLUM}`, borderRadius: 8, padding: '0 3px', fontWeight: 700, lineHeight: 1.35 }}>{day.sides}</span>
                            ) : null}
                        </div>
                    );
                })}
            </div>

            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, fontSize: 11, color: '#75787B' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: GREEN, display: 'inline-block' }} /> booked</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: RED, display: 'inline-block' }} /> confirmed (LPO)</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, border: '1px solid #00C7B1', display: 'inline-block' }} /> today</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 8, background: '#fff', color: GREEN, borderRadius: 8, padding: '0 3px', fontWeight: 700, border: '1px solid #e2e8f0' }}>2</span>
                    main meetings <span style={{ color: '#cbd5e1' }}>(right)</span>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 8, background: '#fff', color: PLUM, border: `1px solid ${PLUM}`, borderRadius: 8, padding: '0 3px', fontWeight: 700 }}>1</span>
                    side meetings <span style={{ color: '#cbd5e1' }}>(left)</span>
                </span>
            </div>

            {monthDays.length > 0 ? (
                <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, borderTop: '1px solid #e8eef0' }}>
                    {monthDays.map((d) => {
                        const day = byDay.get(iso(d));
                        const accent = day.confirmed ? RED : GREEN;
                        return (
                            <li key={d} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: '1px solid #f1f5f9' }}>
                                {/* date chip */}
                                <span style={{ flexShrink: 0, width: 42, textAlign: 'center', alignSelf: 'flex-start', borderRadius: 6, background: accent, color: '#fff', padding: '3px 0', lineHeight: 1.15 }}>
                                    <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{d}</span>
                                    <span style={{ display: 'block', fontSize: 8.5, letterSpacing: 0.4, opacity: 0.9 }}>{MONTHS[view.m].slice(0, 3).toUpperCase()}</span>
                                </span>
                                {/* bookings that day */}
                                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                                    {day.items.map((it, i) => (
                                        <span key={i} style={{ display: 'block' }}>
                                            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#22282B', lineHeight: 1.3 }}>
                                                {it.ministry}
                                                {it.side ? <span style={{ marginLeft: 5, borderRadius: 3, background: '#faf5ff', border: '1px solid #e9d5ff', color: '#7e22ce', padding: '0 4px', fontSize: 8.5, fontWeight: 700 }}>SIDE</span> : null}
                                            </span>
                                            {it.event ? <span style={{ display: 'block', fontSize: 10.5, color: '#6B7A80', lineHeight: 1.3 }}>{it.event}</span> : null}
                                            {it.venue ? <span style={{ display: 'block', fontSize: 10.5, color: '#94a3b8', lineHeight: 1.3 }}>📍 {it.venue}{it.hall ? ` — ${it.hall}` : ''}</span> : null}
                                            <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 3 }}>
                                                {it.confirmed ? <span style={{ borderRadius: 4, background: '#fef2f2', color: RED, padding: '0 5px', fontSize: 9, fontWeight: 700, letterSpacing: 0.3 }}>LPO RECEIVED</span> : null}
                                                {/* straight to the document behind the booking; when no PDF was
                                                    stored, the ministry page is the honest next stop */}
                                                {it.quoteUrl ? (
                                                    <a href={it.quoteUrl} target="_blank" rel="noreferrer" title={it.ref ? `Open ${it.ref}` : 'Open the quotation'}
                                                        style={{ borderRadius: 4, border: '1px solid #99f6e4', background: '#f0fdfa', color: GREEN, padding: '0 6px', fontSize: 9.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                                        📄 View quote{it.ref ? ` · ${it.ref.split('/').pop()}` : ''}
                                                    </a>
                                                ) : it.ministryUrl ? (
                                                    <a href={it.ministryUrl} title={it.ref ? `${it.ref} — no PDF stored` : 'Open the ministry'}
                                                        style={{ borderRadius: 4, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#6B7A80', padding: '0 6px', fontSize: 9.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                                        📄 Open ministry{it.ref ? ` · ${it.ref.split('/').pop()}` : ''}
                                                    </a>
                                                ) : null}
                                            </span>
                                        </span>
                                    ))}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>No dates selected in {MONTHS[view.m]}.</p>
            )}
        </div>
    );
}
