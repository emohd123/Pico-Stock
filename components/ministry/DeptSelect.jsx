'use client';
import { useState } from 'react';
import { DEPARTMENTS } from '@/lib/ministry/production';

// Per-item department dropdown on the Production page. Saves an override for
// this quotation item; optimistic with revert on failure (LpoToggle pattern).
export default function DeptSelect({ quotationId, itemNo, dept }) {
    const [value, setValue] = useState(dept);
    const [busy, setBusy] = useState(false);

    async function change(e) {
        const next = e.target.value;
        const prev = value;
        setValue(next);
        setBusy(true);
        try {
            const res = await fetch('/api/quotations/production', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quotationId, itemNo, dept: next }),
            });
            if (!res.ok) throw new Error();
        } catch {
            setValue(prev);
        } finally { setBusy(false); }
    }

    return (
        <select value={value} onChange={change} disabled={busy}
            style={{ borderRadius: 6, border: '1px solid #cbd5e1', padding: '3px 6px', fontSize: 12, background: '#fff', color: '#4D4D4F', opacity: busy ? 0.6 : 1 }}>
            {DEPARTMENTS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
    );
}
