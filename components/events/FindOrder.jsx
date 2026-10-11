'use client';

import { useState } from 'react';
import './event-marketplace.css';

export default function FindOrder() {
    const [reference, setReference] = useState('');
    const [contact, setContact] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function submit(event) {
        event.preventDefault();
        setError('');
        setBusy(true);
        try {
            const response = await fetch('/api/event-orders/find', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference, contact }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data?.error || 'Order not found.');
            window.location.href = data.orderUrl;
        } catch (err) {
            setError(err.message || 'Order not found.');
            setBusy(false);
        }
    }

    return (
        <div className="evm-page">
            <header className="evm-topbar">
                <div className="evm-container evm-topbar-inner">
                    <div className="evm-topbar-title">
                        <span className="evm-eyebrow">Pico event orders</span>
                        <strong>Find your order</strong>
                    </div>
                </div>
            </header>
            <main className="evm-main">
                <div className="evm-container exo-wrap">
                    <form className="exo-card fo-form" onSubmit={submit}>
                        <h1>Find your order</h1>
                        <p className="exo-hint">Closed the page? Enter your order number and the email or phone number you used when ordering. You can then pay, upload your receipt, check the status or change the order.</p>
                        <label>
                            <span>Order number</span>
                            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. RBC26-261011-AB12" autoCapitalize="characters" required />
                        </label>
                        <label>
                            <span>Email or phone used on the order</span>
                            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="name@company.com or +973 …" required />
                        </label>
                        {error && <div className="exo-alert">{error}</div>}
                        <button type="submit" className="evm-cta" disabled={busy}>{busy ? 'Looking…' : 'Open my order'}</button>
                        <p className="exo-hint" style={{ margin: 0 }}>Your order number starts with RBC26 and is in the email we sent you.</p>
                    </form>
                </div>
            </main>
        </div>
    );
}
