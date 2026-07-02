'use client';

import { useMemo, useState } from 'react';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// entries: [{ iso: 'YYYY-MM-DD', label: 'Ministry · ref · event' }]
export default function BookingsCalendar({ entries }) {
    const byDay = useMemo(() => {
        const m = new Map();
        for (const e of entries) {
            if (!m.has(e.iso)) m.set(e.iso, []);
            m.get(e.iso).push(e.label);
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

    const navBtn = { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 6, width: 30, height: 30, cursor: 'pointer', color: '#475569', fontSize: 16, lineHeight: 1 };

    return (
        <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <button type="button" onClick={() => move(-1)} style={navBtn} aria-label="Previous month">‹</button>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#334155' }}>{MONTHS[view.m]} {view.y}</span>
                <button type="button" onClick={() => move(1)} style={navBtn} aria-label="Next month">›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
                {WEEKDAYS.map((w) => <span key={w} style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', padding: '2px 0' }}>{w}</span>)}
                {cells.map((d, i) => {
                    if (d === null) return <span key={`e${i}`} />;
                    const key = iso(d);
                    const booked = byDay.get(key);
                    const isToday = key === todayIso;
                    return (
                        <div key={key} title={booked ? booked.join('\n') : ''}
                            style={{ position: 'relative', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, fontSize: 14,
                                border: isToday ? '1px solid #00C7B1' : '1px solid transparent',
                                background: booked ? '#00857A' : '#f8fafc', color: booked ? '#fff' : '#334155', fontWeight: booked ? 700 : 400, cursor: booked ? 'default' : 'default' }}>
                            {d}
                            {booked && booked.length > 1 ? (
                                <span style={{ position: 'absolute', top: 2, right: 4, fontSize: 9, background: '#fff', color: '#00857A', borderRadius: 8, padding: '0 4px', fontWeight: 700 }}>{booked.length}</span>
                            ) : null}
                        </div>
                    );
                })}
            </div>

            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#75787B' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: '#00857A', display: 'inline-block' }} /> booked date</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 14, borderRadius: 4, border: '1px solid #00C7B1', display: 'inline-block' }} /> today</span>
            </div>

            {monthDays.length > 0 ? (
                <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, borderTop: '1px solid #f1f5f9' }}>
                    {monthDays.map((d) => (
                        <li key={d} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #f8fafc', fontSize: 13 }}>
                            <span style={{ flexShrink: 0, fontWeight: 700, color: '#00857A', minWidth: 74 }}>{d} {MONTHS[view.m].slice(0, 3)}</span>
                            <span style={{ color: '#4D4D4F' }}>{byDay.get(iso(d)).join('  •  ')}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p style={{ marginTop: 12, fontSize: 13, color: '#94a3b8' }}>No dates selected in {MONTHS[view.m]} {view.y}.</p>
            )}
        </div>
    );
}
