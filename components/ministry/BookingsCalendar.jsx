'use client';

import { useMemo, useState } from 'react';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const GREEN = '#00857A';
const RED = '#dc2626';

// entries: [{ iso: 'YYYY-MM-DD', label: 'Ministry · ref · event', confirmed?: bool }]
// A day is "confirmed" (red) if any booking on it has LPO received.
export default function BookingsCalendar({ entries }) {
    const byDay = useMemo(() => {
        const m = new Map();
        for (const e of entries) {
            if (!m.has(e.iso)) m.set(e.iso, { labels: [], confirmed: false });
            const day = m.get(e.iso);
            day.labels.push(e.label);
            if (e.confirmed) day.confirmed = true;
        }
        return m;
    }, [entries]);

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
                        <div key={key} title={day ? day.labels.join('\n') : ''}
                            style={{ position: 'relative', height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, fontSize: 12,
                                border: isToday ? '1px solid #00C7B1' : '1px solid transparent',
                                background: bg, color: day ? '#fff' : '#334155', fontWeight: day ? 700 : 400 }}>
                            {d}
                            {day && day.labels.length > 1 ? (
                                <span style={{ position: 'absolute', top: 1, right: 2, fontSize: 8, background: '#fff', color: day.confirmed ? RED : GREEN, borderRadius: 8, padding: '0 3px', fontWeight: 700 }}>{day.labels.length}</span>
                            ) : null}
                        </div>
                    );
                })}
            </div>

            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, fontSize: 11, color: '#75787B' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: GREEN, display: 'inline-block' }} /> booked</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: RED, display: 'inline-block' }} /> confirmed (LPO)</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, border: '1px solid #00C7B1', display: 'inline-block' }} /> today</span>
            </div>

            {monthDays.length > 0 ? (
                <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, borderTop: '1px solid #f1f5f9' }}>
                    {monthDays.map((d) => {
                        const day = byDay.get(iso(d));
                        return (
                            <li key={d} style={{ padding: '7px 0', borderBottom: '1px solid #f8fafc', fontSize: 12 }}>
                                <span style={{ fontWeight: 700, color: day.confirmed ? RED : GREEN }}>{d} {MONTHS[view.m].slice(0, 3)}{day.confirmed ? ' ✓' : ''}</span>
                                <span style={{ color: '#4D4D4F' }}> — {day.labels.join('  •  ')}</span>
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
