'use client';

// The season inventory as a spreadsheet you open, not a wall of tables you
// scroll past. Every row shows its own arithmetic — click it and you see the
// meetings that produced the number, so a total is never something to trust
// blindly. Copy / CSV / print exist because this ends up in a purchase order.
import { useState, useMemo, useEffect } from 'react';

const INK = '#22282B', TEAL = '#00857A', MUTED = '#6B7A80', RED = '#dc2626';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dt = (iso) => { if (!iso) return '—'; const [, m, d] = iso.split('-'); return `${Number(d)} ${MONTHS[Number(m) - 1]}`; };
const range = (a, b) => (a === b ? dt(a) : `${dt(a)} – ${dt(b)}`);
const num = (n) => n.toLocaleString();

const btn = {
    border: '1px solid #e2e8f0', background: '#fff', color: INK, borderRadius: 6,
    padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
};
const th = {
    position: 'sticky', top: 0, zIndex: 2, background: '#f8fafc', textAlign: 'left',
    padding: '7px 8px', fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
    color: MUTED, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
};
const td = { padding: '5px 8px', fontSize: 11.5, verticalAlign: 'top' };

/** The one-line explanation of how a row's number was reached. */
function working(r) {
    if (r.kind === 'consumable') {
        return r.users.length === 1
            ? `${num(r.users[0].qty)} for ${r.users[0].ministry}`
            : `${r.users.map((u) => num(u.qty)).join(' + ')}`;
    }
    if (r.peakUsers.length === 1) return `${num(r.needed)} on ${dt(r.peakDay)} — one meeting`;
    return `${r.peakUsers.map((u) => num(u.qty)).join(' + ')} = ${num(r.needed)} on ${dt(r.peakDay)}`;
}

