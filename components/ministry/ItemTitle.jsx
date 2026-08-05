'use client';
import { useState } from 'react';

// The meeting title printed on a staged item (backdrop banner / backwall /
// platform / wooden title board). Saves on blur so there is no extra button in
// an already-dense table row.
export default function ItemTitle({ quotationId, itemNo, title, hint }) {
    const [value, setValue] = useState(title || '');
    const [saved, setSaved] = useState(title || '');
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
                body: JSON.stringify({ quotationId, itemNo, title: next }),
            });
            if (!res.ok) throw new Error();
            setSaved(next);
        } catch { setErr(true); } finally { setBusy(false); }
    }

    return (
        <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            disabled={busy}
            placeholder={hint || 'Event title for this item…'}
            title={hint}
            style={{
                width: '100%', boxSizing: 'border-box', marginTop: 3,
                borderRadius: 6, padding: '3px 8px', fontSize: 11.5,
                border: `1px solid ${err ? '#dc2626' : '#cbd5e1'}`,
                background: err ? '#fef2f2' : value ? '#f0fdfa' : '#fff',
                color: '#22282B',
            }}
        />
    );
}
