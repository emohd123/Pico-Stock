'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { extractCleanName } from '@/lib/nameHelpers';
import { formatMoney } from '@/lib/eventMarketplacePricing';
import './event-marketplace.css';

const FILTERS = [
    { value: 'pending', label: 'To review' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'declined', label: 'Declined' },
    { value: 'all', label: 'All' },
];

const PENDING = new Set(['new', 'contacted', 'quoted']);

function itemName(name) {
    if (!/^ID\b/i.test(name || '')) return name;
    const clean = extractCleanName(name);
    return clean === '--' ? name : clean;
}

function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function statusLabel(status) {
    if (PENDING.has(status)) return 'To review';
    return status === 'confirmed' ? 'Confirmed' : status === 'declined' ? 'Declined' : status;
}

export default function OrganizerReview({ slug, reviewKey }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('pending');
    const [busy, setBusy] = useState('');
    const [flash, setFlash] = useState(null);

    const endpoint = `/api/events/${encodeURIComponent(slug)}/review/${encodeURIComponent(reviewKey)}`;

    const load = useCallback(async () => {
        try {
            const response = await fetch(endpoint, { cache: 'no-store' });
            const json = await response.json();
            if (!response.ok) throw new Error(json?.error || 'Unable to load requests.');
            setData(json);
            setError('');
        } catch (err) {
            setError(err.message || 'Unable to load requests.');
        }
    }, [endpoint]);

    useEffect(() => { load(); }, [load]);

    async function act(request, action) {
        const verb = action === 'confirm' ? 'Confirm' : 'Decline';
        if (!window.confirm(`${verb} request ${request.reference} from ${request.company}?`)) return;
        setBusy(request.id);
        setFlash(null);
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId: request.id, action }),
            });
            const json = await response.json();
            if (!response.ok) throw new Error(json?.error || 'Update failed.');
            setFlash({ type: 'ok', text: `${request.reference} ${action === 'confirm' ? 'confirmed' : 'declined'}.` });
        } catch (err) {
            setFlash({ type: 'err', text: err.message || 'Update failed.' });
        } finally {
            // Every confirmation changes what is left for the others, so reload all.
            await load();
            setBusy('');
        }
    }

    const requests = useMemo(() => data?.requests || [], [data]);
    const counts = useMemo(() => ({
        pending: requests.filter((r) => PENDING.has(r.status)).length,
        confirmed: requests.filter((r) => r.status === 'confirmed').length,
        declined: requests.filter((r) => r.status === 'declined').length,
        all: requests.length,
    }), [requests]);
    const shown = requests.filter((r) => filter === 'all' || (filter === 'pending' ? PENDING.has(r.status) : r.status === filter));
    const currency = data?.event?.currency || 'BHD';
    const confirmedValue = requests.filter((r) => r.status === 'confirmed').reduce((sum, r) => sum + (Number(r.total) || 0), 0);

    return (
        <div className="evm-page">
            <header className="evm-topbar">
                <div className="evm-container evm-topbar-inner">
                    <div className="evm-topbar-title">
                        <span className="evm-eyebrow">Organizer review</span>
                        <strong>{data?.event?.name || 'Event requests'}</strong>
                    </div>
                </div>
            </header>

            <main className="evm-main">
                <div className="evm-container">
                    {error ? (
                        <div className="evm-notice">{error}</div>
                    ) : !data ? (
                        <div className="evm-notice">Loading requests…</div>
                    ) : (
                        <>
                            <p className="evm-intro">
                                Exhibitor requests received through the Pico event page. Confirm a request to reserve its items; quantities shown as available already take every other confirmed request into account.
                            </p>

                            <div className="orv-stats">
                                <div><span>To review</span><strong>{counts.pending}</strong></div>
                                <div><span>Confirmed</span><strong>{counts.confirmed}</strong></div>
                                <div><span>Confirmed value (incl. VAT)</span><strong>{formatMoney(confirmedValue, currency)}</strong></div>
                            </div>

                            <div className="evm-chips" style={{ margin: '1rem 0' }}>
                                {FILTERS.map((f) => (
                                    <button key={f.value} type="button" className={`evm-chip${filter === f.value ? ' active' : ''}`} onClick={() => setFilter(f.value)}>
                                        {f.label} ({counts[f.value]})
                                    </button>
                                ))}
                            </div>

                            {flash && <div className={`orv-flash ${flash.type}`}>{flash.text}</div>}

                            {shown.length === 0 ? (
                                <div className="evm-notice">No requests here.</div>
                            ) : shown.map((request) => {
                                const short = request.items.filter((item) => item.available !== null && item.quantity > item.available);
                                const canConfirm = request.status !== 'confirmed' && short.length === 0;
                                return (
                                    <article key={request.id} className={`orv-card ${request.status}`}>
                                        <div className="orv-head">
                                            <div>
                                                <span className="orv-ref">{request.reference} · {formatDate(request.createdAt)}</span>
                                                <h3>{request.company}</h3>
                                                <p className="orv-contact">
                                                    {[request.contact.name, request.contact.phone, request.contact.email, request.contact.stand && `Stand: ${request.contact.stand}`].filter(Boolean).join(' · ')}
                                                </p>
                                            </div>
                                            <span className={`orv-status ${request.status}`}>{statusLabel(request.status)}</span>
                                        </div>

                                        <div className="orv-lines">
                                            {request.items.map((item, index) => {
                                                const lacking = item.available !== null && item.quantity > item.available && request.status !== 'confirmed';
                                                return (
                                                    <div key={`${item.id}-${index}`} className={`orv-line${lacking ? ' short' : ''}`}>
                                                        {item.image ? <img src={item.image} alt="" loading="lazy" /> : <div className="orv-noimg" />}
                                                        <div className="orv-line-main">
                                                            <strong>{itemName(item.name)}</strong>
                                                            {item.comment && <small>Note: {item.comment}</small>}
                                                            {item.available !== null && (
                                                                <small className={lacking ? 'orv-warn' : 'orv-ok'}>
                                                                    {lacking ? (item.available === 0 ? 'None left — already confirmed for others' : `Only ${item.available} available`) : `${item.available} available`}
                                                                </small>
                                                            )}
                                                        </div>
                                                        <div className="orv-line-qty">× {item.quantity}</div>
                                                        <div className="orv-line-total">{formatMoney(item.lineTotal, currency)}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {request.contact.notes && <p className="orv-notes">Exhibitor notes: {request.contact.notes}</p>}

                                        <div className="orv-foot">
                                            <div className="orv-total">
                                                <span>Subtotal {formatMoney(request.subtotal, currency)} · VAT {request.vatPercent}% {formatMoney(request.vatAmount, currency)}</span>
                                                <strong>{formatMoney(request.total, currency)}</strong>
                                            </div>
                                            <div className="orv-actions">
                                                {request.status !== 'declined' && (
                                                    <button type="button" className="orv-btn decline" disabled={busy === request.id} onClick={() => act(request, 'decline')}>Decline</button>
                                                )}
                                                {request.status !== 'confirmed' && (
                                                    <button
                                                        type="button"
                                                        className="orv-btn confirm"
                                                        disabled={busy === request.id || !canConfirm}
                                                        title={canConfirm ? '' : 'Some items do not have enough stock'}
                                                        onClick={() => act(request, 'confirm')}
                                                    >
                                                        {busy === request.id ? 'Saving…' : 'Confirm order'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {short.length > 0 && request.status !== 'confirmed' && (
                                            <p className="orv-warn" style={{ margin: '0.6rem 0 0' }}>
                                                Not enough stock for {short.length === 1 ? 'one item' : `${short.length} items`}. Contact Pico to adjust this request before confirming.
                                            </p>
                                        )}
                                    </article>
                                );
                            })}
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
