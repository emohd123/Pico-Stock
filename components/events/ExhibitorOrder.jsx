'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { extractCleanName } from '@/lib/nameHelpers';
import { formatMoney } from '@/lib/eventMarketplacePricing';
import './event-marketplace.css';

const STEPS = [
    { stage: 'awaiting', label: 'Order sent' },
    { stage: 'verifying', label: 'Receipt uploaded' },
    { stage: 'confirmed', label: 'Payment verified & confirmed' },
];

function itemName(name) {
    if (!/^ID\b/i.test(name || '')) return name;
    const clean = extractCleanName(name);
    return clean === '--' ? name : clean;
}

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

export default function ExhibitorOrder({ orderKey }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const fileInput = useRef(null);
    const endpoint = `/api/event-orders/${encodeURIComponent(orderKey)}`;

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
        if (!file) {
            setUploadError('Choose the transfer receipt first (PDF, JPG or PNG).');
            return;
        }
        if (file.size > 4 * 1024 * 1024) {
            setUploadError('The file is larger than 4 MB. Please upload a smaller PDF or photo.');
            return;
        }
        setUploading(true);
        try {
            const form = new FormData();
            form.append('file', file);
            const response = await fetch(endpoint, { method: 'POST', body: form });
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

    if (error) {
        return (
            <div className="evm-page"><main className="evm-main"><div className="evm-container"><div className="evm-notice">{error}</div></div></main></div>
        );
    }
    if (!data) {
        return (
            <div className="evm-page"><main className="evm-main"><div className="evm-container"><div className="evm-notice">Loading your order…</div></div></main></div>
        );
    }

    const { order, payment, bank, event } = data;
    const currency = order.currency || 'BHD';
    const stageIndex = payment.stage === 'confirmed' ? 2 : payment.stage === 'verifying' ? 1 : 0;
    const canUpload = payment.stage === 'awaiting' || payment.stage === 'rejected' || payment.stage === 'verifying';

    return (
        <div className="evm-page">
            <header className="evm-topbar">
                <div className="evm-container evm-topbar-inner">
                    <div className="evm-topbar-title">
                        <span className="evm-eyebrow">Your order</span>
                        <strong>{event.name}</strong>
                    </div>
                </div>
            </header>

            <main className="evm-main">
                <div className="evm-container exo-wrap">
                    <section className="exo-card">
                        <div className="exo-head">
                            <div>
                                <span className="orv-ref">{order.reference} · {formatDate(order.createdAt)}</span>
                                <h1>{order.company}</h1>
                            </div>
                            <span className={`exo-status ${payment.stage}`}>{payment.label}</span>
                        </div>

                        {payment.stage !== 'declined' && (
                            <ol className="exo-steps">
                                {STEPS.map((step, index) => (
                                    <li key={step.stage} className={index <= stageIndex ? 'done' : ''}>
                                        <span>{index + 1}</span>{step.label}
                                    </li>
                                ))}
                            </ol>
                        )}

                        {payment.stage === 'confirmed' && (
                            <div className="exo-confirmed">
                                <strong>Your order is confirmed.</strong>
                                <p>Payment verified on {formatDate(payment.verifiedAt)}. Download your official order confirmation below.</p>
                                <a className="evm-cta" href={`${endpoint}/pdf?type=confirmation`}>Download order confirmation (PDF)</a>
                            </div>
                        )}
                        {payment.stage === 'declined' && (
                            <div className="evm-notice">This order was declined. Please contact Pico at {event.contactEmail || 'info@picobahrain.com'}.</div>
                        )}
                        {payment.stage === 'rejected' && (
                            <div className="exo-alert">
                                We could not verify your payment receipt{payment.note ? `: ${payment.note}` : '.'} Please check the transfer and upload the receipt again.
                            </div>
                        )}
                        {payment.stage === 'verifying' && (
                            <div className="exo-info">
                                Thank you. We received <strong>{payment.proofName || 'your receipt'}</strong> on {formatDate(payment.uploadedAt)} and are verifying the payment. You will receive the official order confirmation by email.
                            </div>
                        )}

                        <div className="orv-lines">
                            {order.items.map((item, index) => (
                                <div key={`${item.id}-${index}`} className="exo-line">
                                    <span>{itemName(item.name)}</span>
                                    <span>× {item.quantity}</span>
                                    <strong>{item.eventPrice > 0 ? formatMoney(item.lineTotal, currency) : 'On request'}</strong>
                                </div>
                            ))}
                        </div>
                        <div className="exo-totals">
                            <div><span>Subtotal</span><span>{formatMoney(order.subtotal, currency)}</span></div>
                            <div><span>VAT {order.vatPercent}%</span><span>{formatMoney(order.vatAmount, currency)}</span></div>
                            <div className="exo-grand"><span>Total to pay</span><strong>{formatMoney(order.total, currency)}</strong></div>
                        </div>
                        <a className="evm-link-btn" href={`${endpoint}/pdf`}>Download order summary (PDF)</a>
                        {payment.stage !== 'declined' && event.slug && (
                            <div className="exo-actions">
                                {data.editable ? (
                                    <a className="evm-cta secondary" href={`/events/${event.slug}?edit=${encodeURIComponent(orderKey)}`}>Change order (add or remove items)</a>
                                ) : (
                                    <a className="evm-cta secondary" href={`/events/${event.slug}?from=${encodeURIComponent(orderKey)}`}>Order more items</a>
                                )}
                            </div>
                        )}
                        {!data.editable && payment.stage !== 'declined' && payment.stage !== 'confirmed' && (
                            <p className="exo-hint" style={{ marginTop: '0.6rem' }}>Your receipt is with us, so this order can no longer be changed online. Need changes? Contact Pico, or order more items as a new order.</p>
                        )}
                    </section>

                    {payment.stage !== 'confirmed' && payment.stage !== 'declined' && (
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

                            {canUpload && (
                                <section className="exo-card">
                                    <h2>2. Upload your transfer receipt</h2>
                                    <p className="exo-hint">
                                        {payment.stage === 'verifying'
                                            ? 'Uploaded the wrong file? Upload the correct one and it replaces the previous receipt.'
                                            : 'A PDF, screenshot or photo of the bank transfer confirmation (max 4 MB).'}
                                    </p>
                                    <form onSubmit={upload} className="exo-upload">
                                        <input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png" />
                                        <button type="submit" className="evm-cta" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload receipt'}</button>
                                    </form>
                                    {uploadError && <div className="exo-alert">{uploadError}</div>}
                                </section>
                            )}
                        </>
                    )}

                    <p className="exo-hint" style={{ textAlign: 'center' }}>
                        Questions? {event.contactPhone || '+973 3635 7377'} · {event.contactEmail || 'info@picobahrain.com'}
                    </p>
                </div>
            </main>
        </div>
    );
}