export default function InventorySheet({ rows, season }) {
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState('all');
    const [q, setQ] = useState('');
    const [expanded, setExpanded] = useState(() => new Set());
    const [copied, setCopied] = useState(false);

    const reusable = rows.filter((r) => r.kind === 'reusable');
    const consumed = rows.filter((r) => r.kind === 'consumable');
    const shortfall = reusable.filter((r) => r.oneOnly && r.needed > 1);

    const shown = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return rows.filter((r) => (tab === 'all' || r.kind === tab)
            && (!needle || r.name.toLowerCase().includes(needle) || String(r.no).includes(needle)));
    }, [rows, tab, q]);

    const sum = (list) => list.reduce((s, r) => s + r.needed, 0);

    useEffect(() => {
        if (!open) return;
        const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', esc);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = prev; };
    }, [open]);

    const toggle = (no) => setExpanded((s) => {
        const next = new Set(s);
        next.has(no) ? next.delete(no) : next.add(no);
        return next;
    });

    // --- exports: the same grid, flattened for a spreadsheet ---
    const grid = () => {
        const head = ['#', 'Item', 'Counted as', 'Total to prepare', 'Driven by', 'Meetings', 'Working'];
        const body = shown.map((r) => [
            r.no > 899 ? 'extra' : r.no, r.name,
            r.kind === 'reusable' ? 'Reusable — peak on one day' : 'Consumed — season total',
            r.needed, r.kind === 'reusable' ? dt(r.peakDay) : 'across the season',
            r.meetings, working(r).replace(/\s+/g, ' '),
        ]);
        return [head, ...body];
    };
    const copy = async () => {
        const text = grid().map((r) => r.join('\t')).join('\n');
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // Clipboard permission can be refused (or absent over plain http) —
            // fall back rather than leave the button silently dead.
            const box = document.createElement('textarea');
            box.value = text;
            box.style.cssText = 'position:fixed;top:-1000px';
            document.body.appendChild(box);
            box.select();
            document.execCommand('copy');
            box.remove();
        }
        setCopied(true); setTimeout(() => setCopied(false), 1600);
    };
    const csv = () => {
        const text = grid().map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = `inventory-${season || 'season'}.csv`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
    };
    const print = () => {
        const cells = grid();
        const html = `<!doctype html><meta charset="utf-8"><title>Inventory — ${season || ''}</title>
<style>body{font:11px system-ui;color:#22282B;padding:18px}h1{font-size:15px;margin:0 0 2px}
p{color:#6B7A80;margin:0 0 12px;font-size:10px}table{border-collapse:collapse;width:100%}
th,td{border:1px solid #dde3e6;padding:4px 6px;text-align:left}th{background:#f1f5f9;font-size:9.5px}
td:nth-child(4){text-align:right;font-weight:700}</style>
<h1>Inventory to prepare${season ? ` — ${season}` : ''}</h1>
<p>Reusable items counted at their peak on any single day (kept and moved builds count once). Consumed items summed across all meetings.</p>
<table><thead><tr>${cells[0].map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>
${cells.slice(1).map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}
</tbody></table>`;
        const frame = document.createElement('iframe');
        frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
        document.body.appendChild(frame);
        frame.contentDocument.write(html);
        frame.contentDocument.close();
        frame.contentWindow.focus();
        frame.contentWindow.print();
        setTimeout(() => frame.remove(), 1000);
    };

    return (
        <>
            {/* --- the resting state: a strip, not a table --- */}
            <section style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.06)', padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>📦 Inventory to prepare</div>
                <Stat n={reusable.length} label="reusable items" />
                <Stat n={consumed.length} label="consumed items" />
                <Stat n={num(sum(consumed))} label="pieces to order" />
                {shortfall.length
                    ? <Stat n={shortfall.length} label="short of a second set" tone={RED} />
                    : <Stat n="✓" label="stock covers every day" tone={TEAL} />}
                <button onClick={() => setOpen(true)} style={{ ...btn, marginLeft: 'auto', background: TEAL, borderColor: TEAL, color: '#fff', padding: '7px 14px', fontSize: 12 }}>
                    Open the sheet →
                </button>
            </section>

            {!open ? null : (
                <div onClick={() => setOpen(false)}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div onClick={(e) => e.stopPropagation()}
                        style={{ background: '#fff', borderRadius: 12, width: 'min(1180px, 97vw)', maxHeight: '93vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>

                        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>📦 Inventory sheet {season ? <span style={{ color: MUTED, fontWeight: 400 }}>— {season}</span> : null}</div>
                                <div style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>
                                    Click any row to see the meetings behind the number. Reusable = the most needed on one day; a build kept standing overnight or moved to another venue is the same set and counts once.
                                </div>
                            </div>
                            <button onClick={() => setOpen(false)} style={{ ...btn, marginLeft: 'auto', fontSize: 14, padding: '3px 9px' }}>✕</button>
                        </div>

                        <div style={{ padding: '8px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            {[['all', `All ${rows.length}`], ['reusable', `Reusable ${reusable.length}`], ['consumable', `Consumed ${consumed.length}`]].map(([id, label]) => (
                                <button key={id} onClick={() => setTab(id)}
                                    style={{ ...btn, background: tab === id ? INK : '#fff', color: tab === id ? '#fff' : INK, borderColor: tab === id ? INK : '#e2e8f0' }}>{label}</button>
                            ))}
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an item…"
                                style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 9px', fontSize: 11.5, width: 180, outline: 'none' }} />
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                                <button onClick={copy} style={{ ...btn, color: copied ? TEAL : INK, borderColor: copied ? TEAL : '#e2e8f0' }}>{copied ? '✓ Copied' : 'Copy for Excel'}</button>
                                <button onClick={csv} style={btn}>CSV</button>
                                <button onClick={print} style={btn}>Print</button>
                            </div>
                        </div>

                        <div style={{ overflow: 'auto', flex: 1 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        <th style={{ ...th, width: 34 }}>#</th>
                                        <th style={th}>ITEM</th>
                                        <th style={{ ...th, width: 128 }}>COUNTED AS</th>
                                        <th style={{ ...th, width: 108 }}>USED BY</th>
                                        <th style={th}>WORKING</th>
                                        <th style={{ ...th, width: 78, textAlign: 'right' }}>TOTAL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shown.map((r) => {
                                        const isOpen = expanded.has(r.no);
                                        const alarm = r.oneOnly && r.needed > 1;
                                        return (
                                            <Fragmented key={r.no}>
                                                <tr onClick={() => toggle(r.no)}
                                                    style={{ borderTop: '1px solid #f1f5f9', cursor: 'pointer', background: isOpen ? '#f8fafc' : alarm ? '#fef2f2' : '#fff' }}>
                                                    <td style={{ ...td, color: '#94a3b8' }}>{r.no > 899 ? '+' : r.no}</td>
                                                    <td style={{ ...td, color: INK, fontWeight: 600 }}>
                                                        <span style={{ color: '#cbd5e1', marginRight: 5 }}>{isOpen ? '▾' : '▸'}</span>
                                                        {r.name}
                                                        {r.oneOnly ? <Tag>ONE ONLY</Tag> : null}
                                                        {r.no > 899 ? <Tag tone="#9a3412">FROM UPLOAD</Tag> : null}
                                                    </td>
                                                    <td style={{ ...td, color: r.kind === 'reusable' ? TEAL : '#9a3412', fontSize: 10.5 }}>
                                                        {r.kind === 'reusable' ? 'peak on one day' : 'total, used up'}
                                                    </td>
                                                    <td style={{ ...td, color: MUTED, fontSize: 10.5 }}>{r.meetings} meeting{r.meetings === 1 ? '' : 's'}</td>
                                                    <td style={{ ...td, color: MUTED, fontSize: 10.5 }}>{working(r)}</td>
                                                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontSize: 13, color: alarm ? RED : INK }}>{num(r.needed)}</td>
                                                </tr>
                                                {!isOpen ? null : (
                                                    <tr style={{ background: '#f8fafc' }}>
                                                        <td />
                                                        <td colSpan={5} style={{ padding: '2px 8px 12px' }}>
                                                            <Detail r={r} />
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragmented>
                                        );
                                    })}
                                    {!shown.length ? <tr><td colSpan={6} style={{ ...td, color: MUTED, padding: 24, textAlign: 'center' }}>Nothing matches “{q}”.</td></tr> : null}
                                </tbody>
                            </table>
                        </div>

                        {/* --- the total, at the end, where a sheet puts it --- */}
                        <div style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc', padding: '10px 16px', display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
                            <Total label="Item lines" value={num(shown.length)} />
                            <Total label="Reusable pieces to have ready" value={num(sum(shown.filter((r) => r.kind === 'reusable')))} tone={TEAL} />
                            <Total label="Consumed pieces to order" value={num(sum(shown.filter((r) => r.kind === 'consumable')))} tone="#9a3412" />
                            <Total label="Grand total pieces" value={num(sum(shown))} big />
                            {shortfall.length ? (
                                <div style={{ marginLeft: 'auto', fontSize: 11, color: RED, fontWeight: 600 }}>
                                    ⚠ {shortfall.map((s) => s.name).join(', ')} — need {shortfall.map((s) => s.needed).join('/')} but PICO owns one set
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function Detail({ r }) {
    const cell = { padding: '3px 8px', fontSize: 11 };
    return (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: r.kind === 'reusable' ? 'repeat(auto-fit, minmax(300px, 1fr))' : '1fr' }}>
            <div>
                <Cap>Every meeting that needs it</Cap>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                        {r.users.map((u, i) => (
                            <tr key={i} style={{ borderTop: '1px solid #eef2f3' }}>
                                <td style={{ ...cell, color: '#22282B' }}>{u.ministry}</td>
                                <td style={{ ...cell, color: MUTED, whiteSpace: 'nowrap' }}>{range(u.from, u.to)}</td>
                                <td style={{ ...cell, color: MUTED, fontSize: 10 }}>{u.venue}</td>
                                <td style={{ ...cell, textAlign: 'right', fontWeight: 700, width: 54 }}>{num(u.qty)}</td>
                            </tr>
                        ))}
                        <tr style={{ borderTop: '1px solid #cbd5e1' }}>
                            <td style={{ ...cell, color: MUTED, fontSize: 10 }} colSpan={3}>
                                {r.kind === 'consumable'
                                    ? 'Used up per meeting, so every line adds'
                                    : 'Same physical set reused — only the busiest day counts'}
                            </td>
                            <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>
                                {r.kind === 'consumable' ? num(r.needed) : `max ${num(r.needed)}`}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {r.kind !== 'reusable' ? null : (
                <div>
                    <Cap>Day by day — the peak is what you must own</Cap>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                            {r.days.map((d) => {
                                const isPeak = d.iso === r.peakDay;
                                return (
                                    <tr key={d.iso} style={{ borderTop: '1px solid #eef2f3', background: isPeak ? '#ecfdf5' : 'transparent' }}>
                                        <td style={{ ...cell, whiteSpace: 'nowrap', color: isPeak ? TEAL : MUTED, fontWeight: isPeak ? 700 : 400 }}>{dt(d.iso)}</td>
                                        <td style={{ ...cell, color: MUTED, fontSize: 10 }}>
                                            {d.users.map((u) => `${u.ministry} ×${u.qty}`).join('  +  ')}
                                        </td>
                                        <td style={{ ...cell, textAlign: 'right', fontWeight: isPeak ? 700 : 400, width: 54, color: isPeak ? TEAL : INK }}>
                                            {num(d.qty)}{isPeak ? ' ◄' : ''}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {r.days.length > 1 && r.days.every((d) => !d.shared) ? (
                        <div style={{ fontSize: 10, color: MUTED, padding: '5px 8px 0' }}>
                            No two of these meetings ever run on the same day — one set covers them all, moved between venues.
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}

const Fragmented = ({ children }) => <>{children}</>;
const Cap = ({ children }) => <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: '#94a3b8', padding: '4px 8px' }}>{children}</div>;
const Tag = ({ children, tone = '#475569' }) => (
    <span style={{ marginLeft: 5, borderRadius: 3, background: '#f1f5f9', padding: '0 4px', fontSize: 8.5, fontWeight: 700, color: tone }}>{children}</span>
);
const Stat = ({ n, label, tone = INK }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: tone }}>{n}</span>
        <span style={{ fontSize: 10.5, color: MUTED }}>{label}</span>
    </div>
);
const Total = ({ label, value, tone = INK, big }) => (
    <div>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: '#94a3b8' }}>{label.toUpperCase()}</div>
        <div style={{ fontSize: big ? 20 : 15, fontWeight: 700, color: tone }}>{value}</div>
    </div>
);
