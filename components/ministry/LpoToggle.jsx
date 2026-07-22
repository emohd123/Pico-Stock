'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Admin checkbox: mark the LPO (purchase order) as received. When checked, the
// ministry's dates turn red (confirmed 100%) on the bookings calendar.
export default function LpoToggle({ ministryId, initial }) {
    const router = useRouter();
    const [checked, setChecked] = useState(Boolean(initial));
    const [busy, setBusy] = useState(false);

    async function toggle(e) {
        const next = e.target.checked;
        setChecked(next);
        setBusy(true);
        try {
            const res = await fetch('/api/quotations/lpo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ministryId, received: next }) });
            if (!res.ok) throw new Error();
            router.refresh();
        } catch {
            setChecked(!next); // revert on failure
        } finally { setBusy(false); }
    }

    return (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: busy ? 'default' : 'pointer', fontSize: 14, color: checked ? '#dc2626' : '#4D4D4F', fontWeight: checked ? 600 : 400 }}>
            <input type="checkbox" checked={checked} onChange={toggle} disabled={busy} style={{ width: 16, height: 16, accentColor: '#dc2626' }} />
            LPO received{checked ? ' — confirmed 100%' : ''}
        </label>
    );
}
