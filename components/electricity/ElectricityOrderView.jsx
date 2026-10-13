'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import ElectricityTopbar from './ElectricityTopbar';
import { formatDay } from './ElectricityForm';
import { formatMoney } from '@/lib/eventMarketplacePricing';

const STEPS = [
    { stage: 'review', label: 'Order received' },
    { stage: 'awaiting', label: 'Approved, payment details sent' },
    { stage: 'verifying', label: 'Receipt sent' },
    { stage: 'confirmed', label: 'Paid & confirmed' },
];
const STAGE_INDEX = { review: 0, awaiting: 1, rejected: 1, verifying: 2, confirmed: 3 };

function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function CopyRow({ label, value }) {
    const [copied, setCopied] = useState(false);
    async function copy() {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {}
    }
    return (
        <div className="exo-bank-row">
            <span>{label}</span>
            <strong>{value}</strong>
            <button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
    );
}

const DETAIL_LABELS = [
    ['company', 'Company'], ['restaurant', 'Restaurant'], ['booth', 'Booth / unit'], ['contactPerson', 'Contact person'],
    ['mobile', 'Mobile'], ['tel', 'Tel'], ['email', 'Email'], ['crNo', 'C.R. No.'],
];

export default function ElectricityOrderView({ orderKey, updated = false }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const fileInput = useRef(null);
    const endpoint = `/api/electricity/my/${encodeURIComponent(orderKey)}`;

    const load = useCallback(async () => {
        try {
            const response = await fetch(endpoint, { cache: 'no-store' });
            const json = await response.json();
            if (!response.ok) throw new Error(json?.error || 'Order not found.');
            setData(json);
        } catch (err) {
            setError(err.message || 'Order not found.');
        }
    }, [endpoint]);

    useEffect(() => { load(); }, [load]);

    async function upload(event) {
        event.preventDefault();
        const file = fileInput.current?.files?.[0];
        setUploadError('');
        if (!file) return setUploadError('Choose the transfer receipt first (PDF, JPG or PNG).');
        if (file.size > 4 * 1024 * 1024) return setUploadError('The file is larger than 4 MB. Please upload a smaller PDF or photo.');
        setUploading(true);
        try {
            const body = new FormData();
            body.append('file', file);
            const response = await fetch(endpoint, { method: 'POST', body });
            const json = await response.json();
            if (!response.ok) throw new Error(json?.error || 'Upload failed.');
            setData(json);
            if (fileInput.current) fileInput.current.value = '';
        } catch (err) {
            setUploadError(err.message || 'Upload failed.');
        } finally {
            setUploading(false);
        }
    }

    if (error || !data) {
        return (
            <div className="evm-page">
                <ElectricityTopbar eyebrow="Your order" />
                <main className="evm-main"><div className="evm-container elx-wrap">
                    <div className={`evm-notice${error ? ' error' : ''}`}>{error || 'Loading your order…'}</div>
                    {error && <a className="evm-link-btn" href="/electricity/find">Find my order</a>}
                </div></main>
            </div>
        );
    }

    const { order, payment, bank, form } = data;
    const currency = order.currency || 'BHD';
    const stageIndex = STAGE_INDEX[payment.stage] ?? 0;
    const vendor = order.vendor || {};

    return (
        <div className="evm-page">
            <ElectricityTopbar eyebrow="Your electricity order" title={form.eventName || form.title}>
                <button type="button" className="elx-topbtn elx-noprint" onClick={() => window.print()}>Print</button>
            </ElectricityTopbar>
            <main className="evm-main">
                <div className="evm-container elx-wrap">
                    {updated && <div className="eva-flash ok">Your order was updated.</div>}
                    <section className="exo-card">
                        <div className="exo-head">
                            <div>
                                <span className="orv-ref">Order number</span>
                                <div className="elx-ref small">{order.reference}</div>
                                <h1>{vendor.company}</h1>
                                <span className="orv-ref">{formatDate(order.createdAt)}{form.eventDates ? ` · ${form.eventName} · ${form.eventDates}` : ''}</span>
                            </div>
                            <span className={`exo-status ${payment.stage}`}>{payment.label}</span>
                        </div>

                        {payment.stage !== 'declined' && (
                            <ol className="exo-steps">
                                {STEPS.map((step, index) => (
                                    <li key={step.stage} className={index <= stageIndex ? 'done' : ''}><span>{index + 1}</span>{step.label}</li>
                                ))}
                            </ol>
                        )}

                        {payment.stage === 'confirmed' && (
                            <div className="exo-confirmed">
                                <strong>Your order is confirmed.</strong>
                                <p>Payment verified on {formatDate(payment.verifiedAt)}. Thank you.</p>
                            </div>
                        )}
                        {payment.stage === 'declined' && (
                            <div className="evm-notice">This order was not accepted. Please contact Pico at {form.receiptEmail}.</div>
                        )}
                        {payment.stage === 'rejected' && (
                            <div className="exo-alert">We could not verify your payment receipt{payment.note ? `: ${payment.note}` : '.'} Please check the transfer and send the receipt again.</div>
                        )}
                        {payment.stage === 'review' && (
                            <div className="exo-info">Thank you for your order. Pico is checking it and will email you the bank details for payment once it is approved. Until then you can still change it.</div>
                        )}
                        {payment.stage === 'verifying' && (
                            <div className="exo-info">We received <strong>{payment.proofName || 'your receipt'}</strong> on {formatDate(payment.uploadedAt)} and are verifying the payment. You will get the confirmation by email.</div>
                        )}

                        <div className="orv-lines">
                            {order.items.map((item) => (
                                <div key={item.id} className="exo-line">
                                    <span>{item.name}</span>
                                    <span>{item.quantity} × {formatMoney(item.price, currency)}</span>
                                    <strong>{formatMoney(item.lineTotal, currency)}</strong>
                                </div>
                            ))}
                        </div>
                        <div className="exo-totals">
                            <div className="exo-grand"><span>Total to pay (VAT inclusive)</span><strong>{formatMoney(order.total, currency)}</strong></div>
                        </div>
                        {vendor.notes && <p className="exo-hint"><strong>Other requirements:</strong> {vendor.notes}</p>}

                        <details className="elx-details">
                            <summary>Your details</summary>
                            <div className="eva-kv">
                                {DETAIL_LABELS.filter(([key]) => vendor[key]).map(([key, label]) => (
                                    <Fragment key={key}><span>{label}</span><strong dir={key === 'restaurant' ? 'auto' : undefined}>{vendor[key]}</strong></Fragment>
                                ))}
                            </div>
                        </details>

                        <div className="exo-actions elx-noprint">
                            {data.editable ? (
                                <a className="evm-cta secondary elx-cta-link" href={`/electricity?edit=${encodeURIComponent(orderKey)}`}>Change order</a>
                            ) : payment.stage !== 'declined' && payment.stage !== 'confirmed' && (
                                <p className="exo-hint">This order is approved, so it can no longer be changed online. Need a change? Reply to our email or contact Pico.</p>
                            )}
                        </div>
                    </section>

                    {bank && data.canSendReceipt && (
                        <>
                            <section className="exo-card">
                                <h2>1. Pay by bank transfer</h2>
                                <p className="exo-hint">Transfer <strong>{formatMoney(order.total, currency)}</strong> and quote <strong>{order.reference}</strong> as the payment reference.</p>
                                <div className="exo-bank">
                                    <CopyRow label="Account name" value={bank.accountName} />
                                    <CopyRow label="Bank" value={bank.bank} />
                                    <CopyRow label="Account number" value={bank.accountNumber} />
                                    <CopyRow label="IBAN" value={bank.iban} />
                                    <CopyRow label="SWIFT" value={bank.swift} />
                                    <CopyRow label="Reference" value={order.reference} />
                                </div>
                            </section>
                            <section className="exo-card elx-noprint">
                                <h2>2. Send us the transfer receipt</h2>
                                <p className="exo-hint">A photo, screenshot or PDF of the bank transfer, either way:</p>
                                <ul className="exo-hint exo-ways">
                                    <li><strong>By email:</strong> reply to our payment details email, or send it to <a href={`mailto:${form.receiptEmail}?subject=${encodeURIComponent(`Payment receipt ${order.reference}`)}`}>{form.receiptEmail}</a> with your order number {order.reference}.</li>
                                    <li><strong>Or upload it here</strong> (max 4 MB){payment.stage === 'verifying' ? '; a new upload replaces the previous receipt' : ''}:</li>
                                </ul>
                                <form onSubmit={upload} className="exo-upload">
                                    <input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png" />
                                    <button type="submit" className="evm-cta" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload receipt'}</button>
                                </form>
                                {uploadError && <div className="exo-alert">{uploadError}</div>}
                            </section>
                        </>
                    )}

                    {form.submitBy && payment.stage === 'review' && <p className="exo-hint" style={{ textAlign: 'center' }}>Form deadline: {formatDay(form.submitBy)}</p>}
                    <p className="exo-hint" style={{ textAlign: 'center' }}>Questions? {form.contactPhone} · {form.receiptEmail}</p>
                </div>
            </main>
        </div>
    );
}
