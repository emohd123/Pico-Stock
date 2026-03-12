'use client';

import { useState } from 'react';
import { useCart } from '@/lib/cartContext';
import { extractCleanName, getProductSpecs } from '@/lib/nameHelpers';

function StockBadge({ stock, inStock }) {
    const isOutOfStock = stock === 0 || inStock === false;
    const isLow = stock !== null && stock !== undefined && stock > 0 && stock <= 5;

    if (isOutOfStock) {
        return (
            <span style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: '#ef4444',
                background: 'rgba(239,68,68,0.12)',
                borderRadius: '4px',
                padding: '2px 7px',
                display: 'inline-block',
            }}>
                Out of stock
            </span>
        );
    }

    if (stock !== null && stock !== undefined) {
        return (
            <span style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: isLow ? '#f59e0b' : 'var(--pico-teal)',
                background: isLow ? 'rgba(245,158,11,0.12)' : 'rgba(0,165,165,0.12)',
                borderRadius: '4px',
                padding: '2px 7px',
                display: 'inline-block',
            }}>
                {stock} available
            </span>
        );
    }

    return null;
}

function AddToCartModal({ product, onClose, onConfirm }) {
    const cleanName = extractCleanName(product.name);
    const effectiveStock = product.availableStock ?? product.stock;
    const maxQty = effectiveStock > 0 ? effectiveStock : 999;
    const [quantity, setQuantity] = useState(1);
    const [comment, setComment] = useState('');

    const handleQty = (val) => {
        const n = parseInt(val, 10) || 1;
        setQuantity(Math.min(Math.max(1, n), maxQty));
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box add-to-cart-modal" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>X</button>

                <div className="modal-panel">
                    <h3 className="add-modal-title">{cleanName}</h3>
                    {effectiveStock > 0 && (
                        <p className="add-modal-stock">{effectiveStock} available</p>
                    )}

                    <div className="add-modal-section">
                        <div className="add-modal-label">Quantity</div>
                        <div className="add-modal-quantity-row">
                            <div className="add-modal-quantity-controls">
                                <button
                                    type="button"
                                    className="btn btn-secondary add-modal-quantity-btn"
                                    onClick={() => handleQty(quantity - 1)}
                                >
                                    -
                                </button>
                                <input
                                    className="form-input add-modal-quantity-input"
                                    type="number"
                                    min={1}
                                    max={maxQty}
                                    value={quantity}
                                    onChange={e => handleQty(e.target.value)}
                                />
                                <button
                                    type="button"
                                    className="btn btn-secondary add-modal-quantity-btn"
                                    onClick={() => handleQty(quantity + 1)}
                                >
                                    +
                                </button>
                            </div>
                            {product.price > 0 && (
                                <span className="add-modal-total">
                                    {(product.price * quantity).toFixed(2)} BHD /day
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="add-modal-section">
                        <div className="add-modal-label">
                            Comment <span className="add-modal-label-note">(optional)</span>
                        </div>
                        <textarea
                            className="form-textarea"
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                            placeholder="e.g. Prefer blue colour, need stand included..."
                            rows={3}
                            style={{ resize: 'vertical', minHeight: '80px' }}
                        />
                    </div>

                    <div className="add-modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => { onConfirm(quantity, comment.trim()); onClose(); }}
                        >
                            Add to Cart
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ProductModal({ product, onClose, onAddToCart }) {
    const [showAddModal, setShowAddModal] = useState(false);
    const effectiveStock = product.availableStock ?? product.stock;
    const isOutOfStock = effectiveStock === 0 || product.inStock === false;
    const cleanName = extractCleanName(product.name);
    const specs = getProductSpecs(product);

    return (
        <>
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal-box" onClick={e => e.stopPropagation()}>
                    <button className="modal-close" onClick={onClose}>X</button>

                    <div className="modal-image-wrap">
                        <img
                            src={product.image}
                            alt={cleanName}
                            className="modal-image"
                            onError={e => {
                                e.target.src = '';
                                e.target.style.display = 'none';
                            }}
                        />
                    </div>

                    <div className="modal-body">
                        <div className="modal-header-row">
                            <span className="modal-category">
                                {product.category === 'tv-led' ? 'TV / LED' : product.category}
                            </span>
                            <StockBadge stock={effectiveStock} inStock={product.inStock} />
                        </div>

                        <h2 className="modal-title">{cleanName}</h2>

                        <div className="product-spec-grid">
                            {[
                                ['TYPE', specs.type],
                                ['ID NO', specs.idNo],
                                ['CODE', specs.code],
                                ['COLOUR', specs.colour],
                                ['DIMENSIONS (cm)', specs.dimensions],
                                ['STOCK QTY', specs.stockQty],
                                ['UNIT RATE', specs.unitRate],
                            ].map(([label, value]) => (
                                <div key={label} className="product-spec-item">
                                    <div className="product-spec-label">{label}</div>
                                    <div
                                        className={`product-spec-value ${label === 'TYPE' ? 'is-type' : 'is-mono'}`}
                                    >
                                        {value}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="modal-footer">
                            <div className="card-price product-modal-price">
                                {product.price > 0 ? (
                                    <>{product.price} <span>BHD /day</span></>
                                ) : (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>Price on request</span>
                                )}
                            </div>

                            {!isOutOfStock ? (
                                <button
                                    className="btn btn-primary product-modal-action"
                                    onClick={() => setShowAddModal(true)}
                                >
                                    Add to Cart
                                </button>
                            ) : (
                                <span style={{
                                    color: '#ef4444',
                                    fontWeight: 600,
                                    fontSize: '0.9rem',
                                    background: 'rgba(239,68,68,0.1)',
                                    padding: '0.4rem 0.8rem',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid rgba(239,68,68,0.2)',
                                }}>
                                    Out of Stock
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {showAddModal && (
                <AddToCartModal
                    product={product}
                    onClose={() => setShowAddModal(false)}
                    onConfirm={(qty, comment) => {
                        onAddToCart(product, qty, comment);
                        onClose();
                    }}
                />
            )}
        </>
    );
}

export default function ProductCard({ product }) {
    const { addToCart } = useCart();
    const [showModal, setShowModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const effectiveStock = product.availableStock ?? product.stock;
    const isOutOfStock = effectiveStock === 0 || product.inStock === false;
    const cleanName = extractCleanName(product.name);

    return (
        <>
            <div className="card product-card" onClick={() => setShowModal(true)}>
                <div className="card-image-wrap">
                    <img
                        src={product.image}
                        alt={cleanName}
                        className="card-image"
                        onError={e => {
                            e.target.style.display = 'none';
                        }}
                    />
                </div>
                <div className="card-body">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.35rem' }}>
                        <span style={{
                            fontSize: '0.7rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            color: 'var(--pico-teal)',
                            fontWeight: 600,
                        }}>
                            {product.category === 'tv-led' ? 'TV / LED' : product.category}
                        </span>
                        <StockBadge stock={effectiveStock} inStock={product.inStock} />
                    </div>

                    <h3 className="card-title">{cleanName}</h3>

                    <div className="card-actions card-actions-mobile">
                        <div className="card-price">
                            {product.price > 0 ? (
                                <>{product.price} <span>BHD /day</span></>
                            ) : (
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>On request</span>
                            )}
                        </div>

                        {!isOutOfStock ? (
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={e => {
                                    e.stopPropagation();
                                    setShowAddModal(true);
                                }}
                            >
                                Add
                            </button>
                        ) : (
                            <span style={{ color: '#ef4444', fontSize: '0.82rem', fontWeight: 600 }}>Out of stock</span>
                        )}
                    </div>
                </div>
            </div>

            {showModal && (
                <ProductModal
                    product={product}
                    onClose={() => setShowModal(false)}
                    onAddToCart={(prod, qty, comment) => addToCart(prod, qty, comment)}
                />
            )}

            {showAddModal && (
                <AddToCartModal
                    product={product}
                    onClose={() => setShowAddModal(false)}
                    onConfirm={(qty, comment) => addToCart(product, qty, comment)}
                />
            )}
        </>
    );
}
