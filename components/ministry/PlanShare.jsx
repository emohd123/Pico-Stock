'use client';

// One permanent link for management. It is deliberately not regenerable from
// here: once the address is in somebody's inbox or pinned in a chat, changing it
// silently breaks the page for everyone holding it.
import { useState } from 'react';

const TEAL = '#00857A', INK = '#22282B', MUTED = '#6B7A80';

export default function PlanShare({ url }) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            const box = document.createElement('textarea');
            box.value = url;
            box.style.cssText = 'position:fixed;top:-1000px';
            document.body.appendChild(box);
            box.select();
            document.execCommand('copy');
            box.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    };

    return (
        <>
            <button onClick={() => setOpen(true)}
                style={{ border: '1px solid #e2e8f0', background: '#fff', color: INK, borderRadius: 6, padding: '6px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                🔗 Share link
            </button>

            {!open ? null : (
                <div onClick={() => setOpen(false)}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 95, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div onClick={(e) => e.stopPropagation()}
                        style={{ background: '#fff', borderRadius: 12, width: 'min(620px, 96vw)', padding: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>Share the season plan</div>
                        <p style={{ fontSize: 12, color: MUTED, margin: '6px 0 14px', lineHeight: 1.55 }}>
                            Anyone with this link sees the plan exactly as it stands at the moment they open it — the same
                            timeline, calendar and inventory, always current. They cannot change anything, and the link
                            shows no quotation documents or ministry pages.
                            <br />
                            <strong style={{ color: INK }}>This address is permanent</strong> — it stays the same as meetings,
                            venues and quotations change, so it is safe to circulate once.
                        </p>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input readOnly value={url} onFocus={(e) => e.target.select()}
                                style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: INK, background: '#f8fafc', outline: 'none' }} />
                            <button onClick={copy}
                                style={{ border: 'none', background: copied ? '#15803d' : TEAL, color: '#fff', borderRadius: 6, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                {copied ? '✓ Copied' : 'Copy link'}
                            </button>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                            <a href={url} target="_blank" rel="noreferrer"
                                style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '7px 13px', fontSize: 12, fontWeight: 600, color: INK, textDecoration: 'none' }}>
                                Open it myself
                            </a>
                            <button onClick={() => setOpen(false)}
                                style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 6, padding: '7px 13px', fontSize: 12, fontWeight: 600, color: MUTED, cursor: 'pointer' }}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
