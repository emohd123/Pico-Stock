'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import ProductCard from '@/components/storefront/ProductCard';
import { useProducts } from '@/hooks/useProducts';
import { useCart } from '@/lib/cartContext';
import { getVisibleProducts, HOME_STEPS, SHOP_CATEGORIES } from '@/lib/storefront/catalogue';

export default function HomePage() {
    const { products, loading } = useProducts();
    const { toast } = useCart();
    const visibleProducts = useMemo(() => getVisibleProducts(products), [products]);
    const categories = useMemo(() => (
        SHOP_CATEGORIES
            .filter((category) => category.value !== 'all')
            .map((category) => ({
                ...category,
                count: visibleProducts.filter((product) => product.category === category.value).length,
            }))
    ), [visibleProducts]);

    return (
        <div className="page-enter">
            <section className="hero">
                <div className="hero-badge">
                    {'\u2728'} Premium Exhibition Services
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
                        Browse Catalogue {'\u2192'}
                    </Link>
                    <Link href="/cart" className="btn btn-secondary btn-lg">
                        {'\u{1F6D2}'} View Cart
                    </Link>
                </div>
            </section>

            <section className="section">
                <div className="section-header">
                    <h2>Rental Categories</h2>
                    <p>Everything you need for a standout exhibition booth</p>
                </div>
                <div className="categories-grid">
                    {categories.map((category) => (
                        <Link key={category.slug} href={`/catalogue/${category.slug}`} className="category-card">
                            <span className="category-icon">{category.icon}</span>
                            <h3>{category.title}</h3>
                            <p>{category.description}</p>
                            <span className="category-count">{category.count} items available</span>
                        </Link>
                    ))}
                </div>
            </section>

            {!loading && visibleProducts.length > 0 && (
                <section className="section">
                    <div className="section-header">
                        <h2>Catalogue Highlights</h2>
                        <p>Browse our popular exhibition booth extras</p>
                    </div>
                    <div className="products-grid">
                        {[...visibleProducts].reverse().slice(0, 6).map((product) => (
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

            <section className="section">
                <div className="section-header">
                    <h2>How It Works</h2>
                    <p>Simple 4-step process to get your booth ready</p>
                </div>
                <div className="categories-grid" style={{ maxWidth: '1000px' }}>
                    {HOME_STEPS.map((step) => (
                        <div key={step.title} className="category-card" style={{ cursor: 'default' }}>
                            <span className="category-icon">{step.icon}</span>
                            <h3>{step.title}</h3>
                            <p>{step.description}</p>
                        </div>
                    ))}
                </div>
            </section>

            {toast && (
                <div className="toast">
                    {'\u2705'} {toast}
                </div>
            )}
        </div>
    );
}
