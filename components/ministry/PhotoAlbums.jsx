'use client';
import { useEffect, useState } from 'react';

// Accordion of ministry photo albums (shared event gallery). Each album header is
// a branded cover band (its first photo, darkened). Click to reveal/hide photos;
// multiple can be open; photos open in a lightbox.
// albums = [{ id, name, nameAr, photos: [{ id, caption }] }] — pass only albums
// that have photos. URLs use the shared, id-keyed routes (no link codes exposed).
export default function PhotoAlbums({ albums, initialOpenId = null, editable = false, setCoverAction = null }) {
    const [open, setOpen] = useState(() => new Set(initialOpenId != null ? [initialOpenId] : []));
    const [box, setBox] = useState(null); // { photos, i, name }

    const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const go = (d) => setBox((b) => (b ? { ...b, i: (b.i + d + b.photos.length) % b.photos.length } : b));

    useEffect(() => {
        if (!box) return;
        const onKey = (e) => { if (e.key === 'Escape') setBox(null); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); };
        window.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    }, [box]);

    const photoUrl = (id, w, q = 62) => `/gallery/photo/${id}?w=${w}&q=${q}`;
    const cur = box ? box.photos[box.i] : null;

    if (!albums.length) return <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', fontSize: 14, color: '#75787B', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>No photos have been shared yet.</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {albums.map((a) => {
                const isOpen = open.has(a.id);
                const coverId = a.coverId != null ? a.coverId : a.photos[0].id;
                return (
                    <section key={a.id} style={{ borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        {/* Branded cover header */}
                        <button type="button" onClick={() => toggle(a.id)}
                            style={{ position: 'relative', display: 'block', width: '100%', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', minHeight: 118 }}>
                            <img src={photoUrl(coverId, 1400, 55)} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.42)' }} />
                            <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, padding: '24px 24px', color: '#fff' }}>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.85 }}>Event Photo Gallery</div>
                                    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, textShadow: '0 1px 8px rgba(0,0,0,0.55)' }}>
                                        {a.name}{a.nameAr ? <span dir="rtl" style={{ marginLeft: 8, fontSize: 15, fontWeight: 500, opacity: 0.9 }}>{a.nameAr}</span> : null}
                                    </div>
                                    <div style={{ fontSize: 13, opacity: 0.9, marginTop: 3 }}>{a.photos.length} photo{a.photos.length === 1 ? '' : 's'} · shared by PICO</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <a href={`/gallery/zip/${a.id}`} onClick={(e) => e.stopPropagation()} download
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 8, background: '#fff', color: '#00857A', padding: '10px 18px', fontSize: 14, fontWeight: 700, textDecoration: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>⬇ Download all ({a.photos.length})</a>
                                    <span style={{ fontSize: 20, color: '#fff', opacity: 0.85, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>⌄</span>
                                </div>
                            </div>
                        </button>

                        {isOpen ? (
                            <div style={{ background: '#fff', padding: '14px 14px 16px' }}>
                                <div style={{ columnWidth: 180, columnGap: 10 }}>
                                    {a.photos.map((p, i) => {
                                        const isCover = String(p.id) === String(coverId);
                                        return (
                                            <div key={p.id} style={{ position: 'relative', marginBottom: 10, breakInside: 'avoid' }}>
                                                <button type="button" onClick={() => setBox({ photos: a.photos, i, name: a.name })}
                                                    style={{ display: 'block', width: '100%', padding: 0, border: isCover ? '2px solid #00857A' : 'none', borderRadius: 8, overflow: 'hidden', cursor: 'zoom-in', background: '#eef2f6', lineHeight: 0 }}>
                                                    <img src={photoUrl(p.id, 400)} alt={p.caption || ''} loading="lazy" style={{ width: '100%', height: 'auto', display: 'block' }} />
                                                </button>
                                                {isCover ? (
                                                    <span style={{ position: 'absolute', top: 6, left: 6, borderRadius: 6, background: '#00857A', color: '#fff', padding: '2px 8px', fontSize: 11, fontWeight: 700, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>★ Cover</span>
                                                ) : editable && setCoverAction ? (
                                                    <form action={setCoverAction} style={{ position: 'absolute', top: 6, right: 6, margin: 0 }}>
                                                        <input type="hidden" name="ministryId" value={a.id} />
                                                        <input type="hidden" name="photoId" value={p.id} />
                                                        <button type="submit" title="Use this photo as the album cover"
                                                            style={{ borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.92)', color: '#00857A', padding: '3px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>Set as cover</button>
                                                    </form>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : null}
                    </section>
                );
            })}

            {cur ? (
                <div onClick={() => setBox(null)} style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', flexDirection: 'column', background: 'rgba(11,17,29,0.95)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', color: '#e2e8f0' }} onClick={(e) => e.stopPropagation()}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{box.name}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 13, color: '#cbd5e1' }}>{box.i + 1} / {box.photos.length}</span>
                            <a href={photoUrl(cur.id, 2400, 90)} download onClick={(e) => e.stopPropagation()} style={{ borderRadius: 8, background: 'rgba(255,255,255,0.14)', color: '#fff', padding: '7px 12px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>⬇ Download</a>
                            <button type="button" onClick={() => setBox(null)} style={{ width: 38, height: 38, borderRadius: 19, border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 20, cursor: 'pointer' }}>✕</button>
                        </span>
                    </div>
                    <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px' }}>
                        {box.photos.length > 1 ? <button type="button" onClick={(e) => { e.stopPropagation(); go(-1); }} style={{ position: 'absolute', left: 8, width: 48, height: 48, borderRadius: 24, border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 26, cursor: 'pointer' }}>‹</button> : null}
                        <img src={photoUrl(cur.id, 1800, 82)} alt={cur.caption || ''} onClick={(e) => e.stopPropagation()} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', borderRadius: 4 }} />
                        {box.photos.length > 1 ? <button type="button" onClick={(e) => { e.stopPropagation(); go(1); }} style={{ position: 'absolute', right: 8, width: 48, height: 48, borderRadius: 24, border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 26, cursor: 'pointer' }}>›</button> : null}
                    </div>
                    {cur.caption ? <div onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center', color: '#e2e8f0', fontSize: 13, padding: '4px 16px 12px' }}>{cur.caption}</div> : null}
                </div>
            ) : null}
        </div>
    );
}
