'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import ProductCard from '@/components/storefront/ProductCard';
import { useProducts } from '@/hooks/useProducts';
import { useCart } from '@/lib/cartContext';
import {
    filterProducts,
    getVisibleProducts,
    SHOP_CATEGORIES,
    sortProducts,
} from '@/lib/storefront/catalogue';

export default function CataloguePage() {
    const { products, loading } = useProducts();
    const [activeCategory, setActiveCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [availability, setAvailability] = useState('all');
    const [sortBy, setSortBy] = useState('name');
    const { toast } = useCart();

    const visibleProducts = useMemo(() => getVisibleProducts(products), [products]);
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filtered = useMemo(() => filterProducts(visibleProducts, {
        category: activeCategory,
        query: searchQuery,
        availability,
    }), [activeCategory, availability, searchQuery, visibleProducts]);
    const sorted = useMemo(() => sortProducts(filtered, sortBy), [filtered, sortBy]);

    const hasActiveFilters = activeCategory !== 'all'
        || Boolean(normalizedQuery)
        || availability !== 'all'
        || sortBy !== 'name';

    const clearFilters = () => {
        setActiveCategory('all');
        setSearchQuery('');
        setAvailability('all');
        setSortBy('name');
    };

    return (
        <div className="page-enter">
            <div className="breadcrumb">
                <Link href="/">Home</Link>
                <span>{'\u203A'}</span>
                <span className="current">Catalogue</span>
            </div>

            <section className="section" style={{ paddingBottom: '0.5rem' }}>
                <div className="section-header">
                    <h2>Rental Catalogue</h2>
                    <p>Browse our complete collection of exhibition booth extras</p>
                </div>
            </section>

            <div className="container catalogue-filter-shell">
                <div className="catalogue-filter-panel">
                    <div className="catalogue-search-row">
                        <label className="catalogue-search-box">
                            <span className="catalogue-search-icon">Search</span>
                            <input
                                className="form-input catalogue-search-input"
                                type="search"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Search by name, code, ID, type, or keyword"
                            />
                        </label>

                        <div className="catalogue-select-wrap">
                            <select
                                className="form-select"
                                value={availability}
                                onChange={(event) => setAvailability(event.target.value)}
                            >
                                <option value="all">All availability</option>
                                <option value="in-stock">In stock only</option>
                                <option value="out-of-stock">Out of stock</option>
                            </select>
                        </div>

                        <div className="catalogue-select-wrap">
                            <select
                                className="form-select"
                                value={sortBy}
                                onChange={(event) => setSortBy(event.target.value)}
                            >
                                <option value="name">Sort by Name</option>
                                <option value="price-low">Price: Low to High</option>
                                <option value="price-high">Price: High to Low</option>
                            </select>
                        </div>
                    </div>

                    <div className="catalogue-filter-meta">
                        <div className="filter-bar">
                            {SHOP_CATEGORIES.map((category) => (
                                <button
                                    key={category.value}
                                    className={`filter-chip ${activeCategory === category.value ? 'active' : ''}`}
                                    onClick={() => setActiveCategory(category.value)}
                                    type="button"
                                >
                                    {category.icon} {category.label}
                                </button>
                            ))}
                        </div>

                        <div className="catalogue-results-row">
                            <div className="catalogue-results-copy">
                                <strong>{sorted.length}</strong> item{sorted.length !== 1 ? 's' : ''} found
                                {normalizedQuery ? ` for "${searchQuery.trim()}"` : ''}
                            </div>

                            {hasActiveFilters && (
                                <button className="btn btn-secondary btn-sm" onClick={clearFilters} type="button">
                                    Clear Filters
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <section className="section" style={{ paddingTop: '0' }}>
                {loading ? (
                    <div className="loading-page">
                        <div className="spinner"></div>
                    </div>
                ) : sorted.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">{'\u{1F4E6}'}</div>
                        <h3>No products found</h3>
                        <p>Try a different search or adjust the filters.</p>
                    </div>
                ) : (
                    <div className="products-grid">
                        {sorted.map((product) => (
                            <ProductCard key={product.id} product={product} />
                        ))}
                    </div>
                )}
            </section>

            {toast && (
                <div className="toast">
                    {'\u2705'} {toast}
                </div>
            )}
        </div>
    );
}
