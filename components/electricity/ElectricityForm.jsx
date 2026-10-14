'use client';

import { useEffect, useMemo, useState } from 'react';
import ElectricityTopbar from './ElectricityTopbar';
import ElectricityTerms from './ElectricityTerms';
import { formatMoney } from '@/lib/eventMarketplacePricing';

const EMPTY_VENDOR = {
    company: '', restaurant: '', booth: '', contactPerson: '',
    mobile: '', tel: '', email: '', crNo: '', notes: '',
};

const FIELDS = [
    { key: 'company', label: 'Company name', required: true, wide: true, autoComplete: 'organization' },
    { key: 'restaurant', label: 'Restaurant name (English & Arabic)', wide: true, dir: 'auto', placeholder: 'e.g. Sio Specialty Coffee / سيو' },
    { key: 'contactPerson', label: 'Contact person', required: true, autoComplete: 'name' },
    { key: 'mobile', label: 'Mobile no.', required: true, type: 'tel', autoComplete: 'tel', placeholder: '+973 …' },
    { key: 'email', label: 'Email', required: true, type: 'email', autoComplete: 'email', hint: 'We send your order number and the payment details here.' },
    { key: 'tel', label: 'Tel', type: 'tel' },
    { key: 'crNo', label: 'C.R. No.' },
    { key: 'booth', label: 'Booth / unit no.', placeholder: 'If you know it' },
];

