'use client';
import { useEffect } from 'react';

// In-page PDF viewer: shows a quotation in an iframe popup (no download needed).
// url = the inline PDF URL; pass onClose to dismiss.
export default function PdfModal({ url, title, onClose }) {
    useEffect(() => {
        function onKey(e) { if (e.key === 'Escape') onClose(); }
        window.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    }, [onClose]);

    if (!url) return null;
    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', flexDirection: 'column', background: 'rgba(11,17,29,0.75)', padding: '3vh 3vw' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', flex: 1, maxWidth: 1000, width: '100%', margin: '0 auto', background: '#fff', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid #e2e8f0', padding: '10px 16px' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#4D4D4F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title || 'Quotation'}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <a href={`${url}${url.includes('?') ? '&' : '?'}download=1`} style={{ borderRadius: 6, border: '1px solid #cbd5e1', padding: '6px 12px', fontSize: 13, fontWeight: 600, color: '#00857A', textDecoration: 'none' }}>⬇ Save PDF</a>
                        <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 17, border: 'none', background: '#f1f5f9', color: '#475569', fontSize: 18, cursor: 'pointer' }}>✕</button>
                    </div>
                </div>
                <iframe src={url} title={title || 'Quotation'} style={{ flex: 1, width: '100%', border: 'none' }} />
            </div>
        </div>
    );
}
