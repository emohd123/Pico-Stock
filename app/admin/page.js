'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { extractCleanName, inferProductType, formatOrderReference, getProductSpecs } from '@/lib/nameHelpers';

/**
 * Returns the serial portion of the internal ID without the PICO- prefix.
 * PICO-FRN-NBNJ6 → FRN-NBNJ6
 */
function formatSerial(product) {
    if (!product) return '';
    if (product.id && product.id.startsWith('PICO-')) return product.id.slice(5);
    const catMap = { furniture: 'FRN', 'tv-led': 'TVL', graphics: 'GFX' };
    const prefix = catMap[product.category] || 'PRD';
    const suffix = (product.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-5).toUpperCase();
    return `${prefix}-${suffix}`;
}

function buildParsedSpecsState(product) {
    const specs = getProductSpecs(product);
    return {
        productName: extractCleanName(product?.name || '') === '--' ? '' : extractCleanName(product?.name || ''),
        description: product?.description || '',
        type: specs.type === '—' ? '' : specs.type,
        idNo: specs.idNo === '—' ? '' : specs.idNo,
        code: specs.code === '—' ? '' : specs.code,
        colour: specs.colour === '—' ? '' : specs.colour,
        dimensions: specs.dimensions === '—' ? '' : specs.dimensions,
        stockQty: specs.stockQty === '—' ? '' : specs.stockQty,
        unitRate: product?.price != null && product?.price !== '' ? String(product.price) : '',
    };
}

function composeProductNameFromSpecs(specs) {
    const idNo = (specs.idNo || '').trim();
    const code = (specs.code || '').trim();
    const stockQty = (specs.stockQty || '').trim();
    const type = (specs.type || '').trim();
    const productName = (specs.productName || '').trim();
    const colour = (specs.colour || '').trim();
    const dimensions = (specs.dimensions || '').trim();

    const nameCore = productName || type || 'Product';
    const nameWithType = type && productName && !productName.toLowerCase().includes(type.toLowerCase())
        ? `${productName} ${type}`
        : nameCore;

    const parts = [
        idNo ? `ID ${idNo}` : '',
        code,
        stockQty ? `[${stockQty}]` : '',
        nameWithType,
        colour,
        dimensions,
    ].filter(Boolean);

    return parts.join(' ').replace(/\s+/g, ' ').trim();
}

const QUOTATION_SYSTEM_URL = 'http://localhost:3000';

