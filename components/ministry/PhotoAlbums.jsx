'use client';
import { useEffect, useState } from 'react';

// Accordion of ministry photo albums (shared event gallery). Click an album to
// reveal its photos, click again to hide. Multiple can be open. Photos open in a
// lightbox. albums = [{ id, name, nameAr, photos: [{ id, caption }] }].
// URLs use the shared, id-keyed routes so no private link codes are exposed.
export default function PhotoAlbums({ albums, initialOpenId = null }) {
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {albums.map((a) => {
                const isOpen = open.has(a.id);
                return (
                    <section key={a.id} style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                        <button type="button" onClick={() => a.photos.length && toggle(a.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: 12, cursor: a.photos.length ? 'pointer' : 'default' }}>
                            <span style={{ width: 84, height: 60, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#eef2f6' }}>
                                {a.photos.length ? <img src={photoUrl(a.photos[0].id, 200, 55)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                            </span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: '#4D4D4F' }}>{a.name}
                                    {a.nameAr ? <span dir="rtl" style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: '#75787B' }}>{a.nameAr}</span> : null}
                                </span>
                                <span style={{ display: 'block', fontSize: 13, color: '#75787B', marginTop: 2 }}>{a.photos.length ? `${a.photos.length} photo${a.photos.length === 1 ? '' : 's'}` : 'No photos yet'}</span>
                            </span>
                            {a.photos.length ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                    <a href={`/gallery/zip/${a.id}`} onClick={(e) => e.stopPropagation()} style={{ borderRadius: 6, border: '1px solid #cbd5e1', padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#00857A', textDecoration: 'none' }}>⬇ Download all</a>
                                    <span style={{ fontSize: 18, color: '#94a3b8', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▸</span>
                                </span>
                            ) : null}
                        </button>

                        {isOpen ? (
                            <div style={{ padding: '0 12px 14px', borderTop: '1px solid #f1f5f9' }}>
                                <div style={{ marginTop: 12, columnWidth: 180, columnGap: 10 }}>
                                    {a.photos.map((p, i) => (
                                        <button key={p.id} type="button" onClick={() => setBox({ photos: a.photos, i, name: a.name })}
                                            style={{ display: 'block', width: '100%', marginBottom: 10, breakInside: 'avoid', padding: 0, border: 'none', borderRadius: 8, overflow: 'hidden', cursor: 'zoom-in', background: '#eef2f6', lineHeight: 0 }}>
                                            <img src={photoUrl(p.id, 400)} alt={p.caption || ''} loading="lazy" style={{ width: '100%', height: 'auto', display: 'block' }} />
                                        </button>
                                    ))}
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
