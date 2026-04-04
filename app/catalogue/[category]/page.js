'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ProductCard from '@/components/storefront/ProductCard';
import { useProducts } from '@/hooks/useProducts';
import { useCart } from '@/lib/cartContext';
import {
    filterProducts,
    getCategoryDetails,
    getVisibleProducts,
    sortProducts,
} from '@/lib/storefront/catalogue';

export default function CategoryPage() {
    const params = useParams();
    const category = params.category;
    const { products, loading } = useProducts(category);
    const [searchQuery, setSearchQuery] = useState('');
    const [availability, setAvailability] = useState('all');
    const [sortBy, setSortBy] = useState('name');
    const { toast } = useCart();

    const catInfo = getCategoryDetails(category);
    const visibleProducts = useMemo(() => getVisibleProducts(products), [products]);
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filteredProducts = useMemo(() => filterProducts(visibleProducts, {
        query: searchQuery,
        availability,
    }), [availability, searchQuery, visibleProducts]);
    const sortedProducts = useMemo(() => sortProducts(filteredProducts, sortBy), [filteredProducts, sortBy]);

    const hasActiveFilters = Boolean(normalizedQuery) || availability !== 'all' || sortBy !== 'name';

    const clearFilters = () => {
        setSearchQuery('');
        setAvailability('all');
        setSortBy('name');
    };

    return (
        <div className="page-enter">
            <div className="breadcrumb">
                <Link href="/">Home</Link>
                <span>{'\u203A'}</span>
                <span className="current">{catInfo.title}</span>
            </div>

            <section className="section" style={{ paddingBottom: '1rem' }}>
                <div className="section-header">
                    <span style={{ fontSize: '3rem', display: 'block', marginBottom: '0.5rem' }}>{catInfo.icon}</span>
                    <h2>{catInfo.title}</h2>
                    <p>{catInfo.description}</p>
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
                                placeholder={`Search within ${catInfo.title}`}
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
                        <div className="catalogue-results-row">
                            <div className="catalogue-results-copy">
                                <strong>{sortedProducts.length}</strong> item{sortedProducts.length !== 1 ? 's' : ''} in {catInfo.title}
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

            <section className="section" style={{ paddingTop: '1rem' }}>
                {loading ? (
                    <div className="loading-page">
                        <div className="spinner"></div>
                    </div>
                ) : sortedProducts.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">{'\u{1F4E6}'}</div>
                        <h3>No products found</h3>
                        <p>Try a different search or adjust the filters.</p>
                    </div>
                ) : (
                    <div className="products-grid">
                        {sortedProducts.map((product) => (
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
