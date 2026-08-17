'use client';
import { useState } from 'react';

// Anything the client asked for on this one item — a colour, a spelling, one
// extra unit, "keep it low so the camera clears it". Saves on blur, same as
// ItemTitle, because a Save button per row in a 35-row table is worse than the
// occasional lost keystroke. Whatever is typed here shows on the shared
// production link and in its PDF, so the crew reads it without being told.
export default function ClientNote({ quotationId, itemNo, note }) {
    const [value, setValue] = useState(note || '');
    const [saved, setSaved] = useState(note || '');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(false);

    async function save() {
        const next = value.trim();
        if (next === saved) return;
        setBusy(true);
        setErr(false);
        try {
            const res = await fetch('/api/quotations/production', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quotationId, itemNo, clientNote: next }),
            });
            if (!res.ok) throw new Error();
            setSaved(next);
        } catch { setErr(true); } finally { setBusy(false); }
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
            <span aria-hidden style={{ fontSize: 10 }}>💬</span>
            <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={save}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                disabled={busy}
                maxLength={500}
                placeholder="Client note for this item…"
                title="Shown to the team on the shared production sheet"
                style={{
                    flex: 1, minWidth: 0, boxSizing: 'border-box',
                    borderRadius: 6, padding: '3px 8px', fontSize: 11.5,
                    border: `1px solid ${err ? '#dc2626' : value ? '#fed7aa' : '#e2e8f0'}`,
                    background: err ? '#fef2f2' : value ? '#fff7ed' : '#fff',
                    color: '#22282B',
                }}
            />
            {err ? <span style={{ fontSize: 10, color: '#dc2626' }}>not saved</span> : null}
        </div>
    );
}
