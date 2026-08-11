import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAdmin } from '@/lib/ministry/auth';
import { getAllMinistries, getActivity } from '@/lib/ministry/queries';

export const dynamic = 'force-dynamic';

const card = { background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' };

// Who did it. Ministry actions are the ones that matter as evidence, so they
// read differently from PICO's own.
const ACTOR = {
    ministry: { label: 'MINISTRY', bg: '#eff6ff', fg: '#1d4ed8', border: '#bfdbfe' },
    admin: { label: 'PICO', bg: '#f0fdfa', fg: '#00857A', border: '#99f6e4' },
};
const ICON = {
    'ministry.created': '🔗', 'quotation.generated': '📄', 'quotation.uploaded': '📄',
    'quotation.pdf.replaced': '📄', 'presentation.generated': '📊', 'photo.uploaded': '📷',
    'note.added': '📝', 'file.added': '📎', 'lpo.received': '✅', 'lpo.cleared': '↩',
    'sharelink.created': '🔗', 'sharelink.revoked': '🚫',
};

function fmtStamp(iso) {
    const d = new Date(iso);
    const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return { date, time, day: d.toLocaleDateString('en-GB', { weekday: 'short' }) };
}

export default async function ActivityPage({ searchParams }) {
    if (!isAdmin()) notFound();

    const ministries = await getAllMinistries();
    const selectedId = Number(searchParams?.ministry) || null;
    const selected = selectedId ? ministries.find((m) => m.id === selectedId) : null;

    const events = await getActivity({ ministryId: selected ? selected.id : null, limit: 1000 });
    const nameById = new Map(ministries.map((m) => [m.id, m.name]));

    // Oldest first reads as a story; that is what a handover document needs.
    const ordered = [...events].reverse();
    const byDay = [];
    for (const e of ordered) {
        const key = new Date(e.createdAt).toDateString();
        if (!byDay.length || byDay[byDay.length - 1].key !== key) byDay.push({ key, at: e.createdAt, items: [] });
        byDay[byDay.length - 1].items.push(e);
    }
    const counts = {
        ministry: events.filter((e) => e.actor === 'ministry').length,
        admin: events.filter((e) => e.actor === 'admin').length,
        reconstructed: events.filter((e) => e.reconstructed).length,
    };
    const first = ordered[0];
    const last = ordered[ordered.length - 1];

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#4D4D4F' }}>
            <style>{`@media print { .no-print { display: none !important } .a-card { break-inside: avoid; box-shadow: none !important; border: 1px solid #ddd } body { background: #fff } }`}</style>

            <header style={{ borderBottom: '4px solid #00C7B1', background: '#fff' }}>
                <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px' }}>
                    <img src="/brand/pico-logo.png" alt="PICO" style={{ height: 40 }} />
                    <img src="/brand/bahrain-emblem.png" alt="Kingdom of Bahrain" style={{ height: 44 }} />
                </div>
                <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 20px 12px' }}>
                    <Link className="no-print" href="/quotations" style={{ fontSize: 12, color: '#00857A' }}>← Admin dashboard</Link>
                    <h1 style={{ fontSize: 20, fontWeight: 600, margin: '4px 0 0' }}>
                        Activity log{selected ? ` — ${selected.name}` : ''}
                    </h1>
                    <p style={{ fontSize: 13, color: '#75787B', margin: '2px 0 0' }}>
                        Every action on {selected ? 'this ministry’s portal' : 'the ministry portal'}, who did it and when — kept as a record of performance.
                    </p>
                </div>
            </header>

            <main style={{ maxWidth: 1000, margin: '0 auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <section className="a-card" style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 22, padding: '12px 16px', fontSize: 12.5 }}>
                    <span><strong style={{ color: '#00857A' }}>Events:</strong> {events.length}</span>
                    <span><strong style={{ color: '#1d4ed8' }}>By the ministry:</strong> {counts.ministry}</span>
                    <span><strong style={{ color: '#00857A' }}>By PICO:</strong> {counts.admin}</span>
                    {first ? <span><strong>From:</strong> {fmtStamp(first.createdAt).date}</span> : null}
                    {last ? <span><strong>To:</strong> {fmtStamp(last.createdAt).date}</span> : null}
                </section>

                <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <Link href="/quotations/activity" style={{ borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, textDecoration: 'none', background: !selected ? '#00857A' : '#fff', color: !selected ? '#fff' : '#00857A', border: '1px solid #00857A' }}>All ministries</Link>
                    {ministries.map((m) => (
                        <Link key={m.id} href={`/quotations/activity?ministry=${m.id}`}
                            style={{ borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, textDecoration: 'none', background: selected && selected.id === m.id ? '#00857A' : '#fff', color: selected && selected.id === m.id ? '#fff' : '#00857A', border: '1px solid #cbd5e1' }}>
                            {m.name}
                        </Link>
                    ))}
                </div>

                {counts.reconstructed > 0 ? (
                    <section className="a-card" style={{ ...card, background: '#fff7ed', border: '1px solid #fed7aa', padding: '10px 16px', fontSize: 11.5, color: '#9a3412' }}>
                        <strong>{counts.reconstructed}</strong> of these entries are marked <em>reconstructed</em>: they were rebuilt from each record’s own
                        timestamp after the log was introduced, rather than written as the action happened. The date and the action are from the record itself;
                        everything without that mark was captured live.
                    </section>
                ) : null}

                {byDay.length === 0 ? (
                    <section style={{ ...card, padding: 32, textAlign: 'center', fontSize: 14, color: '#75787B' }}>Nothing recorded yet.</section>
                ) : byDay.map((d) => (
                    <section key={d.key} className="a-card" style={{ ...card, overflow: 'hidden' }}>
                        <h2 style={{ fontSize: 12.5, fontWeight: 700, margin: 0, padding: '9px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', color: '#22282B' }}>
                            {fmtStamp(d.at).day} {fmtStamp(d.at).date}
                            <span style={{ marginLeft: 8, fontWeight: 400, color: '#94a3b8' }}>· {d.items.length} event{d.items.length === 1 ? '' : 's'}</span>
                        </h2>
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                            {d.items.map((e) => {
                                const a = ACTOR[e.actor] || { label: e.actor.toUpperCase(), bg: '#f1f5f9', fg: '#475569', border: '#e2e8f0' };
                                return (
                                    <li key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 16px', borderTop: '1px solid #f8fafc' }}>
                                        <span style={{ width: 42, flexShrink: 0, fontSize: 11.5, color: '#94a3b8', paddingTop: 1 }}>{fmtStamp(e.createdAt).time}</span>
                                        <span aria-hidden style={{ width: 18, flexShrink: 0, fontSize: 13 }}>{ICON[e.action] || '•'}</span>
                                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#22282B' }}>
                                            {e.detail || e.action}
                                            {!selected ? <span style={{ color: '#94a3b8' }}> · {nameById.get(e.ministryId) || `Ministry ${e.ministryId}`}</span> : null}
                                            {e.reconstructed ? <span title="Rebuilt from the record's own timestamp" style={{ marginLeft: 6, borderRadius: 3, background: '#fff7ed', border: '1px solid #fed7aa', padding: '0 4px', fontSize: 9, fontWeight: 700, color: '#9a3412' }}>RECONSTRUCTED</span> : null}
                                        </span>
                                        <span style={{ flexShrink: 0, borderRadius: 4, background: a.bg, border: `1px solid ${a.border}`, padding: '1px 7px', fontSize: 9.5, fontWeight: 700, color: a.fg }}>{a.label}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}

                <p className="no-print" style={{ fontSize: 11.5, color: '#94a3b8', margin: 0, textAlign: 'center' }}>
                    Use your browser’s Print to save this as a PDF for handover.
                </p>
            </main>
        </div>
    );
}