export function formatDay(value) {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function ElectricityForm({ editKey = '' }) {
    const [form, setForm] = useState(null);
    const [preview, setPreview] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [vendor, setVendor] = useState(EMPTY_VENDOR);
    const [qty, setQty] = useState({});
    const [agree, setAgree] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(null);
    const [editBlocked, setEditBlocked] = useState('');
    const [editRef, setEditRef] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (editKey) {
                    const response = await fetch(`/api/electricity/my/${encodeURIComponent(editKey)}`, { cache: 'no-store' });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data?.error || 'Order not found.');
                    if (cancelled) return;
                    setForm(data.form);
                    setVendor({ ...EMPTY_VENDOR, ...data.order.vendor });
                    setQty(Object.fromEntries(data.order.items.map((item) => [item.id, item.quantity])));
                    setAgree(true);
                    setEditRef(data.order.reference);
                    if (!data.editable) setEditBlocked('This order is already approved, so it can no longer be changed online. Please contact Pico.');
                    return;
                }
                const response = await fetch('/api/electricity', { cache: 'no-store' });
                const data = await response.json();
                if (!response.ok) throw new Error(data?.error || 'The form could not be loaded.');
                if (cancelled) return;
                setForm(data.form);
                setPreview(Boolean(data.preview));
            } catch (err) {
                if (!cancelled) setLoadError(err.message || 'The form could not be loaded.');
            }
        })();
        return () => { cancelled = true; };
    }, [editKey]);

    const currency = form?.currency || 'BHD';
    const lines = useMemo(() => (form?.items || []).map((item) => {
        const quantity = Number(qty[item.id]) || 0;
        return { ...item, quantity, lineTotal: item.price * quantity };
    }), [form, qty]);
    const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const chosen = lines.filter((line) => line.quantity > 0);

    function setField(key, value) {
        setVendor((current) => ({ ...current, [key]: value }));
    }

    function setQuantity(id, value) {
        const next = Math.max(0, Math.min(99, Number.parseInt(value, 10) || 0));
        setQty((current) => ({ ...current, [id]: next }));
    }

    function step(id, delta) {
        setQty((current) => ({ ...current, [id]: Math.max(0, Math.min(99, (Number(current[id]) || 0) + delta)) }));
    }

    async function submit(event) {
        event.preventDefault();
        setError('');
        if (chosen.length === 0) {
            setError('Enter a quantity for at least one power option.');
            return;
        }
        if (!agree) {
            setError('Please accept the terms and conditions.');
            return;
        }
        setBusy(true);
        try {
            const payload = { vendor, items: chosen.map((line) => ({ id: line.id, quantity: line.quantity })) };
            const response = await fetch(editKey ? `/api/electricity/my/${encodeURIComponent(editKey)}` : '/api/electricity/orders', {
                method: editKey ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data?.error || 'The order could not be sent.');
            if (editKey) {
                window.location.href = `/electricity/order/${encodeURIComponent(editKey)}?updated=1`;
                return;
            }
            setDone(data);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            setError(err.message || 'The order could not be sent.');
        } finally {
            setBusy(false);
        }
    }

    const findLink = (
        <a className="elx-topbtn" href="/electricity/find">My order</a>
    );

    if (loadError || !form) {
        return (
            <div className="evm-page">
                <ElectricityTopbar>{findLink}</ElectricityTopbar>
                <main className="evm-main"><div className="evm-container elx-wrap">
                    <div className={`evm-notice${loadError ? ' error' : ''}`}>{loadError || 'Loading the form…'}</div>
                </div></main>
            </div>
        );
    }

    if (done) {
        return (
            <div className="evm-page">
                <ElectricityTopbar>{findLink}</ElectricityTopbar>
                <main className="evm-main"><div className="evm-container elx-wrap">
                    <section className="exo-card elx-done">
                        <span className="evm-eyebrow">Order sent</span>
                        <h1>Thank you, we received your order</h1>
                        <p className="exo-hint">Your order number is</p>
                        <div className="elx-ref">{done.reference}</div>
                        <p className="exo-hint">Keep it to follow up on your order or change it.{!done.warning && <> We emailed it to <strong>{vendor.email}</strong>.</>}</p>
                        {done.warning && <div className="exo-alert">{done.warning}</div>}
                        <ol className="elx-next">
                            <li>Pico checks your order.</li>
                            <li>Once approved, we email you our bank details for payment.</li>
                            <li>Pay by bank transfer, then send us the receipt: reply to that email, or upload it on your order page.</li>
                            <li>We confirm your order by email once the payment is received.</li>
                        </ol>
                        <a className="evm-cta elx-cta-link" href={done.orderUrl}>Open my order page</a>
                    </section>
                </div></main>
            </div>
        );
    }

    const closed = form.status !== 'open' && !preview && !editKey;

    return (
        <div className="evm-page">
            <ElectricityTopbar>{findLink}</ElectricityTopbar>
            <main className="evm-main">
                <div className="evm-container elx-wrap">
                    {preview && <div className="evm-notice elx-preview">Admin preview: this form is <strong>{form.status}</strong>, so vendors cannot submit it yet. Open it from the admin page.</div>}

                    <section className="exo-card elx-hero">
                        <div className="elx-hero-tag">FORM B</div>
                        <h1>{form.title}</h1>
                        {form.eventName && <p className="elx-event">{form.eventName}</p>}
                        <p className="elx-meta">
                            {[form.eventDates && `Event dates: ${form.eventDates}`, form.venue].filter(Boolean).join(' · ')}
                        </p>
                        {form.submitBy && <p className="elx-deadline">Please submit this form by <strong>{formatDay(form.submitBy)}</strong></p>}
                        {editKey && <div className="exo-info elx-editing">You are changing order <strong>{editRef}</strong>. Saving keeps the same order number.</div>}
                    </section>

                    {closed ? (
                        <div className="evm-notice">This form is not accepting orders at the moment. Please contact Pico at {form.receiptEmail}{form.contactPhone ? ` or ${form.contactPhone}` : ''}.</div>
                    ) : editBlocked ? (
                        <div className="evm-notice">{editBlocked} <a href={`/electricity/order/${encodeURIComponent(editKey)}`}>Back to my order</a></div>
                    ) : (
                        <form onSubmit={submit} className="elx-form">
                            <section className="exo-card">
                                <h2>1. Your details</h2>
                                <div className="elx-grid">
                                    {FIELDS.map((field) => (
                                        <label key={field.key} className={`elx-field${field.wide ? ' wide' : ''}`}>
                                            <span>{field.label}{field.required && <em> *</em>}</span>
                                            <input
                                                type={field.type || 'text'}
                                                value={vendor[field.key]}
                                                onChange={(e) => setField(field.key, e.target.value)}
                                                required={field.required}
                                                dir={field.dir}
                                                placeholder={field.placeholder}
                                                autoComplete={field.autoComplete || 'off'}
                                            />
                                            {field.hint && <small>{field.hint}</small>}
                                        </label>
                                    ))}
                                </div>
                            </section>

                            <section className="exo-card">
                                <h2>2. Additional electricity</h2>
                                {form.intro && <p className="elx-intro">{form.intro}</p>}
                                <div className="elx-table" role="table">
                                    <div className="elx-row head" role="row">
                                        <span>No.</span><span>Description</span><span className="num">Unit cost</span><span className="num">Qty</span><span className="num">Cost</span>
                                    </div>
                                    {lines.map((line, index) => (
                                        <div key={line.id} className={`elx-row${line.quantity ? ' on' : ''}`} role="row">
                                            <span className="elx-no">{index + 1}</span>
                                            <span className="elx-desc">{line.name}</span>
                                            <span className="num elx-unit">{formatMoney(line.price, currency)}</span>
                                            <span className="num">
                                                <span className="elx-qty">
                                                    <button type="button" onClick={() => step(line.id, -1)} aria-label={`Less ${line.name}`}>−</button>
                                                    <input inputMode="numeric" value={line.quantity} onChange={(e) => setQuantity(line.id, e.target.value)} aria-label={`Quantity of ${line.name}`} />
                                                    <button type="button" onClick={() => step(line.id, 1)} aria-label={`More ${line.name}`}>+</button>
                                                </span>
                                            </span>
                                            <span className="num elx-cost">{line.quantity ? formatMoney(line.lineTotal, currency) : '—'}</span>
                                        </div>
                                    ))}
                                    <div className="elx-row total" role="row">
                                        <span /><span>Total cost</span><span /><span /><span className="num">{formatMoney(total, currency)}</span>
                                    </div>
                                </div>
                                <p className="elx-vat">All prices are inclusive of VAT</p>
                                <label className="elx-field wide" style={{ marginTop: '1rem' }}>
                                    <span>Anything not listed? Tell us here</span>
                                    <textarea rows={3} value={vendor.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="e.g. 2 extra 13 amp power points for each booth" />
                                </label>
                            </section>

                            <section className="exo-card">
                                <h2>3. Terms &amp; conditions</h2>
                                <ElectricityTerms text={form.terms} />
                                <p className="exo-hint">
                                    <strong>Payment:</strong> nothing to pay now. Once Pico approves your order, we email you the bank details. Full payment in favour of
                                    {' '}&ldquo;Pico International (Bahrain)&rdquo; by bank transfer confirms the order.
                                </p>
                                <label className="elx-agree">
                                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                                    <span>I have read and accept the terms and conditions.</span>
                                </label>
                            </section>

                            <div className="elx-submit">
                                <div>
                                    <span>Total cost</span>
                                    <strong>{formatMoney(total, currency)}</strong>
                                </div>
                                {error && <div className="exo-alert">{error}</div>}
                                <button type="submit" className="evm-cta" disabled={busy || (preview && !editKey)}>
                                    {busy ? 'Sending…' : editKey ? 'Save changes' : 'Send order'}
                                </button>
                                {editKey && <a className="evm-link-btn" href={`/electricity/order/${encodeURIComponent(editKey)}`}>Cancel, back to my order</a>}
                            </div>
                        </form>
                    )}

                    <p className="exo-hint" style={{ textAlign: 'center' }}>
                        Questions? {form.contactPhone} · {form.receiptEmail}
                    </p>
                </div>
            </main>
        </div>
    );
}
