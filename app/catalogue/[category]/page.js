'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ProductCard from '@/components/ProductCard';
import { useCart } from '@/lib/cartContext';
import { hasMeaningfulProductName } from '@/lib/nameHelpers';

const categoryLabels = {
    'furniture': { title: 'Furniture', icon: '🪑', description: 'Premium tables, chairs, counters and display furniture for your exhibition booth.' },
    'tv-led': { title: 'TV / LED Screens', icon: '📺', description: 'High-definition displays, video walls, touch screens and digital kiosks.' },
    'graphics': { title: 'Graphics', icon: '🎨', description: 'Custom printed backdrops, banners, signage and floor graphics.' },
};

export default function CategoryPage() {
    const params = useParams();
    const category = params.category;
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState('name');
    const { toast } = useCart();

    const catInfo = categoryLabels[category] || { title: category, icon: '📦', description: '' };

    useEffect(() => {
        fetch(`/api/products?category=${category}`)
            .then(res => res.json())
            .then(data => {
                setProducts(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [category]);

    const visibleProducts = products.filter(product => hasMeaningfulProductName(product.name));

    const sortedProducts = [...visibleProducts].sort((a, b) => {
        if (sortBy === 'price-low') return a.price - b.price;
        if (sortBy === 'price-high') return b.price - a.price;
        return (a.name || '').localeCompare(b.name || '');
    });

    return (
        <div className="page-enter">
            <div className="breadcrumb">
                <Link href="/">Home</Link>
                <span>›</span>
                <span className="current">{catInfo.title}</span>
            </div>

            <section className="section" style={{ paddingBottom: '1rem' }}>
                <div className="section-header">
                    <span style={{ fontSize: '3rem', display: 'block', marginBottom: '0.5rem' }}>{catInfo.icon}</span>
                    <h2>{catInfo.title}</h2>
                    <p>{catInfo.description}</p>
                </div>
            </section>

            <div className="container" style={{ padding: '0 2rem' }}>
                <div className="filter-bar">
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        {visibleProducts.length} items
                    </span>
                    <div style={{ marginLeft: 'auto' }}>
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
            </div>

            <section className="section" style={{ paddingTop: '1rem' }}>
                {loading ? (
                    <div className="loading-page">
                        <div className="spinner"></div>
                    </div>
                ) : visibleProducts.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📦</div>
                        <h3>No products yet</h3>
                        <p>Check back soon or contact us for custom orders.</p>
                    </div>
                ) : (
                    <div className="products-grid">
                        {sortedProducts.map(product => (
                            <ProductCard key={product.id} product={product} />
                        ))}
                    </div>
                )}
            </section>

            {toast && (
                <div className="toast">
                    ✅ {toast}
                </div>
            )}
        </div>
    );
}
