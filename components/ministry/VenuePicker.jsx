'use client';

// Deciding a venue is the one planning edit that can dissolve a shortfall for
// free, so it belongs on the plan page itself rather than behind an edit of the
// quotation. Saving refreshes the server component, which recomputes clashes,
// chains and inventory immediately — the number you were worried about changes
// in front of you.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const TEAL = '#00857A', INK = '#22282B', MUTED = '#6B7A80', RED = '#dc2626';
const OTHER = '__other__';

export default function VenuePicker({ ministryId, quotationIds, venue, unknown, options }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [value, setValue] = useState(unknown ? '' : venue);
    const [custom, setCustom] = useState('');
    const [mode, setMode] = useState('list');
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    const save = (next) => {
        setError('');
        fetch('/api/quotations/venue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ministryId, quotationIds, venue: next }),
        })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 401 ? 'Session expired — sign in again' : 'Could not save'))))
            .then(() => {
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
                // Re-run the server component so every derived number updates.
                start(() => router.refresh());
            })
            .catch((e) => { setError(e.message); setValue(unknown ? '' : venue); });
    };

    const onSelect = (e) => {
        const v = e.target.value;
        if (v === OTHER) { setMode('custom'); return; }
        setValue(v);
        save(v);
    };

    if (mode === 'custom') {
        return (
            <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                <input autoFocus value={custom} onChange={(e) => setCustom(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && custom.trim()) { setValue(custom.trim()); setMode('list'); save(custom.trim()); } if (e.key === 'Escape') setMode('list'); }}
                    placeholder="Type the venue…"
                    style={{ border: `1px solid ${TEAL}`, borderRadius: 6, padding: '3px 7px', fontSize: 11.5, width: 160, outline: 'none' }} />
                <button onClick={() => { if (custom.trim()) { setValue(custom.trim()); setMode('list'); save(custom.trim()); } }}
                    style={{ border: 'none', background: TEAL, color: '#fff', borderRadius: 6, padding: '4px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Set</button>
                <button onClick={() => setMode('list')} style={{ border: '1px solid #e2e8f0', background: '#fff', color: MUTED, borderRadius: 6, padding: '3px 7px', fontSize: 11, cursor: 'pointer' }}>✕</button>
            </span>
        );
    }

    return (
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <select value={value} onChange={onSelect} disabled={pending}
                style={{
                    border: `1px solid ${unknown && !value ? RED : '#e2e8f0'}`, borderRadius: 6, padding: '3px 7px',
                    fontSize: 11.5, color: unknown && !value ? RED : INK, background: '#fff',
                    fontWeight: unknown && !value ? 700 : 400, cursor: 'pointer', maxWidth: 190,
                }}>
                <option value="">— not decided —</option>
                {options.map((v) => <option key={v} value={v}>{v}</option>)}
                {value && !options.includes(value) ? <option value={value}>{value}</option> : null}
                <option value={OTHER}>Other venue…</option>
            </select>
            {pending ? <span style={{ fontSize: 10, color: MUTED }}>updating…</span> : null}
            {saved && !pending ? <span style={{ fontSize: 10, color: TEAL, fontWeight: 700 }}>✓ saved</span> : null}
            {error ? <span style={{ fontSize: 10, color: RED }}>{error}</span> : null}
        </span>
    );
}
