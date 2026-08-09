import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { isAdmin } from '@/lib/ministry/auth';
import { getMinistryById, getMinistryPhotos, getMinistryQuotations, getMinistryNotes, getActiveCatalog } from '@/lib/ministry/queries';
import { addMinistryNoteAction, deleteMinistryNoteAction, deletePhotoAction, deleteQuotationAction, regenerateTokenAction, setQuoteNumberAction, updateLinkCodeAction, updateMinistryAction, updateMinistryNoteAction, updateQuoteNotesAction } from '@/lib/ministry/actions';
import DeleteQuoteButton from '@/components/ministry/DeleteQuoteButton';
import ReplaceQuotePdf from '@/components/ministry/ReplaceQuotePdf';
import CopyLink from '@/components/ministry/CopyLink';
import PhotoUploader from '@/components/ministry/PhotoUploader';
import ManagePresentation from '@/components/ministry/ManagePresentation';
import UploadQuotation from '@/components/ministry/UploadQuotation';
import LpoToggle from '@/components/ministry/LpoToggle';
import { COMPANY } from '@/lib/ministry/company';
import { fmtBHD } from '@/lib/ministry/money';

export const dynamic = 'force-dynamic';

const card = { background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' };
const inputStyle = { borderRadius: 8, border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: 14, width: '100%', boxSizing: 'border-box' };
const btn = { borderRadius: 8, background: '#00857A', color: '#fff', padding: '8px 16px', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer' };
const title = { fontSize: 14, fontWeight: 600, color: '#00857A', marginTop: 0, marginBottom: 12 };

function fmtNoteDate(d) {
    return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bahrain' });
}

export default async function ManageMinistryPage({ params, searchParams }) {
    if (!isAdmin()) notFound();
    const { id } = params;
    const ministry = await getMinistryById(Number(id));
    if (!ministry) notFound();

    const errorMsg = typeof searchParams?.error === 'string' ? searchParams.error : '';
    const saved = searchParams?.saved === '1';
    const [photos, quotes, notes, catalog] = await Promise.all([getMinistryPhotos(ministry.id), getMinistryQuotations(ministry.id), getMinistryNotes(ministry.id), getActiveCatalog()]);
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
                    {ministry.nameAr ? <div dir="rtl" style={{ display: 'inline-block', textAlign: 'right', color: '#75787B' }}>{ministry.nameAr}</div> : null}
                </div>
            </header>

            <main style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24, padding: '32px 20px' }}>
                {errorMsg ? (
                    <div style={{ borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', padding: '10px 14px', fontSize: 13 }}>
                        ⚠ {errorMsg}
                    </div>
                ) : null}
                {saved ? (
                    <div style={{ borderRadius: 8, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', padding: '10px 14px', fontSize: 13 }}>
                        ✓ Saved.
                    </div>
                ) : null}
                <section style={{ ...card, padding: 20 }}>
                    <h2 style={title}>Private portal link</h2>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                        <code style={{ wordBreak: 'break-all', borderRadius: 4, background: '#f1f5f9', padding: '4px 8px', fontSize: 13, fontWeight: 600, color: '#00857A' }}>{link}</code>
                        <CopyLink url={link} />
                    </div>
                    <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 }}>
                        <form action={updateLinkCodeAction} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 }}>
                            <input type="hidden" name="ministryId" value={ministry.id} />
                            <label style={{ fontSize: 12, color: '#75787B' }}>
                                Link code
                                <div style={{ display: 'flex', alignItems: 'center', marginTop: 4 }}>
                                    <span style={{ borderRadius: '8px 0 0 8px', border: '1px solid #cbd5e1', borderRight: 'none', background: '#f8fafc', padding: '8px 10px', fontSize: 13, color: '#94a3b8' }}>{proto}://{host}/q/</span>
                                    <input name="code" defaultValue={ministry.token} pattern="[a-z0-9-]{3,24}" style={{ borderRadius: '0 8px 8px 0', border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: 13, width: 160 }} />
                                </div>
                            </label>
                            <button style={{ ...btn, padding: '8px 12px', fontSize: 12 }}>Save link code</button>
                        </form>
                        <form action={regenerateTokenAction}>
                            <input type="hidden" name="ministryId" value={ministry.id} />
                            <button style={{ borderRadius: 6, border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: 12, color: '#75787B', background: '#fff', cursor: 'pointer' }}>Regenerate random (revoke old link)</button>
                        </form>
                    </div>
                    <p style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>Lowercase letters, numbers, hyphens (3–24 chars). Anyone with the old link loses access once you change it.</p>
                </section>

                <section style={{ ...card, padding: 20 }}>
                    <h2 style={title}>Quotation recipient &amp; tracking</h2>
                    <form action={updateMinistryAction} style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
                        <input type="hidden" name="ministryId" value={ministry.id} />
                        <label style={{ fontSize: 12, color: '#75787B' }}>Attn. name<input name="attentionName" defaultValue={ministry.attentionName || ''} style={inputStyle} placeholder="e.g. Noof Ahmed" /></label>
                        <label style={{ fontSize: 12, color: '#75787B' }}>Attn. title<input name="attentionTitle" defaultValue={ministry.attentionTitle || ''} style={inputStyle} placeholder="Director of Communication" /></label>
                        <label style={{ fontSize: 12, color: '#75787B' }}>P.O. Box<input name="poBox" defaultValue={ministry.poBox || ''} style={inputStyle} placeholder="P.O. Box 60667" /></label>
                        <label style={{ fontSize: 12, color: '#75787B' }}>Contact email<input name="contactEmail" type="email" defaultValue={ministry.contactEmail || ''} style={inputStyle} /></label>
                        <label style={{ fontSize: 12, color: '#75787B' }}>Contact phone<input name="contactPhone" type="tel" defaultValue={ministry.contactPhone || ''} style={inputStyle} placeholder="+973 ..." /></label>
                        <button style={{ ...btn, justifySelf: 'start', gridColumn: '1 / -1' }}>Save details</button>
                    </form>
                </section>

                <section style={{ ...card, padding: 20 }}>
                    <h2 style={title}>Quotation number &amp; presentation</h2>
                    <form action={setQuoteNumberAction} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 }}>
                        <input type="hidden" name="ministryId" value={ministry.id} />
                        <label style={{ fontSize: 12, color: '#75787B' }}>Quotation number
                            <input name="quoteNumber" defaultValue={ministry.quoteRef || ''} inputMode="numeric" placeholder="e.g. 11968" style={{ ...inputStyle, width: 160, marginTop: 4 }} />
                        </label>
                        <button style={{ ...btn, padding: '8px 14px' }}>Save number</button>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>Ref on next quotation: <code style={{ color: '#00857A' }}>{COMPANY.refPrefix}/MM/YYYY/{COMPANY.refDept}/{ministry.quoteRef || 'nnnnn'}</code></span>
                    </form>
                    <p style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>Set the permanent number for this ministry — the next generated quotation reuses it. Leave blank to auto-assign the next number in sequence.</p>
                    <div style={{ marginTop: 16, borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                        <LpoToggle ministryId={ministry.id} initial={ministry.lpoReceived} />
                        <p style={{ margin: '6px 0 0', fontSize: 11, color: '#94a3b8' }}>When the LPO (purchase order) is received, tick this — the ministry&apos;s dates turn red (confirmed) on the bookings calendar.</p>
                    </div>
                    <div style={{ marginTop: 16, borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                        <div style={{ fontSize: 12, color: '#75787B', marginBottom: 8 }}>Technical proposal presentation</div>
                        <ManagePresentation ministry={{ id: ministry.id, name: ministry.name, quoteViewUrl: currentId ? '1' : null, hasPresentation: Boolean(ministry.presentationUrl), presentationAt: ministry.presentationAt || '' }} />
                    </div>
                </section>

                <section style={{ ...card, padding: 20 }}>
                    <h2 style={title}>Project notes ({notes.length}) <span style={{ fontWeight: 400, color: '#94a3b8' }}>— PICO only, to track what&apos;s up to date</span></h2>
                    <form action={addMinistryNoteAction} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                        <input type="hidden" name="ministryId" value={ministry.id} />
                        <input name="note" placeholder="e.g. Rev 2 sent 1 Jul — awaiting PO" style={{ ...inputStyle, flex: 1, width: 'auto' }} />
                        <button style={{ ...btn, padding: '8px 12px', fontSize: 12 }}>Add note</button>
                    </form>
                    {notes.length > 0 ? (
                        <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {notes.map((n) => (
                                <li key={n.id} style={{ borderRadius: 8, border: '1px solid #e2e8f0', padding: 10 }}>
                                    <div style={{ marginBottom: 6, fontSize: 11, color: '#94a3b8' }}>
                                        Added {fmtNoteDate(n.createdAt)}{n.updatedAt ? ` · edited ${fmtNoteDate(n.updatedAt)}` : ''}
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                                        <form action={updateMinistryNoteAction} style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 8, minWidth: 260 }}>
                                            <input type="hidden" name="ministryId" value={ministry.id} />
                                            <input type="hidden" name="noteId" value={n.id} />
                                            <input name="note" defaultValue={n.note} style={{ ...inputStyle, flex: 1, width: 'auto' }} />
                                            <button style={{ ...btn, padding: '8px 12px', fontSize: 12 }}>Save</button>
                                        </form>
                                        <form action={deleteMinistryNoteAction}>
                                            <input type="hidden" name="ministryId" value={ministry.id} />
                                            <input type="hidden" name="noteId" value={n.id} />
                                            <button style={{ borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', padding: '8px 12px', fontSize: 12, cursor: 'pointer' }}>Delete</button>
                                        </form>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : <p style={{ marginTop: 12, marginBottom: 0, fontSize: 13, color: '#94a3b8' }}>No notes yet.</p>}
                </section>

                <section style={{ ...card, padding: 20 }}>
                    <h2 style={title}>Gallery photos ({photos.length})</h2>
                    <PhotoUploader ministryId={ministry.id} />
                    {photos.length > 0 ? (
                        <div style={{ marginTop: 20, maxHeight: 420, overflowY: 'auto', paddingRight: 4, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
                            {photos.map((p) => (
                                <figure key={p.id} style={{ overflow: 'hidden', borderRadius: 8, border: '1px solid #e2e8f0', margin: 0 }}>
                                    <img src={`/q/${ministry.token}/photo/${p.id}`} alt={p.caption || ''} style={{ height: 90, width: '100%', objectFit: 'cover' }} />
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
                    {/* Quotations priced outside the portal still need to live here,
                        otherwise the calendar, Production page and presentation
                        have nothing to work from. */}
                    <div style={{ marginBottom: 14 }}>
                        <UploadQuotation ministryId={ministry.id} catalog={catalog} />
                    </div>
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
                                                <a href={`/q/${ministry.token}/quote/${q.id}/pdf?v=${encodeURIComponent((q.pdfBlobUrl || '').split('/').pop() || q.id)}`} target="_blank" rel="noreferrer" style={{ color: '#00857A', textDecoration: 'underline' }}>Open PDF</a>
                                                <ReplaceQuotePdf ministryId={ministry.id} quoteId={q.id} />
                                                <DeleteQuoteButton ministryId={ministry.id} quoteId={q.id} quoteRef={q.ref} action={deleteQuotationAction} />
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
