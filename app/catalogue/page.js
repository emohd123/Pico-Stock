'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ProductCard from '@/components/ProductCard';
import { useCart } from '@/lib/cartContext';
import { hasMeaningfulProductName } from '@/lib/nameHelpers';

const categories = [
    { value: 'all', label: 'All Products', icon: '📦' },
    { value: 'furniture', label: 'Furniture', icon: '🪑' },
    { value: 'tv-led', label: 'TV / LED', icon: '📺' },
    { value: 'graphics', label: 'Graphics', icon: '🎨' },
];

export default function CataloguePage() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState('all');
    const [sortBy, setSortBy] = useState('name');
    const { toast } = useCart();

    useEffect(() => {
        fetch('/api/products')
            .then(res => res.json())
            .then(data => {
                setProducts(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const visibleProducts = products.filter(p => hasMeaningfulProductName(p.name));

    const filtered = activeCategory === 'all'
        ? visibleProducts
        : visibleProducts.filter(p => p.category === activeCategory);

    const sorted = [...filtered].sort((a, b) => {
        if (sortBy === 'price-low') return a.price - b.price;
        if (sortBy === 'price-high') return b.price - a.price;
        return (a.name || '').localeCompare(b.name || '');
    });

    return (
        <div className="page-enter">
            {/* Breadcrumb */}
            <div className="breadcrumb">
                <Link href="/">Home</Link>
                <span>›</span>
                <span className="current">Catalogue</span>
            </div>

            {/* Header */}
            <section className="section" style={{ paddingBottom: '0.5rem' }}>
                <div className="section-header">
                    <h2>Rental Catalogue</h2>
                    <p>Browse our complete collection of exhibition booth extras</p>
                </div>
            </section>

            {/* Filters */}
            <div className="container catalogue-filter-shell">
                <div className="filter-bar">
                    {categories.map(cat => (
                        <button
                            key={cat.value}
                            className={`filter-chip ${activeCategory === cat.value ? 'active' : ''}`}
                            onClick={() => setActiveCategory(cat.value)}
                        >
                            {cat.icon} {cat.label}
                        </button>
                    ))}
                    <div className="filter-sort-wrap">
                        <select
                            className="form-select"
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value)}
                            style={{ width: 'auto', minWidth: '180px' }}
                        >
                            <option value="name">Sort by Name</option>
                            <option value="price-low">Price: Low to High</option>
                            <option value="price-high">Price: High to Low</option>
                        </select>
                    </div>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                    {filtered.length} item{filtered.length !== 1 ? 's' : ''} found
                </div>
            </div>

            {/* Products Grid */}
            <section className="section" style={{ paddingTop: '0' }}>
                {loading ? (
                    <div className="loading-page">
                        <div className="spinner"></div>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📦</div>
                        <h3>No products found</h3>
                        <p>Try a different category or check back soon.</p>
                    </div>
                ) : (
                    <div className="products-grid">
                        {sorted.map(product => (
                            <ProductCard key={product.id} product={product} />
                        ))}
                    </div>
                )}
            </section>

            {/* Toast */}
            {toast && (
                <div className="toast">
                    ✅ {toast}
                </div>
            )}
        </div>
    );
}
