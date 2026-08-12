'use client';

// The plan is computed fresh on every request, so "live" here means: pull again
// without losing your place. A manual button for when you have just changed
// something, and an optional auto-pull that only runs while the tab is actually
// being looked at — a background tab hammering the database helps nobody.
import { useState, useEffect, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';

const TEAL = '#00857A', MUTED = '#6B7A80';
const EVERY_MS = 60000;

export default function PlanRefresh({ generatedAt }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [auto, setAuto] = useState(false);
    const [stamp, setStamp] = useState('');
    const timer = useRef(null);

    // Server-rendered time formatted on the client, so it reads in the viewer's
    // own timezone instead of the build server's.
    useEffect(() => {
        if (!generatedAt) return;
        setStamp(new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, [generatedAt]);

    const pull = () => start(() => router.refresh());

    useEffect(() => {
        if (!auto) return undefined;
        const tick = () => { if (document.visibilityState === 'visible') pull(); };
        timer.current = setInterval(tick, EVERY_MS);
        const onShow = () => { if (document.visibilityState === 'visible') pull(); };
        document.addEventListener('visibilitychange', onShow);
        return () => { clearInterval(timer.current); document.removeEventListener('visibilitychange', onShow); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auto]);

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10.5, color: MUTED }}>
                {pending ? 'updating…' : stamp ? `updated ${stamp}` : ''}
            </span>
            <button onClick={pull} disabled={pending}
                style={{
                    border: 'none', background: TEAL, color: '#fff', borderRadius: 6,
                    padding: '6px 13px', fontSize: 12, fontWeight: 700, cursor: pending ? 'default' : 'pointer',
                    opacity: pending ? 0.65 : 1,
                }}>
                {pending ? '⟳ Updating' : '⟳ Update plan'}
            </button>
            <label title="Pull again every minute while this tab is open"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: MUTED, cursor: 'pointer' }}>
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} style={{ cursor: 'pointer' }} />
                live
                {auto ? <span style={{ width: 7, height: 7, borderRadius: 4, background: '#16a34a', display: 'inline-block' }} /> : null}
            </label>
        </span>
    );
}
