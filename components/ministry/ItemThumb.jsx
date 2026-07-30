'use client';
import { useEffect, useState } from 'react';

// Clickable item thumbnail — opens the full photo in a lightbox (Esc/click to close).
export default function ItemThumb({ src, name }) {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    }, [open]);

    if (!src) return <span style={{ display: 'inline-block', width: 36, height: 30 }} />;

    return (
        <>
            <button type="button" onClick={() => setOpen(true)} title="Click to enlarge"
                style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in', lineHeight: 0 }}>
                <img src={src} alt={name || ''} style={{ width: 36, height: 30, objectFit: 'cover', borderRadius: 4, border: '1px solid #e2e8f0' }} />
            </button>
            {open ? (
                <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', padding: 16 }}>
                    <div onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh', maxWidth: 760, overflow: 'hidden', borderRadius: 12, background: '#fff' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #f1f5f9', padding: '8px 16px' }}>
                            <span style={{ fontSize: 14, fontWeight: 500, color: '#4D4D4F' }}>{name}</span>
                            <button type="button" onClick={() => setOpen(false)} style={{ fontSize: 14, color: '#75787B', background: 'none', border: 'none', cursor: 'pointer' }}>✕ Close</button>
                        </div>
                        <img src={src} alt={name || ''} style={{ maxHeight: '80vh', width: '100%', objectFit: 'contain', display: 'block' }} />
                    </div>
                </div>
            ) : null}
        </>
    );
}
