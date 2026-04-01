'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import ProductCard from '@/components/ProductCard';
import { useCart } from '@/lib/cartContext';
import { hasMeaningfulProductName } from '@/lib/nameHelpers';

export default function HomePage() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useCart();

    useEffect(() => {
        fetch('/api/products')
            .then(res => res.json())
            .then(data => {
                setProducts(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const visibleProducts = products.filter(p => hasMeaningfulProductName(p.name));

    const categories = [
        {
            slug: 'furniture',
            icon: '🪑',
            title: 'Furniture',
            description: 'Tables, chairs, lounges, display stands and reception counters for your booth.',
            count: visibleProducts.filter(p => p.category === 'furniture').length
        },
        {
            slug: 'tv-led',
            icon: '📺',
            title: 'TV / LED Screens',
            description: 'High-definition displays, video walls, interactive touch screens and kiosks.',
            count: visibleProducts.filter(p => p.category === 'tv-led').length
        },
        {
            slug: 'graphics',
            icon: '🎨',
            title: 'Graphics',
            description: 'Backdrops, banners, fascia boards, floor graphics and custom signage.',
            count: visibleProducts.filter(p => p.category === 'graphics').length
        }
    ];

    return (
        <div className="page-enter">
            {/* Hero Section */}
            <section className="hero">
                <div className="hero-badge">
                    ✨ Premium Exhibition Services
                </div>
                <h1>
                    Elevate Your <span className="highlight">Exhibition Booth</span>
                </h1>
                <p className="hero-subtitle">
                    Browse our curated collection of premium furniture, stunning LED displays,
                    and custom graphics. Order online and we&apos;ll handle the rest.
                </p>
                <div className="hero-actions">
                    <Link href="/catalogue" className="btn btn-primary btn-lg">
                        Browse Catalogue →
                    </Link>
                    <Link href="/cart" className="btn btn-secondary btn-lg">
                        🛒 View Cart
                    </Link>
                </div>
            </section>

            {/* Categories */}
            <section className="section">
                <div className="section-header">
                    <h2>Rental Categories</h2>
                    <p>Everything you need for a standout exhibition booth</p>
                </div>
                <div className="categories-grid">
                    {categories.map(cat => (
                        <Link key={cat.slug} href="/catalogue" className="category-card">
                            <span className="category-icon">{cat.icon}</span>
                            <h3>{cat.title}</h3>
                            <p>{cat.description}</p>
                            <span className="category-count">{cat.count} items available</span>
                        </Link>
                    ))}
                </div>
            </section>

            {/* Top Products */}
            {!loading && visibleProducts.length > 0 && (
                <section className="section">
                    <div className="section-header">
                        <h2>Catalogue Highlights</h2>
                        <p>Browse our popular exhibition booth extras</p>
                    </div>
                    <div className="products-grid">
                        {[...visibleProducts].reverse().slice(0, 6).map(product => (
                            <ProductCard key={product.id} product={product} />
                        ))}
                    </div>
                    {visibleProducts.length > 6 && (
                        <div style={{ textAlign: 'center', marginTop: '3rem' }}>
                            <Link href="/catalogue" className="btn btn-secondary btn-lg" style={{ borderRadius: '30px', padding: '1rem 3rem' }}>
                                Show More Items
                            </Link>
                        </div>
                    )}
                </section>
            )}

            {/* How it Works */}
            <section className="section">
                <div className="section-header">
                    <h2>How It Works</h2>
                    <p>Simple 4-step process to get your booth ready</p>
                </div>
                <div className="categories-grid" style={{ maxWidth: '1000px' }}>
                    {[
                        { icon: '📋', title: 'Browse', desc: 'Explore our catalogue of furniture, screens, and graphics.' },
                        { icon: '🛒', title: 'Order', desc: 'Add items to your cart and submit your order with booth details.' },
                        { icon: '📧', title: 'Confirm', desc: 'Receive confirmation email and our team will follow up.' },
                        { icon: '🚚', title: 'Deliver', desc: 'We deliver, setup, and collect — you focus on your exhibition.' },
                    ].map((step, i) => (
                        <div key={i} className="category-card" style={{ cursor: 'default' }}>
                            <span className="category-icon">{step.icon}</span>
                            <h3>{step.title}</h3>
                            <p>{step.desc}</p>
                        </div>
                    ))}
                </div>
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
