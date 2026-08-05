'use client';
import { useEffect, useState } from 'react';

// Creates / copies / revokes the read-only production link for one meeting.
export default function ShareLink({ quotationId, token: initialToken }) {
    const [token, setToken] = useState(initialToken || null);
    const [origin, setOrigin] = useState('');
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [err, setErr] = useState('');

    // Built in the browser so the link matches whatever host the admin is on.
    useEffect(() => setOrigin(window.location.origin), []);
    const url = token ? `${origin}/production/${token}` : '';

    async function post(payload) {
        setBusy(true);
        setErr('');
        try {
            const res = await fetch('/api/quotations/production/share', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quotationId, ...payload }),
            });
            if (!res.ok) throw new Error();
            const data = await res.json();
            setToken(data.token);
        } catch { setErr('Failed — try again'); } finally { setBusy(false); }
    }

    async function copy() {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { setErr('Copy failed — select the link and copy manually'); }
    }

    const btn = (bg) => ({
        borderRadius: 6, background: bg, color: '#fff', border: 'none',
        padding: '5px 11px', fontSize: 11.5, fontWeight: 600,
        cursor: busy ? 'default' : 'pointer', whiteSpace: 'nowrap',
    });

    if (!token) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => post({})} disabled={busy} style={btn(busy ? '#cbd5e1' : '#00857A')}>
                    {busy ? 'Creating…' : '🔗 Create share link'}
                </button>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    View-only page for production / suppliers — no login, nothing editable, no prices.
                </span>
                {err ? <span style={{ fontSize: 11, color: '#dc2626' }}>{err}</span> : null}
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input readOnly value={url} onFocus={(e) => e.target.select()}
                style={{ flex: '1 1 260px', minWidth: 0, borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', padding: '5px 9px', fontSize: 11.5, color: '#4D4D4F' }} />
            <button type="button" onClick={copy} style={btn('#00857A')}>{copied ? 'Copied ✓' : 'Copy'}</button>
            <a href={url} target="_blank" rel="noreferrer" style={{ ...btn('#4D4D4F'), textDecoration: 'none', display: 'inline-block' }}>Preview</a>
            <button type="button" onClick={() => post({})} disabled={busy} title="Issues a new link and breaks the old one" style={btn(busy ? '#cbd5e1' : '#9a3412')}>New link</button>
            <button type="button" onClick={() => post({ revoke: true })} disabled={busy} style={btn(busy ? '#cbd5e1' : '#dc2626')}>Revoke</button>
            {err ? <span style={{ fontSize: 11, color: '#dc2626' }}>{err}</span> : null}
        </div>
    );
}