export default function AdminDashboard() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('products');
    const [products, setProducts] = useState([]);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editProduct, setEditProduct] = useState(null);
    const [previewProduct, setPreviewProduct] = useState(null);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [parsedSpecsForm, setParsedSpecsForm] = useState(buildParsedSpecsState(null));

    // Upload & Extract
    const [extractedProducts, setExtractedProducts] = useState([]);
    const [extracting, setExtracting] = useState(false);
    const [importFileName, setImportFileName] = useState('');
    // Selection
    const [selectedProducts, setSelectedProducts] = useState([]);
    // OSFam stock sync
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState(null);
    // Quote generation
    const [sendingQuote, setSendingQuote] = useState({});
    // Order editing
    const [editingOrder, setEditingOrder] = useState(null);
    const [orderForm, setOrderForm] = useState({});

    // Product form
    const [productForm, setProductForm] = useState({
        name: '', description: '', category: 'furniture', price: '', image: '/products/table.svg', stock: '', featured: false
    });

    useEffect(() => {
        const isAdmin = sessionStorage.getItem('pico-admin');
        if (!isAdmin) {
            router.push('/admin/login');
            return;
        }
        fetchData();
    }, [router]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [prodRes, ordRes] = await Promise.all([
                fetch('/api/products'),
                fetch('/api/orders'),
            ]);
            setProducts(await prodRes.json());
            setOrders(await ordRes.json());
        } catch { }
        setLoading(false);
    };

    const showMsg = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    };

    // OSFam stock sync
    const handleSyncStock = async () => {
        setSyncing(true);
        setSyncResult(null);
        try {
            const res = await fetch('/api/sync-stock', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setSyncResult(data);
                showMsg('success', `✅ Stock synced: ${data.updated} product(s) updated from OSFam`);
                fetchData();
            } else {
                showMsg('error', `Sync failed: ${data.error}`);
            }
        } catch {
            showMsg('error', 'Failed to connect to OSFam.');
        }
        setSyncing(false);
    };

    // Product CRUD
    const handleProductSubmit = async (e) => {
        e.preventDefault();
        try {
            const method = editProduct ? 'PUT' : 'POST';
            const body = editProduct
                ? { ...productForm, id: editProduct.id, price: parseFloat(productForm.price) }
                : { ...productForm, price: parseFloat(productForm.price) };

            const res = await fetch('/api/products', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();

            if (data.success) {
                showMsg('success', editProduct ? 'Product updated!' : 'Product created!');
                setShowModal(false);
                setEditProduct(null);
                resetProductForm();
                fetchData();
            } else {
                showMsg('error', data.error || 'Failed to save product.');
            }
        } catch {
            showMsg('error', 'Failed to save product.');
        }
    };

    const handleDeleteProduct = async (id) => {
        if (!confirm('Delete this product?')) return;
        try {
            await fetch(`/api/products?id=${id}`, { method: 'DELETE' });
            showMsg('success', 'Product deleted.');
            setSelectedProducts(prev => prev.filter(pId => pId !== id));
            fetchData();
        } catch {
            showMsg('error', 'Failed to delete product.');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedProducts.length === 0) return;
        if (!confirm(`Delete ${selectedProducts.length} selected products?`)) return;
        
        try {
            const res = await fetch(`/api/products?ids=${selectedProducts.join(',')}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                showMsg('success', `${selectedProducts.length} products deleted.`);
                setSelectedProducts([]);
                fetchData();
            }
        } catch {
            showMsg('error', 'Failed to delete selected products.');
        }
    };

    const toggleSelectAll = () => {
        if (selectedProducts.length === products.length) {
            setSelectedProducts([]);
        } else {
            setSelectedProducts(products.map(p => p.id));
        }
    };

    const toggleSelectProduct = (id) => {
        setSelectedProducts(prev => 
            prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
        );
    };

    const updateParsedSpecs = (field, value) => {
        setParsedSpecsForm(prev => {
            const next = { ...prev, [field]: value };
            const nextName = composeProductNameFromSpecs(next);

            setProductForm(current => ({
                ...current,
                name: nextName || current.name,
                description: field === 'description' ? value : current.description,
                stock: field === 'stockQty' ? value : current.stock,
                price: field === 'unitRate' ? value : current.price,
            }));

            return next;
        });
    };

    const openEditProduct = (product) => {
        setProductForm({
            name: product.name,
            description: product.description,
            category: product.category,
            price: product.price.toString(),
            image: product.image,
            stock: product.stock != null ? String(product.stock) : '',
            featured: product.featured,
        });
        setParsedSpecsForm(buildParsedSpecsState(product));
        setEditProduct(product);
        setShowModal(true);
    };

    const openNewProduct = () => {
        resetProductForm();
        setEditProduct(null);
        setShowModal(true);
    };

    const resetProductForm = () => {
        setProductForm({
            name: '', description: '', category: 'furniture', price: '', image: '/products/table.svg', stock: '', featured: false
        });
        setParsedSpecsForm(buildParsedSpecsState({
            name: '',
            description: '',
            category: 'furniture',
            stock: '',
            price: '',
        }));
    };

    // Send Zoho quote to customer
    const handleSendQuote = async (orderId) => {
        setSendingQuote(prev => ({ ...prev, [orderId]: true }));
        try {
            const res = await fetch('/api/quote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId }),
            });
            const data = await res.json();
            if (data.success) {
                showMsg('success', `✅ Quote ${data.estimate_number} sent to customer`);
                fetchData();
            } else {
                showMsg('error', `Quote failed: ${data.error}`);
            }
        } catch {
            showMsg('error', 'Failed to generate quote.');
        }
        setSendingQuote(prev => ({ ...prev, [orderId]: false }));
    };

    // Order status update
    const handleDeleteOrder = async (orderId) => {
        if (!confirm('Delete this order? This cannot be undone.')) return;
        try {
            const res = await fetch(`/api/orders?id=${orderId}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                showMsg('success', 'Order deleted.');
                fetchData();
            } else {
                showMsg('error', data.error || 'Failed to delete order.');
            }
        } catch {
            showMsg('error', 'Failed to delete order.');
        }
    };

    const handleOrderStatus = async (orderId, status) => {
        try {
            const res = await fetch('/api/orders', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: orderId, status }),
            });
            const data = await res.json();
            if (data.success) {
                showMsg('success', `Order marked as ${status}`);
                // Auto-send confirmation email to customer when admin confirms
                if (status === 'confirmed') {
                    const order = orders.find(o => o.id === orderId);
                    if (order?.exhibitor?.email) {
                        fetch('/api/email', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ orderId, toCustomer: true }),
                        }).then(r => r.json()).then(r => {
                            if (r.success) {
                                showMsg('success', `Confirmation email sent to ${order.exhibitor.email}`);
                            } else {
                                showMsg('error', `Email failed: ${r.error || r.message}`);
                            }
                        }).catch(err => showMsg('error', `Email error: ${err.message}`));
                        showMsg('success', `Order confirmed — sending confirmation email to ${order.exhibitor.email}`);
                    }
                }
                fetchData();
            }
        } catch {
            showMsg('error', 'Failed to update order.');
        }
    };

    // Open order edit modal
    const openEditOrder = (order) => {
        setOrderForm({
            name: order.exhibitor?.name || '',
            company: order.exhibitor?.company || '',
            email: order.exhibitor?.email || '',
            phone: order.exhibitor?.phone || '',
            boothNumber: order.exhibitor?.boothNumber || '',
            eventName: order.exhibitor?.eventName || '',
            notes: order.notes || '',
            days: order.days || 1,
        });
        setEditingOrder(order);
    };

    const handleOrderEdit = async (e) => {
        e.preventDefault();
        try {
            const days = parseInt(orderForm.days) || 1;
            const res = await fetch('/api/orders', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingOrder.id,
                    exhibitor: {
                        ...editingOrder.exhibitor,
                        name: orderForm.name,
                        company: orderForm.company,
                        email: orderForm.email,
                        phone: orderForm.phone,
                        boothNumber: orderForm.boothNumber,
                        eventName: orderForm.eventName,
                    },
                    notes: orderForm.notes,
                    days,
                    grandTotal: (editingOrder.total || 0) * days,
                }),
            });
            const data = await res.json();
            if (data.success) {
                showMsg('success', 'Order updated!');
                setEditingOrder(null);
                fetchData();
            } else {
                showMsg('error', data.error || 'Failed to save.');
            }
        } catch {
            showMsg('error', 'Failed to save changes.');
        }
    };

    const handleLogout = () => {
        sessionStorage.removeItem('pico-admin');
        router.push('/admin/login');
    };

    // Stats
    const totalProducts = products.length;
    const totalOrders = orders.length;
    const pendingOrders = orders.filter(o => o.status === 'pending').length;
    const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);

    const categoryImages = {
        furniture: ['/products/table.svg', '/products/chair.svg', '/products/pedestal.svg', '/products/counter.svg', '/products/sofa.svg', '/products/brochure-stand.svg'],
        'tv-led': ['/products/tv55.svg', '/products/tv75.svg', '/products/touch-screen.svg', '/products/videowall.svg', '/products/kiosk.svg'],
        graphics: ['/products/backdrop.svg', '/products/rollup.svg', '/products/fascia.svg', '/products/floor-graphic.svg', '/products/flag.svg'],
    };
    const defaultCategoryImages = categoryImages[productForm.category] || categoryImages.furniture;
    const productImageOptions = productForm.image && !defaultCategoryImages.includes(productForm.image)
        ? [productForm.image, ...defaultCategoryImages]
        : defaultCategoryImages;

    if (loading) {
        return <div className="loading-page"><div className="spinner"></div></div>;
    }

    return (
        <div className="page-enter">
            <div className="admin-layout">
                {/* Sidebar */}
                <aside className="admin-sidebar">
                    <button
                        className={`admin-sidebar-item ${activeTab === 'overview' ? 'active' : ''}`}
                        onClick={() => setActiveTab('overview')}
                    >
                        📊 Overview
                    </button>
                    <button
                        className={`admin-sidebar-item ${activeTab === 'products' ? 'active' : ''}`}
                        onClick={() => setActiveTab('products')}
                    >
                        📦 Products
                    </button>
                    <button
                        className={`admin-sidebar-item ${activeTab === 'orders' ? 'active' : ''}`}
                        onClick={() => setActiveTab('orders')}
                    >
                        📋 Orders
                    </button>
                    <button
                        className={`admin-sidebar-item ${activeTab === 'upload' ? 'active' : ''}`}
                        onClick={() => setActiveTab('upload')}
                    >
                        📤 Upload & Import
                    </button>
                    <Link
                        href="/admin/pcloud"
                        className="admin-sidebar-item"
                        style={{ display: 'block', textDecoration: 'none' }}
                    >
                        ☁️ pCloud
                    </Link>
                    <Link
                        href="/admin/designers"
                        className="admin-sidebar-item"
                        style={{ display: 'block', textDecoration: 'none' }}
                    >
                        🎨 Designers Board
                    </Link>
                    <a
                        href={QUOTATION_SYSTEM_URL}
                        className="admin-sidebar-item"
                        style={{ display: 'block', textDecoration: 'none' }}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Quote System
                    </a>
                    <button className="admin-sidebar-item" onClick={handleLogout}>
                        🚪 Logout
                    </button>
                </aside>

                {/* Main Content */}
                <div className="admin-content">
                    {/* Messages */}
                    {message.text && (
                        <div className={`alert alert-${message.type}`}>
                            {message.type === 'success' ? '✅' : '⚠️'} {message.text}
                        </div>
                    )}

                    {/* OVERVIEW TAB */}
                    {activeTab === 'overview' && (
                        <div>
                            <div className="admin-header">
                                <h2>Dashboard Overview</h2>
                            </div>
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <div className="stat-card-icon">📦</div>
                                    <div className="stat-card-value">{totalProducts}</div>
                                    <div className="stat-card-label">Total Products</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-card-icon">📋</div>
                                    <div className="stat-card-value">{totalOrders}</div>
                                    <div className="stat-card-label">Total Orders</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-card-icon">⏳</div>
                                    <div className="stat-card-value">{pendingOrders}</div>
                                    <div className="stat-card-label">Pending Orders</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-card-icon">💰</div>
                                    <div className="stat-card-value">{totalRevenue.toFixed(0)}</div>
                                    <div className="stat-card-label">Revenue (BHD)</div>
                                </div>
                                <a
                                    href={QUOTATION_SYSTEM_URL}
                                    className="stat-card"
                                    style={{ textDecoration: 'none', display: 'block' }}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <div className="stat-card-icon">QS</div>
                                    <div className="stat-card-value" style={{ fontSize: '1.2rem', lineHeight: 1.3 }}>
                                        Open
                                    </div>
                                    <div className="stat-card-label">Quotation System</div>
                                </a>
                            </div>

                            {/* Recent Orders */}
                            <h3 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Recent Orders</h3>
                            {orders.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)' }}>No orders yet.</p>
                            ) : (
                                <table className="data-table mobile-stack-table">
                                    <thead>
                                        <tr>
                                            <th>Order ID</th>
                                            <th>Exhibitor</th>
                                            <th>Booth</th>
                                            <th>Total</th>
                                            <th>Status</th>
                                            <th>Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5).map(order => (
                                            <tr key={order.id}>
                                                <td data-label="Order ID" style={{ fontFamily: 'monospace', fontWeight: 600 }}>{formatOrderReference(order.id)}</td>
                                                <td data-label="Exhibitor">
                                                    <div style={{ fontWeight: 500 }}>{order.exhibitor?.name}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{order.exhibitor?.company}</div>
                                                </td>
                                                <td data-label="Booth">{order.exhibitor?.boothNumber}</td>
                                                <td data-label="Total" style={{ fontWeight: 600 }}>{order.total?.toFixed(2)} BHD</td>
                                                <td data-label="Status">
                                                    <span className={`badge badge-${order.status}`}>{order.status}</span>
                                                </td>
                                                <td data-label="Date" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                    {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {/* PRODUCTS TAB */}
                    {activeTab === 'products' && (
                        <div>
                            <div className="admin-header">
                                <h2>Products Management</h2>
                                <div className="admin-header-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                    {selectedProducts.length > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#ef4444' }}>
                                                {selectedProducts.length} items selected
                                            </span>
                                            <button className="btn btn-danger btn-sm" onClick={handleBulkDelete}>
                                                🗑️ Mass Delete
                                            </button>
                                        </div>
                                    )}
                                    <button className="btn btn-primary" onClick={openNewProduct}>+ Add Product</button>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={handleSyncStock}
                                        disabled={syncing}
                                        title="Sync stock from OSFam asset management system"
                                    >
                                        {syncing ? '⏳ Syncing…' : '🔄 Sync Stock'}
                                    </button>
                                </div>
                            </div>

                            {/* Sync result summary */}
                            {syncResult && (
                                <div style={{
                                    marginBottom: '1rem',
                                    padding: '0.75rem 1rem',
                                    background: 'rgba(0,188,161,0.08)',
                                    border: '1px solid rgba(0,188,161,0.3)',
                                    borderRadius: 'var(--radius-md)',
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    gap: '1.5rem',
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                }}>
                                    <span>🔄 <strong>Last sync:</strong></span>
                                    <span>📦 OSFam assets: <strong>{syncResult.osfamAssets}</strong></span>
                                    <span>🔗 Matched: <strong>{syncResult.matched}</strong></span>
                                    <span>📊 Stock updated: <strong>{syncResult.stockUpdates ?? syncResult.changed}</strong></span>
                                    <span>🖼️ Images updated: <strong>{syncResult.imageUpdates ?? 0}</strong></span>
                                    <span>✅ Total: <strong>{syncResult.updated}</strong></span>
                                    <button
                                        style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                                        onClick={() => setSyncResult(null)}
                                    >✕</button>
                                </div>
                            )}

                            <table className="data-table mobile-stack-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '100px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={products.length > 0 && selectedProducts.length === products.length}
                                                    onChange={toggleSelectAll}
                                                />
                                                {selectedProducts.length === products.length && products.length > 0 ? 'DESELECT' : 'SELECT ALL'}
                                            </label>
                                        </th>
                                        <th>Image</th>
                                        <th>Product</th>
                                        <th>Details</th>
                                        <th>Category</th>
                                        <th>Unit Rate</th>
                                        <th>Stock Qty</th>
                                        <th>Featured</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {products.map(product => (
                                        <tr key={product.id} className={selectedProducts.includes(product.id) ? 'selected-row' : ''}>
                                            <td data-label="Select">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedProducts.includes(product.id)}
                                                    onChange={() => toggleSelectProduct(product.id)}
                                                />
                                            </td>
                                            <td data-label="Image">
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewProduct(product)}
                                                    style={{
                                                        padding: 0,
                                                        border: 'none',
                                                        background: 'transparent',
                                                        cursor: 'pointer',
                                                        lineHeight: 0,
                                                    }}
                                                    aria-label={`Preview image for ${product.name}`}
                                                >
                                                    <img src={product.image} alt={product.name} style={{
                                                        width: '50px', height: '40px', objectFit: 'cover',
                                                        borderRadius: '6px', background: 'var(--bg-glass)'
                                                    }} />
                                                </button>
                                            </td>
                                            <td data-label="Product">
                                                {(() => {
                                                    const specs = getProductSpecs(product);
                                                    return (
                                                        <>
                                                            <div style={{ fontWeight: 500 }}>{extractCleanName(product.name)}</div>
                                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                                                                {specs.type}
                                                            </div>
                                                        </>
                                                    );
                                                })()}
                                            </td>
                                            <td data-label="Details">
                                                {(() => {
                                                    const specs = getProductSpecs(product);
                                                    return (
                                                        <div style={{ display: 'grid', gap: '0.2rem', fontSize: '0.72rem' }}>
                                                            <div><strong>ID NO:</strong> <span style={{ fontFamily: 'monospace' }}>{specs.idNo}</span></div>
                                                            <div><strong>CODE:</strong> <span style={{ fontFamily: 'monospace' }}>{specs.code}</span></div>
                                                            <div><strong>COLOUR:</strong> {specs.colour}</div>
                                                            <div><strong>DIMENSIONS:</strong> <span style={{ fontFamily: 'monospace' }}>{specs.dimensions}</span></div>
                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                            <td data-label="Category">
                                                <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.92rem', color: 'var(--pico-teal)', letterSpacing: '0.02em' }}>
                                                    {product.category === 'tv-led' ? 'TV/LED' : product.category}
                                                </div>
                                            </td>
                                            <td data-label="Unit Rate">
                                                <span style={{ fontWeight: 600, color: 'var(--pico-teal)' }}>{getProductSpecs(product).unitRate}</span>
                                            </td>
                                            <td data-label="Stock Qty">
                                                {getProductSpecs(product).stockQty !== '—' ? (
                                                    <span style={{
                                                        fontWeight: 700,
                                                        fontSize: '0.95rem',
                                                        color: (product.availableStock ?? product.stock) === 0 ? '#ef4444' : (product.availableStock ?? product.stock) <= 5 ? '#f59e0b' : 'var(--pico-teal)'
                                                    }}>
                                                        {(product.availableStock ?? product.stock) === 0 ? 'Out of stock' : getProductSpecs(product).stockQty}
                                                        {(product.reservedQty ?? 0) > 0 ? ` (${product.reservedQty} reserved)` : ''}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                                                )}
                                            </td>
                                            <td data-label="Featured">{product.featured ? 'Yes' : '—'}</td>
                                            <td data-label="Actions">
                                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    <button className="btn btn-secondary btn-sm" onClick={() => openEditProduct(product)}>Edit</button>
                                                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteProduct(product.id)}>Delete</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* ORDERS TAB */}
                    {activeTab === 'orders' && (
                        <div>
                            <div className="admin-header">
                                <h2>Orders Management</h2>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                    {orders.length} total orders
                                </span>
                            </div>

                            {orders.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-state-icon">📋</div>
                                    <h3>No orders yet</h3>
                                    <p>Orders from exhibitors will appear here.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {[...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(order => (
                                        <div key={order.id} className="card" style={{ cursor: 'default' }}>
                                            <div className="card-body">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '1rem' }}>
                                                    <div>
                                                        <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--pico-teal)', marginBottom: '0.25rem' }}>
                                                            {formatOrderReference(order.id)}
                                                        </div>
                                                        <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{order.exhibitor?.name}</div>
                                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                            {order.exhibitor?.company} • Booth {order.exhibitor?.boothNumber}
                                                        </div>
                                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                                                            📧 {order.exhibitor?.email} • 📱 {order.exhibitor?.phone}
                                                        </div>
                                                        {order.exhibitor?.eventName && (
                                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                                🎪 {order.exhibitor.eventName}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <span className={`badge badge-${order.status}`}>{order.status}</span>
                                                        <div style={{ fontWeight: 700, fontSize: '1.3rem', color: 'var(--pico-teal)', marginTop: '0.5rem' }}>
                                                            {(order.grandTotal || order.total)?.toFixed(2)} BHD
                                                        </div>
                                                        {order.days > 1 && (
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                                {order.total?.toFixed(2)} BHD/day × {order.days} days
                                                            </div>
                                                        )}
                                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                            {order.createdAt ? new Date(order.createdAt).toLocaleString() : 'N/A'}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Order Items */}
                                                <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)' }}>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                                                        Order Items
                                                    </div>
                                                    {order.items?.map((item, i) => (
                                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', fontSize: '0.9rem' }}>
                                                            <span>{item.name} × {item.quantity}</span>
                                                            <span style={{ color: 'var(--text-secondary)' }}>{(item.price * item.quantity).toFixed(2)} BHD</span>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Attachments */}
                                                {order.attachments && order.attachments.length > 0 && (
                                                    <div style={{ marginTop: '0.75rem' }}>
                                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                                                            Attached Files
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                            {order.attachments.map((att, i) => (
                                                                <a key={i} href={att.path} target="_blank" className="btn btn-secondary btn-sm" rel="noreferrer">
                                                                    📎 {att.originalName || att.filename}
                                                                </a>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Notes */}
                                                {order.notes && (
                                                    <div style={{ marginTop: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                                        <strong>Notes:</strong> {order.notes}
                                                    </div>
                                                )}

                                                {/* Zoho Quote Link */}
                                                {order.zohoQuoteId && (
                                                    <div style={{ marginTop: '0.75rem', padding: '8px 12px', background: '#f0fdfa', borderRadius: '6px', border: '1px solid #a7f3d0', fontSize: '0.82rem', color: '#065f46' }}>
                                                        📋 Zoho Quote: <strong>{order.zohoQuoteId}</strong>
                                                        <a href={`https://books.zoho.com/app/916511405#/estimates`} target="_blank" rel="noreferrer" style={{ marginLeft: '8px', color: '#00A5A5' }}>
                                                            View in Zoho →
                                                        </a>
                                                    </div>
                                                )}

                                                {/* Actions */}
                                                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    {!order.zohoQuoteId && (order.status === 'pending' || order.status === 'confirmed') && (
                                                        <button
                                                            className="btn btn-primary btn-sm"
                                                            onClick={() => handleSendQuote(order.id)}
                                                            disabled={sendingQuote[order.id]}
                                                        >
                                                            {sendingQuote[order.id] ? '⏳ Generating...' : '📄 Send Quote'}
                                                        </button>
                                                    )}
                                                    {order.zohoQuoteId && order.status === 'quoted' && (
                                                        <button className="btn btn-primary btn-sm" onClick={() => handleOrderStatus(order.id, 'confirmed')}>
                                                            ✅ Confirm Order
                                                        </button>
                                                    )}
                                                    {order.status === 'pending' && (
                                                        <button className="btn btn-secondary btn-sm" onClick={() => handleOrderStatus(order.id, 'confirmed')}>
                                                            ✅ Confirm Order
                                                        </button>
                                                    )}
                                                    {(order.status === 'confirmed' || order.status === 'quoted') && (
                                                        <button className="btn btn-secondary btn-sm" onClick={() => handleOrderStatus(order.id, 'processing')}>
                                                            🔄 Mark Processing
                                                        </button>
                                                    )}
                                                    {order.status === 'processing' && (
                                                        <button className="btn btn-primary btn-sm" onClick={() => handleOrderStatus(order.id, 'completed')}>
                                                            ✅ Mark Completed
                                                        </button>
                                                    )}
                                                    <button className="btn btn-secondary btn-sm" onClick={() => openEditOrder(order)}>
                                                        ✏️ Edit Order
                                                    </button>
                                                    <a href={`mailto:${order.exhibitor?.email}?subject=${encodeURIComponent(`Re: Pico Order ${formatOrderReference(order.id)}`)}`} className="btn btn-outline btn-sm">
                                                        📧 Email Exhibitor
                                                    </a>
                                                    <button
                                                        className="btn btn-sm"
                                                        style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}
                                                        onClick={() => handleDeleteOrder(order.id)}
                                                    >
                                                        🗑️ Delete
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* UPLOAD & IMPORT TAB */}
                    {activeTab === 'upload' && (
                        <div>
                            <div className="admin-header">
                                <h2>Upload & Import Products</h2>
                            </div>

                            <div style={{ marginBottom: '2rem' }}>
                                <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
                                    💡 Upload your <strong>Pico Rental Catalogue</strong> (Excel, PDF, or PowerPoint) — the system will automatically extract <strong>TYPE · ID NO · CODE · COLOUR · DIMENSIONS · STOCK QTY · UNIT RATE · Picture · Category</strong> for every product. Generic Excel / CSV / JSON files are also supported.
                                </div>

                                <div
                                    className={`upload-zone`}
                                    onClick={() => document.getElementById('admin-file-upload')?.click()}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="upload-zone-icon">{extracting ? '⏳' : '📁'}</div>
                                    <h4>{extracting ? 'Extracting products...' : 'Click to upload a file'}</h4>
                                    <p>Supports Excel, CSV, JSON, PDF, PowerPoint, Images</p>
                                    <input
                                        id="admin-file-upload"
                                        type="file"
                                        accept=".xlsx,.xls,.csv,.json,.txt,.tsv,.pdf,.bdf,.ppt,.pptx,.doc,.docx,.png,.jpg,.jpeg"
                                        style={{ display: 'none' }}
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            setExtracting(true);
                                            setExtractedProducts([]);
                                            setImportFileName(file.name);
                                            try {
                                                const formData = new FormData();
                                                formData.append('file', file);
                                                const res = await fetch('/api/extract', { method: 'POST', body: formData });
                                                const data = await res.json();
                                                if (res.ok && data.success && data.products) {
                                                    setExtractedProducts(data.products.map((p, i) => {
                                                        const sourceName = p.originalName || p.name;
                                                        const cleanName = extractCleanName(sourceName);
                                                        const catNum = extractCatalogNumber(sourceName);
                                                        const dims = extractDims(sourceName);
                                                        return {
                                                            ...p,
                                                            _rawName: sourceName,       // keep original for reference
                                                            _catalogNum: catNum,        // catalog number display
                                                            _dims: dims,                // dimension spec
                                                            name: cleanName !== '—' ? cleanName : p.name, // use smart name
                                                            _selected: true,
                                                            _key: i,
                                                        };
                                                    }));
                                                    showMsg('success', data.message);
                                                } else {
                                                    showMsg('error', data.error || 'Extraction failed');
                                                }
                                            } catch (error) {
                                                showMsg('error', error?.message || 'Failed to extract data from file.');
                                            } finally {
                                                setExtracting(false);
                                                e.target.value = '';
                                            }
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Extracted Products Preview */}
                            {extractedProducts.length > 0 && (
                                <div>
                                    <div className="admin-header">
                                        <h3>📋 Extracted from: {importFileName}</h3>
                                        <div className="admin-header-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                className="btn btn-primary"
                                                onClick={async () => {
                                                     const selected = extractedProducts.filter(p => p._selected);
                                                     if (selected.length === 0) {
                                                         showMsg('error', 'No products selected for import.');
                                                         return;
                                                     }
                                                     
                                                     try {
                                                         const productsToImport = selected.map(p => {
                                                             // Strip UI-only internals
                                                             const {
                                                                 _selected, _key, _needsReview,
                                                                 _rawName, _catalogNum, _dims, _stockNum,
                                                                 originalName, idNo, code, colour,
                                                                 dimensions, productType, stockQty,
                                                                 ...rest
                                                             } = p;
                                                             // DB `name` must hold the full OSFam raw name so nameHelpers.js
                                                             // can extract TYPE / ID NO / CODE / COLOUR / DIMS on the fly.
                                                             const dbName = originalName || _rawName || p.name;
                                                             // Numeric stock for the DB `stock` column.
                                                             const dbStock = _stockNum !== undefined
                                                                 ? _stockNum
                                                                 : (stockQty !== '' && stockQty !== undefined
                                                                     ? (parseInt(String(stockQty).replace(/[^0-9]/g, ''), 10) || null)
                                                                     : (rest.stock !== undefined ? rest.stock : null));
                                                             return {
                                                                 ...rest,
                                                                 name: dbName,
                                                                 stock: dbStock,
                                                                 inStock: rest.inStock !== undefined
                                                                     ? rest.inStock
                                                                     : (dbStock === null ? true : dbStock > 0),
                                                             };
                                                         });
                                                         const res = await fetch('/api/products', {
                                                             method: 'POST',
                                                             headers: { 'Content-Type': 'application/json' },
                                                             body: JSON.stringify(productsToImport),
                                                         });
                                                         
                                                         const data = await res.json();
                                                         if (data.success) {
                                                             showMsg('success', `✅ ${data.count} product(s) added to catalogue!`);
                                                             setExtractedProducts([]);
                                                             fetchData();
                                                         } else {
                                                             showMsg('error', 'Import failed.');
                                                         }
                                                     } catch (err) {
                                                         showMsg('error', 'An error occurred during import.');
                                                     }
                                                 }}
                                            >
                                                ✅ Import {extractedProducts.filter(p => p._selected).length} Selected
                                            </button>
                                            <button className="btn btn-secondary" onClick={() => setExtractedProducts([])}>
                                                ✕ Clear
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ overflowX: 'auto' }}>
                                        <table className="data-table mobile-stack-table" style={{ fontSize: '0.8rem' }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '36px' }}>✓</th>
                                                    <th style={{ width: '52px' }}>Pic</th>
                                                    <th style={{ minWidth: '130px' }}>Product Name</th>
                                                    <th style={{ minWidth: '90px' }}>TYPE</th>
                                                    <th style={{ minWidth: '80px' }}>ID NO</th>
                                                    <th style={{ minWidth: '100px' }}>CODE</th>
                                                    <th style={{ minWidth: '90px' }}>COLOUR</th>
                                                    <th style={{ minWidth: '110px' }}>DIMENSIONS cm</th>
                                                    <th style={{ minWidth: '80px' }}>STOCK QTY</th>
                                                    <th style={{ minWidth: '90px' }}>UNIT RATE BHD</th>
                                                    <th style={{ minWidth: '110px' }}>CATEGORY</th>
                                                    <th style={{ width: '70px' }}>STATUS</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {extractedProducts.map((p, idx) => {
                                                    const specs = getProductSpecs({
                                                        name: p.originalName || p._rawName || p.name,
                                                        description: p.description,
                                                        category: p.category,
                                                        stock: p._stockNum !== undefined ? p._stockNum : (p.stockQty ? parseInt(String(p.stockQty).replace(/[^0-9]/g, ''), 10) || null : null),
                                                        price: p.price,
                                                    });
                                                    return (
                                                        <tr key={p._key} style={{ background: p._needsReview ? 'rgba(234,179,8,0.05)' : 'transparent' }}>
                                                            {/* ✓ Checkbox */}
                                                            <td>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={p._selected}
                                                                    onChange={(e) => setExtractedProducts(prev => prev.map((item, i) =>
                                                                        i === idx ? { ...item, _selected: e.target.checked } : item
                                                                    ))}
                                                                    style={{ width: '15px', height: '15px', accentColor: 'var(--pico-teal)' }}
                                                                />
                                                            </td>
                                                            {/* Picture */}
                                                            <td>
                                                                <img
                                                                    src={p.image}
                                                                    alt=""
                                                                    style={{ width: '44px', height: '36px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-subtle)', display: 'block' }}
                                                                    onError={e => { e.target.src = '/products/table.svg'; }}
                                                                />
                                                                {p.image.startsWith('/products/extracted') && (
                                                                    <div style={{ fontSize: '0.58rem', color: 'var(--pico-teal)', textAlign: 'center', marginTop: '2px' }}>Extracted</div>
                                                                )}
                                                            </td>
                                                            {/* Product Name — editable (updates the originalName / raw name) */}
                                                            <td>
                                                                <input
                                                                    className="form-input"
                                                                    value={p.originalName || p._rawName || p.name}
                                                                    onChange={(e) => setExtractedProducts(prev => prev.map((item, i) =>
                                                                        i === idx ? { ...item, originalName: e.target.value, _rawName: e.target.value, name: extractCleanName(e.target.value) !== '—' ? extractCleanName(e.target.value) : e.target.value } : item
                                                                    ))}
                                                                    style={{ minWidth: '120px', fontSize: '0.75rem' }}
                                                                    title="Raw / OSFam name — all specs are parsed from this field"
                                                                />
                                                                <div style={{ fontSize: '0.65rem', color: 'var(--pico-teal)', marginTop: '2px', fontWeight: 600 }}>
                                                                    {extractCleanName(p.originalName || p._rawName || p.name) !== '—'
                                                                        ? extractCleanName(p.originalName || p._rawName || p.name)
                                                                        : ''}
                                                                </div>
                                                            </td>
                                                            {/* TYPE — auto-parsed, read-only */}
                                                            <td>
                                                                <span style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{specs.type}</span>
                                                            </td>
                                                            {/* ID NO — auto-parsed, read-only */}
                                                            <td>
                                                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--pico-teal)', fontSize: '0.75rem' }}>
                                                                    {specs.idNo !== '—' ? specs.idNo : (p._catalogNum || '—')}
                                                                </span>
                                                            </td>
                                                            {/* CODE — auto-parsed, read-only */}
                                                            <td>
                                                                <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                                    {specs.code !== '—' ? specs.code : (p.code || '—')}
                                                                </span>
                                                            </td>
                                                            {/* COLOUR — editable */}
                                                            <td>
                                                                <input
                                                                    className="form-input"
                                                                    value={p.colour || specs.colour !== '—' ? (p.colour !== undefined ? p.colour : specs.colour) : ''}
                                                                    onChange={(e) => setExtractedProducts(prev => prev.map((item, i) =>
                                                                        i === idx ? { ...item, colour: e.target.value } : item
                                                                    ))}
                                                                    style={{ minWidth: '80px', fontSize: '0.75rem' }}
                                                                    placeholder="—"
                                                                />
                                                            </td>
                                                            {/* DIMENSIONS — editable */}
                                                            <td>
                                                                <input
                                                                    className="form-input"
                                                                    value={p.dimensions !== undefined ? p.dimensions : (specs.dimensions !== '—' ? specs.dimensions : (p._dims || ''))}
                                                                    onChange={(e) => setExtractedProducts(prev => prev.map((item, i) =>
                                                                        i === idx ? { ...item, dimensions: e.target.value } : item
                                                                    ))}
                                                                    style={{ minWidth: '100px', fontSize: '0.75rem', fontFamily: 'monospace' }}
                                                                    placeholder="H0xD0xW0cm"
                                                                />
                                                            </td>
                                                            {/* STOCK QTY — editable */}
                                                            <td>
                                                                <input
                                                                    className="form-input"
                                                                    type="number"
                                                                    min="0"
                                                                    step="1"
                                                                    value={p._stockNum !== undefined && p._stockNum !== null ? p._stockNum : (p.stockQty !== '' && p.stockQty !== undefined ? (parseInt(String(p.stockQty).replace(/[^0-9]/g, ''), 10) || '') : '')}
                                                                    onChange={(e) => {
                                                                        const n = e.target.value === '' ? null : parseInt(e.target.value, 10) || 0;
                                                                        setExtractedProducts(prev => prev.map((item, i) =>
                                                                            i === idx ? { ...item, _stockNum: n, stockQty: n !== null ? String(n) : '' } : item
                                                                        ));
                                                                    }}
                                                                    style={{ width: '70px', fontSize: '0.75rem' }}
                                                                    placeholder="—"
                                                                />
                                                            </td>
                                                            {/* UNIT RATE — editable */}
                                                            <td>
                                                                <input
                                                                    className="form-input"
                                                                    type="number"
                                                                    step="0.001"
                                                                    min="0"
                                                                    value={p.price}
                                                                    onChange={(e) => setExtractedProducts(prev => prev.map((item, i) =>
                                                                        i === idx ? { ...item, price: parseFloat(e.target.value) || 0, _needsReview: !parseFloat(e.target.value) } : item
                                                                    ))}
                                                                    style={{ width: '84px', fontSize: '0.75rem', color: p.price > 0 ? 'var(--pico-teal)' : '#ef4444', fontWeight: 600 }}
                                                                />
                                                            </td>
                                                            {/* CATEGORY — dropdown */}
                                                            <td>
                                                                <select
                                                                    className="form-select"
                                                                    value={p.category}
                                                                    onChange={(e) => setExtractedProducts(prev => prev.map((item, i) =>
                                                                        i === idx ? { ...item, category: e.target.value } : item
                                                                    ))}
                                                                    style={{ fontSize: '0.75rem' }}
                                                                >
                                                                    <option value="furniture">Furniture</option>
                                                                    <option value="tv-led">TV / LED</option>
                                                                    <option value="graphics">Graphics</option>
                                                                </select>
                                                            </td>
                                                            {/* STATUS */}
                                                            <td>
                                                                {p._needsReview ? (
                                                                    <span className="badge badge-pending" style={{ fontSize: '0.68rem' }}>⚠ Review</span>
                                                                ) : (
                                                                    <span className="badge badge-confirmed" style={{ fontSize: '0.68rem' }}>✓ Ready</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {extractedProducts.some(p => p._needsReview) && (
                                        <div className="alert alert-warning" style={{ marginTop: '1rem' }}>
                                            ⚠️ Some products need review — missing name or price. Edit directly in the table above before importing.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Sample Format Guide */}
                            <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--bg-glass)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                                <h4 style={{ marginBottom: '1rem', color: 'var(--pico-teal)' }}>📖 Supported File Formats</h4>

                                {/* Pico Catalogue Format */}
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600 }}>
                                    ✅ Pico Rental Catalogue format (Excel / CSV) — all specs auto-extracted:
                                </p>
                                <div style={{ overflowX: 'auto', marginBottom: '1.25rem' }}>
                                    <table className="data-table" style={{ fontSize: '0.75rem' }}>
                                        <thead>
                                            <tr>
                                                <th>ID NO</th>
                                                <th>CODE</th>
                                                <th>TYPE / Name</th>
                                                <th>COLOUR</th>
                                                <th>DIMENSIONS (cm)</th>
                                                <th>STOCK QTY</th>
                                                <th>UNIT RATE</th>
                                                <th>CATEGORY</th>
                                                <th>IMAGE</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td style={{ fontFamily: 'monospace' }}>1530</td>
                                                <td style={{ fontFamily: 'monospace' }}>FVCHIKEWHT</td>
                                                <td>Visitor Chair</td>
                                                <td>White</td>
                                                <td style={{ fontFamily: 'monospace' }}>H79xD47xW51cm</td>
                                                <td>108</td>
                                                <td>3.500</td>
                                                <td>furniture</td>
                                                <td><em style={{ color: 'var(--text-muted)' }}>optional URL</em></td>
                                            </tr>
                                            <tr>
                                                <td style={{ fontFamily: 'monospace' }}>1373</td>
                                                <td style={{ fontFamily: 'monospace' }}>FLEDB55</td>
                                                <td>55″ LED Display</td>
                                                <td>Black</td>
                                                <td style={{ fontFamily: 'monospace' }}>H148xD52xW128cm</td>
                                                <td>12</td>
                                                <td>45.000</td>
                                                <td>tv-led</td>
                                                <td></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                {/* Generic Format */}
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600 }}>
                                    ✅ Generic product format (Excel / CSV):
                                </p>
                                <table className="data-table" style={{ fontSize: '0.75rem', marginBottom: '1rem' }}>
                                    <thead>
                                        <tr><th>name</th><th>description</th><th>category</th><th>price</th><th>stock</th></tr>
                                    </thead>
                                    <tbody>
                                        <tr><td>Executive Table</td><td>Premium 6-seat</td><td>furniture</td><td>85</td><td>20</td></tr>
                                        <tr><td>55&quot; LED Display</td><td>4K LED with stand</td><td>tv-led</td><td>95</td><td>8</td></tr>
                                    </tbody>
                                </table>

                                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                    Also supports: <strong>PDF</strong>, <strong>PowerPoint (.pptx)</strong>, <strong>Word (.docx)</strong>, <strong>JSON</strong>, <strong>images</strong> · Categories: <strong>furniture</strong>, <strong>tv-led</strong>, <strong>graphics</strong>
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Order Edit Modal */}
            {editingOrder && (
                <div className="modal-overlay" onClick={() => setEditingOrder(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
                        <h3>✏️ Edit Order — {formatOrderReference(editingOrder.id)}</h3>
                        <form onSubmit={handleOrderEdit}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0.25rem 0 0.75rem' }}>
                                Customer Details
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Name *</label>
                                    <input className="form-input" value={orderForm.name} onChange={e => setOrderForm(f => ({ ...f, name: e.target.value }))} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Company</label>
                                    <input className="form-input" value={orderForm.company} onChange={e => setOrderForm(f => ({ ...f, company: e.target.value }))} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Email</label>
                                    <input className="form-input" type="email" value={orderForm.email} onChange={e => setOrderForm(f => ({ ...f, email: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Phone</label>
                                    <input className="form-input" value={orderForm.phone} onChange={e => setOrderForm(f => ({ ...f, phone: e.target.value }))} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Booth Number</label>
                                    <input className="form-input" value={orderForm.boothNumber} onChange={e => setOrderForm(f => ({ ...f, boothNumber: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Event Name</label>
                                    <input className="form-input" value={orderForm.eventName} onChange={e => setOrderForm(f => ({ ...f, eventName: e.target.value }))} />
                                </div>
                            </div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0.5rem 0 0.75rem' }}>
                                Order Details
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Rental Days</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={orderForm.days}
                                        onChange={e => setOrderForm(f => ({ ...f, days: e.target.value }))}
                                    />
                                    {orderForm.days >= 1 && (
                                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                                            Grand total: {((editingOrder.total || 0) * (parseInt(orderForm.days) || 1)).toFixed(2)} BHD
                                        </p>
                                    )}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Notes</label>
                                    <textarea className="form-textarea" rows={3} value={orderForm.notes} onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes..." />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setEditingOrder(null)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Product Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3>{editProduct ? 'Edit Product' : 'Add New Product'}</h3>
                        <form onSubmit={handleProductSubmit}>
                            <div style={{
                                marginBottom: '1rem',
                                display: 'flex',
                                justifyContent: 'center',
                            }}>
                                <button
                                    type="button"
                                    onClick={() => setPreviewProduct({
                                        name: productForm.name || parsedSpecsForm.productName || 'Product image',
                                        description: productForm.description || parsedSpecsForm.description || '',
                                        image: productForm.image,
                                    })}
                                    style={{
                                        padding: 0,
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: 'var(--radius-md)',
                                        background: 'var(--bg-glass)',
                                        overflow: 'hidden',
                                        cursor: 'pointer',
                                    }}
                                    aria-label="Open product image preview"
                                >
                                    <img
                                        src={productForm.image}
                                        alt={productForm.name || parsedSpecsForm.productName || 'Product image'}
                                        style={{
                                            width: '100%',
                                            maxWidth: '220px',
                                            height: '150px',
                                            objectFit: 'contain',
                                            display: 'block',
                                            background: '#fff',
                                        }}
                                    />
                                </button>
                            </div>
                            <div style={{
                                marginBottom: '1rem',
                                padding: '0.9rem 1rem',
                                background: 'var(--bg-glass)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 'var(--radius-md)'
                            }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>
                                    Product Details
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem 1rem', fontSize: '0.8rem' }}>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <label className="form-label" style={{ fontSize: '0.72rem', marginBottom: '0.35rem' }}>Product Name</label>
                                        <input
                                            className="form-input"
                                            value={parsedSpecsForm.productName}
                                            onChange={e => updateParsedSpecs('productName', e.target.value)}
                                            placeholder="Parsed product name"
                                        />
                                    </div>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <label className="form-label" style={{ fontSize: '0.72rem', marginBottom: '0.35rem' }}>Description</label>
                                        <textarea
                                            className="form-textarea"
                                            rows={3}
                                            value={parsedSpecsForm.description}
                                            onChange={e => updateParsedSpecs('description', e.target.value)}
                                            placeholder="Description"
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label" style={{ fontSize: '0.72rem', marginBottom: '0.35rem' }}>Type</label>
                                        <input
                                            className="form-input"
                                            value={parsedSpecsForm.type}
                                            onChange={e => updateParsedSpecs('type', e.target.value)}
                                            placeholder="Type"
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label" style={{ fontSize: '0.72rem', marginBottom: '0.35rem' }}>ID No</label>
                                        <input
                                            className="form-input"
                                            value={parsedSpecsForm.idNo}
                                            onChange={e => updateParsedSpecs('idNo', e.target.value)}
                                            placeholder="ID number"
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label" style={{ fontSize: '0.72rem', marginBottom: '0.35rem' }}>Code</label>
                                        <input
                                            className="form-input"
                                            value={parsedSpecsForm.code}
                                            onChange={e => updateParsedSpecs('code', e.target.value.toUpperCase())}
                                            placeholder="Code"
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label" style={{ fontSize: '0.72rem', marginBottom: '0.35rem' }}>Colour</label>
                                        <input
                                            className="form-input"
                                            value={parsedSpecsForm.colour}
                                            onChange={e => updateParsedSpecs('colour', e.target.value)}
                                            placeholder="Colour"
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label" style={{ fontSize: '0.72rem', marginBottom: '0.35rem' }}>Dimensions</label>
                                        <input
                                            className="form-input"
                                            value={parsedSpecsForm.dimensions}
                                            onChange={e => updateParsedSpecs('dimensions', e.target.value)}
                                            placeholder="H80xD55xW47cm"
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label" style={{ fontSize: '0.72rem', marginBottom: '0.35rem' }}>Stock Qty</label>
                                        <input
                                            className="form-input"
                                            value={parsedSpecsForm.stockQty}
                                            onChange={e => updateParsedSpecs('stockQty', e.target.value)}
                                            placeholder="Stock quantity"
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label" style={{ fontSize: '0.72rem', marginBottom: '0.35rem' }}>Unit Rate</label>
                                        <input
                                            className="form-input"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={parsedSpecsForm.unitRate}
                                            onChange={e => updateParsedSpecs('unitRate', e.target.value)}
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Category *</label>
                                    <select
                                        className="form-select"
                                        value={productForm.category}
                                        onChange={e => {
                                            const category = e.target.value;
                                            setProductForm(p => ({ ...p, category }));
                                            setParsedSpecsForm(prev => {
                                                const currentType = (prev.type || '').trim();
                                                const inferredCurrentType = inferProductType({
                                                    name: productForm.name,
                                                    description: productForm.description,
                                                    category: productForm.category,
                                                });
                                                return {
                                                    ...prev,
                                                    type: !currentType || currentType === inferredCurrentType
                                                        ? inferProductType({
                                                            name: productForm.name,
                                                            description: productForm.description,
                                                            category,
                                                        })
                                                        : prev.type,
                                                };
                                            });
                                        }}
                                    >
                                        <option value="furniture">Furniture</option>
                                        <option value="tv-led">TV / LED</option>
                                        <option value="graphics">Graphics</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Price (BHD) *</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={productForm.price}
                                        onChange={e => {
                                            const price = e.target.value;
                                            setProductForm(p => ({ ...p, price }));
                                            setParsedSpecsForm(prev => ({ ...prev, unitRate: price }));
                                        }}
                                        placeholder="0.00"
                                        required
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Product Image</label>
                                <select
                                    className="form-select"
                                    value={productForm.image}
                                    onChange={e => setProductForm(p => ({ ...p, image: e.target.value }))}
                                >
                                    {productImageOptions.map(img => (
                                        <option key={img} value={img}>
                                            {img.split('/').pop().replace(/\.(svg|png|jpe?g|webp)$/i, '')}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Stock Available (units)</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={productForm.stock}
                                        onChange={e => {
                                            const stock = e.target.value;
                                            setProductForm(p => ({ ...p, stock }));
                                            setParsedSpecsForm(prev => ({ ...prev, stockQty: stock }));
                                        }}
                                        placeholder="e.g. 10"
                                    />
                                    {productForm.stock !== '' && parseInt(productForm.stock) === 0 && (
                                        <p style={{ fontSize: '0.78rem', color: '#ef4444', marginTop: '0.3rem' }}>
                                            Stock is 0 and the product will show as out of stock.
                                        </p>
                                    )}
                                </div>
                                <div className="form-group" style={{ display: 'flex', alignItems: 'center', paddingTop: '1.8rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={productForm.featured}
                                            onChange={e => setProductForm(p => ({ ...p, featured: e.target.checked }))}
                                            style={{ width: '18px', height: '18px', accentColor: 'var(--pico-teal)' }}
                                        />
                                        <span style={{ fontSize: '0.85rem' }}>Featured</span>
                                    </label>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">
                                    {editProduct ? 'Update Product' : 'Create Product'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {previewProduct && (
                <div className="modal-overlay" onClick={() => setPreviewProduct(null)}>
                    <div
                        className="modal-box"
                        onClick={e => e.stopPropagation()}
                        style={{ maxWidth: 'min(92vw, 900px)' }}
                    >
                        <button
                            type="button"
                            className="modal-close"
                            onClick={() => setPreviewProduct(null)}
                            aria-label="Close image preview"
                        >
                            ×
                        </button>
                        <div className="modal-image-wrap" style={{ height: 'min(70vh, 680px)' }}>
                            <img
                                src={previewProduct.image}
                                alt={previewProduct.name}
                                className="modal-image"
                            />
                        </div>
                        <div className="modal-body">
                            <div className="modal-title">{previewProduct.name}</div>
                            <div className="modal-desc" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                                {previewProduct.description || 'No description available.'}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
