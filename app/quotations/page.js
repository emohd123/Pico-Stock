import Link from 'next/link';
import { headers } from 'next/headers';
import { isAdmin } from '@/lib/ministry/auth';
import { getAllMinistries, getRecentQuotations } from '@/lib/ministry/queries';
import { createMinistryAction, deleteMinistryAction } from '@/lib/ministry/actions';
import { fmtBHD } from '@/lib/ministry/money';
import BookingsCalendar from '@/components/ministry/BookingsCalendar';
import MinistriesPanel from '@/components/ministry/MinistriesPanel';

function timeAgo(d) {
    const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return `${Math.floor(s / 86400)} d ago`;
}

const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// Parse the portal's readable date string (e.g. "2, 3 July 2026 · 1 August 2026")
// back into ISO days. Non-matching / free-text values are skipped.
function parseEventDates(str) {
    if (!str) return [];
    const out = [];
    for (const group of String(str).split('·')) {
        const m = group.trim().match(/^([\d,\s]+)\s+([A-Za-z]+)\s+(\d{4})$/);
        if (!m) continue;
        const days = m[1].split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n >= 1 && n <= 31);
        const monIdx = MONTHS_FULL.findIndex((mm) => mm.toLowerCase() === m[2].toLowerCase());
        const year = parseInt(m[3], 10);
        if (monIdx < 0 || !year) continue;
        for (const d of days) out.push(`${year}-${String(monIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return out;
}

export const dynamic = 'force-dynamic';

const inputStyle = { borderRadius: 8, border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: 14 };
const btn = { borderRadius: 8, background: '#00857A', color: '#fff', padding: '8px 16px', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer' };
const card = { background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' };

export default async function QuotationsAdminPage({ searchParams }) {
    if (!isAdmin()) {
        return <LoginScreen error={!!(searchParams && searchParams.error)} />;
    }
    const [ministryRows, allQuotes] = await Promise.all([getAllMinistries(), getRecentQuotations(200)]);
    const nameById = new Map(ministryRows.map((m) => [m.id, m.name]));
    const recentQuotes = allQuotes.slice(0, 12);
    // latestByMinistry (newest first) drives the panel's "view quote" link.
    const latestByMinistry = new Map();
    for (const q of allQuotes) if (!latestByMinistry.has(q.ministryId)) latestByMinistry.set(q.ministryId, q);
    // Calendar shows EVERY quotation's dates — a ministry can hold several
    // meetings on different dates. Dedup exact repeats (e.g. revisions of the
    // same meeting) by day + label so the same booking isn't listed twice.
    const calendarEntries = [];
    const seenCal = new Set();
    for (const q of allQuotes) {
        const name = nameById.get(q.ministryId) || 'Ministry';
        const label = `${name}${q.eventName ? ' — ' + q.eventName : ''}${q.venue ? ' · Meeting Location: ' + q.venue : ''}`;
        for (const isoDay of parseEventDates(q.eventDate)) {
            const key = isoDay + '|' + label;
            if (seenCal.has(key)) continue;
            seenCal.add(key);
            calendarEntries.push({ iso: isoDay, label });
        }
    }
    const h = headers();
    const proto = h.get('x-forwarded-proto') || 'https';
    const host = h.get('host') || 'localhost:3000';
    const origin = `${proto}://${host}`;
    const ministriesForPanel = ministryRows.map((m) => {
        const q = latestByMinistry.get(m.id);
        return {
            id: m.id, name: m.name, nameAr: m.nameAr, token: m.token, internalNote: m.internalNote,
            quoteViewUrl: q && q.pdfBlobUrl ? `/q/${m.token}/quote/${q.id}/pdf?v=${encodeURIComponent((q.pdfBlobUrl || '').split('/').pop() || q.id)}` : null,
            hasPresentation: Boolean(m.presentationUrl), presentationAt: m.presentationAt || '',
        };
    });

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#4D4D4F' }}>
            <header style={{ borderBottom: '4px solid #00C7B1', background: '#fff' }}>
                <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px' }}>
                    <img src="/brand/pico-logo.png" alt="PICO" style={{ height: 40 }} />
                    <img src="/brand/bahrain-emblem.png" alt="Kingdom of Bahrain" style={{ height: 44 }} />
                </div>
                <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 12px' }}>
                    <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Ministry Meeting Portal — Admin</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Link href="/quotations/albums" style={{ borderRadius: 6, border: '1px solid #cbd5e1', padding: '6px 12px', fontSize: 14, color: '#00857A', textDecoration: 'none', fontWeight: 600 }}>📷 Photo albums</Link>
                        <form action="/api/quotations/logout" method="post">
                            <button style={{ borderRadius: 6, border: '1px solid #cbd5e1', padding: '6px 12px', fontSize: 14, background: '#fff', cursor: 'pointer' }}>Log out</button>
                        </form>
                    </div>
                </div>
            </header>

            <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 24, alignItems: 'start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
                    <section style={{ ...card, padding: 20 }}>
                        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 14, fontWeight: 600, color: '#00857A' }}>Add a ministry</h2>
                        <form action={createMinistryAction} style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
                            <input name="name" required placeholder="Ministry name (English)" style={inputStyle} />
                            <input name="nameAr" placeholder="اسم الوزارة (Arabic, optional)" dir="rtl" style={inputStyle} />
                            <input name="contactEmail" type="email" placeholder="Contact email (optional)" style={inputStyle} />
                            <input name="contactPhone" type="tel" placeholder="Contact phone (optional)" style={inputStyle} />
                            <input name="attentionName" placeholder="Contact person (optional)" style={inputStyle} />
                            <input name="attentionTitle" placeholder="Position / title (optional)" style={inputStyle} />
                            <button style={{ ...btn, justifySelf: 'start', gridColumn: '1 / -1' }}>Create + generate link</button>
                        </form>
                        <p style={{ marginTop: 8, fontSize: 12, color: '#75787B' }}>Contact details are optional and can be added or edited later. P.O. Box and photos are added after creating.</p>
                    </section>

                    <MinistriesPanel ministries={ministriesForPanel} origin={origin} deleteAction={deleteMinistryAction} />
                </div>

                <aside style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
                    <section style={card}>
                        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #f1f5f9', padding: '12px 16px', fontSize: 14, fontWeight: 600, color: '#00857A', margin: 0 }}>
                            🔔 Recent activity
                            {recentQuotes.length > 0 ? <span style={{ borderRadius: 10, background: '#00C7B1', color: '#fff', padding: '0 8px', fontSize: 11, fontWeight: 700 }}>{recentQuotes.length}</span> : null}
                        </h2>
                        {recentQuotes.length === 0 ? (
                            <p style={{ padding: '14px 16px', fontSize: 13, color: '#75787B' }}>No quotations submitted yet. Activity appears here when a ministry generates a quotation.</p>
                        ) : (
                            <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 360, overflowY: 'auto' }}>
                                {recentQuotes.map((q) => (
                                    <li key={q.id} style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9' }}>
                                        <div style={{ fontSize: 13 }}>
                                            <Link href={`/quotations/ministry/${q.ministryId}`} style={{ fontWeight: 600, color: '#00857A', textDecoration: 'none' }}>{nameById.get(q.ministryId) || 'Ministry'}</Link>
                                            <span style={{ color: '#75787B' }}> · {q.ref}</span>
                                            {q.revision > 1 ? <span style={{ marginLeft: 6, borderRadius: 4, background: '#f1f5f9', padding: '1px 5px', fontSize: 10, color: '#75787B' }}>Rev {q.revision}</span> : null}
                                        </div>
                                        <div style={{ marginTop: 2, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8' }}>
                                            <span style={{ fontWeight: 600, color: '#4D4D4F' }}>{fmtBHD(q.totalFils)}</span>
                                            <span>{timeAgo(q.createdAt)}</span>
                                        </div>
                                        {q.eventName ? <div style={{ marginTop: 2, fontSize: 12, color: '#75787B' }}>{q.eventName}</div> : null}
                                        {q.submitterNote ? <div style={{ marginTop: 6, borderRadius: 6, background: '#fffbeb', border: '1px solid #fde68a', padding: '5px 8px', fontSize: 12, color: '#92400e' }}><strong>Note:</strong> {q.submitterNote}</div> : null}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section style={card}>
                        <h2 style={{ borderBottom: '1px solid #f1f5f9', padding: '12px 16px', fontSize: 14, fontWeight: 600, color: '#00857A', margin: 0 }}>📅 Selected dates</h2>
                        <BookingsCalendar entries={calendarEntries} />
                    </section>
                </aside>
            </main>
        </div>
    );
}

function LoginScreen({ error }) {
    return (
        <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', padding: 16 }}>
            <form action="/api/quotations/login" method="post" style={{ width: '100%', maxWidth: 360, borderRadius: 12, background: '#fff', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <img src="/brand/pico-logo.png" alt="PICO" style={{ height: 32 }} />
                    <img src="/brand/bahrain-emblem.png" alt="Bahrain" style={{ height: 36 }} />
                </div>
                <h1 style={{ marginBottom: 16, fontSize: 18, fontWeight: 600, color: '#4D4D4F' }}>Ministry Portal — Admin sign in</h1>
                <input name="password" type="password" required placeholder="Admin password" style={{ width: '100%', borderRadius: 8, border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: 14, boxSizing: 'border-box' }} />
                {error ? <p style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>Incorrect password.</p> : null}
                <button style={{ ...btn, width: '100%', marginTop: 16 }}>Sign in</button>
            </form>
        </div>
    );
}
