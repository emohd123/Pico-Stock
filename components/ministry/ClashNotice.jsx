// Admin notice: days carrying more than one meeting. PICO owns exactly one
// custom Head Table, so two meetings needing it on the same day is a hard
// clash (it cannot be in two venues at once).
// clashes: [{ iso, list: [{ministry, venue, headTable}], tableCount, tableVenues }]
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtIso(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

export default function ClashNotice({ clashes, headTableDays = [] }) {
    if (!clashes || clashes.length === 0) return null;
    return (
        <section style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.06)', border: '1px solid #fed7aa', overflow: 'hidden' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #ffedd5', background: '#fff7ed', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#9a3412', margin: 0 }}>
                ⚠ Same-day meetings
                <span style={{ borderRadius: 10, background: '#f97316', color: '#fff', padding: '0 7px', fontSize: 11, fontWeight: 700 }}>{clashes.length}</span>
            </h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 300, overflowY: 'auto' }}>
                {clashes.map((c) => (
                    <li key={c.iso} style={{ padding: '9px 14px', borderTop: '1px solid #f8fafc' }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: '#9a3412' }}>{fmtIso(c.iso)}</div>
                        {c.list.map((b, i) => (
                            <div key={i} style={{ marginTop: 3, fontSize: 11, color: '#4D4D4F', lineHeight: 1.35 }}>
                                • {b.ministry} <span style={{ color: '#94a3b8' }}>— {b.venue}</span>
                                {b.headTable ? <span style={{ marginLeft: 4, borderRadius: 3, background: '#f1f5f9', padding: '0 4px', fontSize: 9, fontWeight: 700, color: '#475569' }}>HEAD TABLE</span> : null}
                            </div>
                        ))}
                        {c.tableCount > 1 ? (
                            <div style={{ marginTop: 5, borderRadius: 5, background: '#fef2f2', border: '1px solid #fecaca', padding: '4px 7px', fontSize: 10.5, color: '#dc2626', fontWeight: 600, lineHeight: 1.35 }}>
                                🔴 Head Table needed by {c.tableCount} meetings{c.tableVenues.length > 1 ? ` at ${c.tableVenues.length} venues` : ''} — only one table exists
                            </div>
                        ) : null}
                    </li>
                ))}
            </ul>
            {headTableDays.length > 0 ? (
                <p style={{ margin: 0, borderTop: '1px solid #f1f5f9', padding: '8px 14px', fontSize: 10.5, color: '#75787B', lineHeight: 1.4 }}>
                    <strong style={{ color: '#4D4D4F' }}>Head Table booked:</strong> {headTableDays.map(fmtIso).join(' · ')}
                </p>
            ) : null}
        </section>
    );
}
