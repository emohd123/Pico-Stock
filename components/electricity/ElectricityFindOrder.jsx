'use client';

import { useState } from 'react';
import ElectricityTopbar from './ElectricityTopbar';

export default function ElectricityFindOrder() {
    const [reference, setReference] = useState('');
    const [contact, setContact] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function submit(event) {
        event.preventDefault();
        setError('');
        setBusy(true);
        try {
            const response = await fetch('/api/electricity/find', {
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
            <ElectricityTopbar eyebrow="Additional electricity" title="Find your order" />
            <main className="evm-main">
                <div className="evm-container elx-wrap">
                    <form className="exo-card fo-form" onSubmit={submit}>
                        <h1>Find your order</h1>
                        <p className="exo-hint">Enter your order number and the email or mobile number you used on the form. You can then check the status, pay, send your receipt or change the order.</p>
                        <label>
                            <span>Order number</span>
                            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. ELEC-261013-AB12" autoCapitalize="characters" required />
                        </label>
                        <label>
                            <span>Email or mobile used on the order</span>
                            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="name@company.com or +973 …" required />
                        </label>
                        {error && <div className="exo-alert">{error}</div>}
                        <button type="submit" className="evm-cta" disabled={busy}>{busy ? 'Looking…' : 'Open my order'}</button>
                        <p className="exo-hint" style={{ margin: 0 }}>Your order number is in the email we sent you after ordering.</p>
                        <a className="evm-link-btn" href="/electricity">← Back to the order form</a>
                    </form>
                </div>
            </main>
        </div>
    );
}
