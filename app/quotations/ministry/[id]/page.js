import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { isAdmin } from '@/lib/ministry/auth';
import { getMinistryById, getMinistryPhotos, getMinistryQuotations } from '@/lib/ministry/queries';
import { deletePhotoAction, regenerateTokenAction, updateMinistryAction, updateQuoteNotesAction } from '@/lib/ministry/actions';
import CopyLink from '@/components/ministry/CopyLink';
import PhotoUploader from '@/components/ministry/PhotoUploader';
import { fmtBHD } from '@/lib/ministry/money';

export const dynamic = 'force-dynamic';

const card = { background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' };
const inputStyle = { borderRadius: 8, border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: 14, width: '100%', boxSizing: 'border-box' };
const btn = { borderRadius: 8, background: '#00857A', color: '#fff', padding: '8px 16px', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer' };
const title = { fontSize: 14, fontWeight: 600, color: '#00857A', marginTop: 0, marginBottom: 12 };

export default async function ManageMinistryPage({ params }) {
    if (!isAdmin()) notFound();
    const { id } = params;
    const ministry = await getMinistryById(Number(id));
    if (!ministry) notFound();

    const [photos, quotes] = await Promise.all([getMinistryPhotos(ministry.id), getMinistryQuotations(ministry.id)]);
    const h = headers();
    const proto = h.get('x-forwarded-proto') || 'https';
    const host = h.get('host') || 'localhost:3000';
    const link = `${proto}://${host}/q/${ministry.token}`;
    const currentId = quotes[0] && quotes[0].id;

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#4D4D4F' }}>
            <header style={{ borderBottom: '4px solid #00C7B1', background: '#fff' }}>
                <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px' }}>
                    <img src="/brand/pico-logo.png" alt="PICO" style={{ height: 40 }} />
                    <img src="/brand/bahrain-emblem.png" alt="Kingdom of Bahrain" style={{ height: 44 }} />
                </div>
                <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px 12px' }}>
                    <Link href="/quotations" style={{ fontSize: 12, color: '#00857A' }}>← All ministries</Link>
                    <h1 style={{ fontSize: 20, fontWeight: 600, margin: '4px 0 0' }}>{ministry.name}</h1>
                    {ministry.nameAr ? <div dir="rtl" style={{ color: '#75787B' }}>{ministry.nameAr}</div> : null}
                </div>
            </header>

            <main style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24, padding: '32px 20px' }}>
                <section style={{ ...card, padding: 20 }}>
                    <h2 style={title}>Private portal link</h2>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                        <code style={{ wordBreak: 'break-all', borderRadius: 4, background: '#f1f5f9', padding: '4px 8px', fontSize: 12 }}>{link}</code>
                        <CopyLink url={link} />
                        <form action={regenerateTokenAction}>
                            <input type="hidden" name="ministryId" value={ministry.id} />
                            <button style={{ borderRadius: 6, border: '1px solid #cbd5e1', padding: '4px 8px', fontSize: 12, color: '#75787B', background: '#fff', cursor: 'pointer' }}>Regenerate (invalidate old)</button>
                        </form>
                    </div>
                </section>

                <section style={{ ...card, padding: 20 }}>
                    <h2 style={title}>Quotation recipient &amp; tracking</h2>
                    <form action={updateMinistryAction} style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
                        <input type="hidden" name="ministryId" value={ministry.id} />
                        <label style={{ fontSize: 12, color: '#75787B' }}>Attn. name<input name="attentionName" defaultValue={ministry.attentionName || ''} style={inputStyle} placeholder="e.g. Noof Ahmed" /></label>
                        <label style={{ fontSize: 12, color: '#75787B' }}>Attn. title<input name="attentionTitle" defaultValue={ministry.attentionTitle || ''} style={inputStyle} placeholder="Director of Communication" /></label>
                        <label style={{ fontSize: 12, color: '#75787B' }}>P.O. Box<input name="poBox" defaultValue={ministry.poBox || ''} style={inputStyle} placeholder="P.O. Box 60667" /></label>
                        <label style={{ fontSize: 12, color: '#75787B' }}>Contact email<input name="contactEmail" type="email" defaultValue={ministry.contactEmail || ''} style={inputStyle} /></label>
                        <label style={{ fontSize: 12, color: '#75787B', gridColumn: '1 / -1' }}>Internal status note (PICO only — to track what&apos;s up to date)<input name="internalNote" defaultValue={ministry.internalNote || ''} style={inputStyle} placeholder="e.g. Rev 2 sent 1 Jul — awaiting PO" /></label>
                        <button style={{ ...btn, justifySelf: 'start', gridColumn: '1 / -1' }}>Save details</button>
                    </form>
                </section>

                <section style={{ ...card, padding: 20 }}>
                    <h2 style={title}>Gallery photos ({photos.length})</h2>
                    <PhotoUploader ministryId={ministry.id} />
                    {photos.length > 0 ? (
                        <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                            {photos.map((p) => (
                                <figure key={p.id} style={{ overflow: 'hidden', borderRadius: 8, border: '1px solid #e2e8f0', margin: 0 }}>
                                    <img src={`/q/${ministry.token}/photo/${p.id}`} alt={p.caption || ''} style={{ height: 144, width: '100%', objectFit: 'cover' }} />
                                    <figcaption style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 8px' }}>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: '#75787B' }}>{p.caption || '—'}</span>
                                        <form action={deletePhotoAction}>
                                            <input type="hidden" name="ministryId" value={ministry.id} />
                                            <input type="hidden" name="photoId" value={p.id} />
                                            <button style={{ fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                                        </form>
                                    </figcaption>
                                </figure>
                            ))}
                        </div>
                    ) : null}
                </section>

                <section style={{ ...card, padding: 20 }}>
                    <h2 style={title}>Submitted quotations ({quotes.length})</h2>
                    {quotes.length === 0 ? (
                        <p style={{ fontSize: 14, color: '#75787B' }}>None yet.</p>
                    ) : (
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {quotes.map((q) => {
                                const isCurrent = q.id === currentId;
                                return (
                                    <li key={q.id} style={{ borderRadius: 8, border: '1px solid #e2e8f0', padding: 12 }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontWeight: 500 }}>{q.ref}</span>
                                                <span style={{ borderRadius: 4, background: '#f1f5f9', padding: '1px 6px', fontSize: 11, color: '#75787B' }}>Rev {q.revision}</span>
                                                {isCurrent
                                                    ? <span style={{ borderRadius: 4, background: '#00C7B1', padding: '1px 6px', fontSize: 11, fontWeight: 600, color: '#fff' }}>CURRENT</span>
                                                    : <span style={{ borderRadius: 4, background: '#e2e8f0', padding: '1px 6px', fontSize: 11, color: '#75787B' }}>Superseded</span>}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
                                                <span style={{ color: '#75787B' }}>{new Date(q.createdAt).toLocaleDateString('en-GB')}</span>
                                                <span style={{ fontWeight: 500 }}>{fmtBHD(q.totalFils)}</span>
                                                <a href={`/q/${ministry.token}/quote/${q.id}/pdf`} target="_blank" rel="noreferrer" style={{ color: '#00857A', textDecoration: 'underline' }}>Open PDF</a>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: 4, fontSize: 12, color: '#75787B' }}>{q.eventName || '—'}{q.venue ? ` · ${q.venue}` : ''}{q.eventDate ? ` · ${q.eventDate}` : ''}</div>
                                        <form action={updateQuoteNotesAction} style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                                            <input type="hidden" name="ministryId" value={ministry.id} />
                                            <input type="hidden" name="quoteId" value={q.id} />
                                            <input name="notes" defaultValue={q.notes || ''} placeholder="Update note (e.g. sent to client)…" style={{ flex: 1, borderRadius: 4, border: '1px solid #cbd5e1', padding: '4px 8px', fontSize: 12 }} />
                                            <select name="status" defaultValue={q.status} style={{ borderRadius: 4, border: '1px solid #cbd5e1', padding: '4px 8px', fontSize: 12 }}>
                                                <option value="draft">Draft</option>
                                                <option value="submitted">Submitted</option>
                                                <option value="sent">Sent to client</option>
                                                <option value="approved">Approved / PO received</option>
                                                <option value="superseded">Superseded</option>
                                            </select>
                                            <button style={{ borderRadius: 4, background: '#00857A', color: '#fff', padding: '4px 8px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>Save</button>
                                        </form>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </main>
        </div>
    );
}
