'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/lib/cartContext';
import FileUploader from '@/components/FileUploader';
import { extractCleanName } from '@/lib/nameHelpers';

export default function CartPage() {
    const { cart, updateQuantity, removeFromCart, cartTotal, clearCart, rentalDays, setRentalDays, grandTotal } = useCart();
    const router = useRouter();
    const [files, setFiles] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState({
        name: '', company: '', email: '', phone: '', boothNumber: '', eventName: '', notes: ''
    });

    const handleChange = (e) => {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (cart.length === 0) {
            setError('Your cart is empty. Please add items before submitting.');
            return;
        }

        if (!form.name || !form.company || !form.email || !form.phone) {
            setError('Please fill in all required fields.');
            return;
        }

        setSubmitting(true);

        try {
            // Upload files if any
            let uploadedFiles = [];
            if (files.length > 0) {
                const formData = new FormData();
                files.forEach(file => formData.append('files', file));

                const uploadRes = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData,
                });
                const uploadData = await uploadRes.json();
                if (uploadData.files) {
                    uploadedFiles = uploadData.files;
                }
            }

            // Create order
            const orderData = {
                items: cart.map(item => ({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    category: item.category,
                    image: item.image || '',
                    comment: item.comment || '',
                })),
                exhibitor: form,
                total: cartTotal,
                days: rentalDays,
                grandTotal,
                attachments: uploadedFiles,
            };

            const orderRes = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData),
            });

            const orderResult = await orderRes.json();

            if (orderResult.success) {
                // Send email
                try {
                    await fetch('/api/email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            orderId: orderResult.order.id,
                            toEmail: form.email,
                        }),
                    });
                } catch (emailErr) {
                    console.log('Email sending attempted');
                }

                clearCart();
                router.push(`/order-success?id=${orderResult.order.id}`);
            } else {
                setError('Failed to create order. Please try again.');
            }
        } catch (err) {
            setError('Something went wrong. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (cart.length === 0) {
        return (
            <div className="page-enter">
                <div className="empty-state" style={{ minHeight: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="empty-state-icon">🛒</div>
                    <h3>Your cart is empty</h3>
                    <p>Browse our catalogue and add items to get started.</p>
                    <Link href="/catalogue" className="btn btn-primary" style={{ marginTop: '1rem' }}>
                        Browse Catalogue
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="page-enter cart-page">
            <div className="breadcrumb" style={{ padding: '0 0 1.5rem' }}>
                <Link href="/">Home</Link>
                <span>›</span>
                <span className="current">Cart & Checkout</span>
            </div>

            <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '2rem' }}>
                Your Order
            </h1>

            <div className="checkout-grid">
                <div>
                    {/* Cart Items */}
                    <div className="cart-items">
                        {cart.map(item => (
                            <div key={item.id} className="cart-item">
                                <img src={item.image} alt={extractCleanName(item.name)} className="cart-item-image" />
                                <div className="cart-item-info">
                                    <div className="cart-item-category">{item.category === 'tv-led' ? 'TV / LED' : item.category}</div>
                                    <div className="cart-item-name">{extractCleanName(item.name)}</div>
                                    <div className="cart-item-price">{item.price} BHD /day</div>
                                    {item.comment && (
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem', fontStyle: 'italic' }}>
                                            💬 {item.comment}
                                        </div>
                                    )}
                                </div>
                                <div className="quantity-controls">
                                    <button onClick={() => updateQuantity(item.id, item.quantity - 1)}>−</button>
                                    <span>{item.quantity}</span>
                                    <button onClick={() => updateQuantity(item.id, item.quantity + 1)}>+</button>
                                </div>
                                <button className="btn btn-icon" onClick={() => removeFromCart(item.id)} title="Remove" style={{ color: '#ef4444' }}>
                                    🗑️
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Exhibitor Details Form */}
                    <form className="checkout-form" onSubmit={handleSubmit}>
                        <h3>Exhibitor Details</h3>

                        {error && (
                            <div className="alert alert-error">⚠️ {error}</div>
                        )}

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Full Name *</label>
                                <input className="form-input" name="name" value={form.name} onChange={handleChange} placeholder="Your name" required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Company *</label>
                                <input className="form-input" name="company" value={form.company} onChange={handleChange} placeholder="Company name" required />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Email *</label>
                                <input className="form-input" name="email" type="email" value={form.email} onChange={handleChange} placeholder="email@company.com" required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Phone *</label>
                                <input className="form-input" name="phone" value={form.phone} onChange={handleChange} placeholder="+973 XXXX XXXX" required />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Booth Number</label>
                                <input className="form-input" name="boothNumber" value={form.boothNumber} onChange={handleChange} placeholder="e.g. A-101" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Event Name</label>
                                <input className="form-input" name="eventName" value={form.eventName} onChange={handleChange} placeholder="Exhibition / event name" />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Notes / Special Requests</label>
                            <textarea className="form-textarea" name="notes" value={form.notes} onChange={handleChange} placeholder="Any special requirements or notes..." />
                        </div>

                        {/* File Upload */}
                        <div className="form-group">
                            <label className="form-label">Upload Files (Optional)</label>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                                Upload BDF, PDF, PowerPoint, or image files for custom graphics work
                            </p>
                            <FileUploader files={files} onFilesChange={setFiles} />
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary btn-lg"
                            style={{ width: '100%', marginTop: '1rem' }}
                            disabled={submitting}
                        >
                            {submitting ? (
                                <>
                                    <span className="spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }}></span>
                                    Processing Order...
                                </>
                            ) : (
                                `Submit Order — ${grandTotal.toFixed(2)} BHD`
                            )}
                        </button>
                    </form>
                </div>

                {/* Order Summary Sidebar */}
                <div className="order-summary order-summary-panel">
                    <h3>Order Summary</h3>

                    {cart.map(item => (
                        <div key={item.id} className="order-row">
                            <span style={{ color: 'var(--text-secondary)' }}>
                                {extractCleanName(item.name)} × {item.quantity}
                            </span>
                            <span>{(item.price * item.quantity).toFixed(2)} BHD/day</span>
                        </div>
                    ))}

                    <div className="order-row" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Per day subtotal</span>
                        <span>{cartTotal.toFixed(2)} BHD</span>
                    </div>

                    {/* Rental Days Control */}
                    <div style={{
                        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem', margin: '0.75rem 0'
                    }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.6rem' }}>
                            📅 Rental Period
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ width: '34px', height: '34px', padding: 0, fontSize: '1.1rem', flexShrink: 0 }}
                                onClick={() => setRentalDays(rentalDays - 1)}
                            >−</button>
                            <input
                                type="number"
                                className="form-input"
                                min={1}
                                value={rentalDays}
                                onChange={e => setRentalDays(e.target.value)}
                                style={{ width: '60px', textAlign: 'center', padding: '6px 4px', flex: 'none' }}
                            />
                            <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ width: '34px', height: '34px', padding: 0, fontSize: '1.1rem', flexShrink: 0 }}
                                onClick={() => setRentalDays(rentalDays + 1)}
                            >+</button>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                {rentalDays === 1 ? 'day' : 'days'}
                            </span>
                        </div>
                    </div>

                    <div className="order-row total">
                        <span>Grand Total</span>
                        <div style={{ textAlign: 'right' }}>
                            <span className="order-value">{grandTotal.toFixed(2)} BHD</span>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {cartTotal.toFixed(2)} × {rentalDays} {rentalDays === 1 ? 'day' : 'days'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
