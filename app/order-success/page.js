'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { formatOrderReference } from '@/lib/nameHelpers';

function OrderSuccessContent() {
    const searchParams = useSearchParams();
    const orderId = searchParams.get('id') || '';
    const orderReference = formatOrderReference(orderId);
    const [attachments, setAttachments] = useState([]);

    useEffect(() => {
        if (!orderId) return;
        fetch(`/api/orders?id=${orderId}`)
            .then(res => res.json())
            .then(order => {
                if (order && Array.isArray(order.attachments) && order.attachments.length > 0) {
                    setAttachments(order.attachments);
                }
            })
            .catch(() => {});
    }, [orderId]);

    return (
        <div className="page-enter success-page">
            <div className="success-card">
                <div className="success-icon">✅</div>
                <h1>Order Submitted!</h1>
                <p>
                    Thank you for your order. Your request has been received and our team
                    will review it shortly. Our team will prepare your quotation and send it to you after review.
                </p>

                {orderId && (
                    <div style={{
                        background: 'var(--bg-glass)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: '1rem',
                        marginBottom: '1.5rem'
                    }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                            ORDER REFERENCE
                        </div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--pico-teal)' }}>
                            {orderReference}
                        </div>
                    </div>
                )}

                {attachments.length > 0 && (
                    <div style={{
                        background: 'var(--bg-glass)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: '1rem',
                        marginBottom: '1.5rem',
                        textAlign: 'left'
                    }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                            UPLOADED FILES
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {attachments.map((file, i) => (
                                <a
                                    key={i}
                                    href={file.path}
                                    download={file.originalName}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.6rem',
                                        padding: '0.5rem 0.75rem',
                                        background: 'rgba(0,165,165,0.08)',
                                        border: '1px solid rgba(0,165,165,0.2)',
                                        borderRadius: 'var(--radius-sm)',
                                        color: 'var(--pico-teal)',
                                        textDecoration: 'none',
                                        fontSize: '0.85rem',
                                        fontWeight: 500,
                                    }}
                                >
                                    <span>⬇️</span>
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {file.originalName}
                                    </span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', flexShrink: 0 }}>
                                        {file.size ? `${(file.size / 1024).toFixed(0)} KB` : ''}
                                    </span>
                                </a>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{
                    background: 'rgba(0, 165, 165, 0.08)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1.25rem',
                    marginBottom: '2rem',
                    textAlign: 'left',
                    fontSize: '0.85rem',
                    lineHeight: '1.8'
                }}>
                    <strong style={{ color: 'var(--pico-teal)' }}>What happens next?</strong>
                    <ol style={{ marginTop: '0.5rem', paddingLeft: '1.25rem', color: 'var(--text-secondary)' }}>
                        <li>Our team receives your order and reviews it</li>
                        <li>Our team prepares your internal quotation draft</li>
                        <li>The quotation PDF is sent to you for review and confirmation</li>
                        <li>Items are delivered and set up at your booth</li>
                    </ol>
                </div>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Link href="/" className="btn btn-primary">
                        Back to Home
                    </Link>
                    <Link href="/catalogue" className="btn btn-secondary">
                        Continue Shopping
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default function OrderSuccessPage() {
    return (
        <Suspense fallback={
            <div className="loading-page"><div className="spinner"></div></div>
        }>
            <OrderSuccessContent />
        </Suspense>
    );
}
