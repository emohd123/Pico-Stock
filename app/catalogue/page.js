'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProductCard from '@/components/ProductCard';
import { useCart } from '@/lib/cartContext';
import {
    extractCatalogNumber,
    extractCleanName,
    extractProductCode,
    hasMeaningfulProductName,
    inferProductType,
} from '@/lib/nameHelpers';

const categories = [
    { value: 'all', label: 'All Products', icon: '📦' },
    { value: 'furniture', label: 'Furniture', icon: '🪑' },
    { value: 'tv-led', label: 'TV / LED', icon: '📺' },
    { value: 'graphics', label: 'Graphics', icon: '🎨' },
];

function buildSearchText(product) {
    return [
        product.name,
        extractCleanName(product.name),
        extractCatalogNumber(product.name),
        extractProductCode(product.name),
        inferProductType(product),
        product.category,
        product.description,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

function isProductInStock(product) {
    const availableStock = product.availableStock ?? product.stock;
    return product.inStock !== false && (
        availableStock === null ||
        availableStock === undefined ||
        availableStock > 0
    );
}

export default function CataloguePage() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [availability, setAvailability] = useState('all');
    const [sortBy, setSortBy] = useState('name');
    const { toast } = useCart();

    useEffect(() => {
        fetch('/api/products')
            .then((res) => res.json())
            .then((data) => {
                setProducts(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const visibleProducts = products.filter((product) => hasMeaningfulProductName(product.name));
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const filtered = visibleProducts.filter((product) => {
        const matchesCategory = activeCategory === 'all' || product.category === activeCategory;
        const matchesSearch = !normalizedQuery || buildSearchText(product).includes(normalizedQuery);
        const inStock = isProductInStock(product);
        const matchesAvailability = availability === 'all'
            || (availability === 'in-stock' && inStock)
            || (availability === 'out-of-stock' && !inStock);

        return matchesCategory && matchesSearch && matchesAvailability;
    });

    const sorted = [...filtered].sort((a, b) => {
        if (sortBy === 'price-low') return a.price - b.price;
        if (sortBy === 'price-high') return b.price - a.price;
        return extractCleanName(a.name || '').localeCompare(extractCleanName(b.name || ''));
    });

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
                <span>›</span>
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
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by name, code, ID, type, or keyword"
                            />
                        </label>

                        <div className="catalogue-select-wrap">
                            <select
                                className="form-select"
                                value={availability}
                                onChange={(e) => setAvailability(e.target.value)}
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
                                onChange={(e) => setSortBy(e.target.value)}
                            >
                                <option value="name">Sort by Name</option>
                                <option value="price-low">Price: Low to High</option>
                                <option value="price-high">Price: High to Low</option>
                            </select>
                        </div>
                    </div>

                    <div className="filter-bar">
                        {categories.map((category) => (
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

            <section className="section" style={{ paddingTop: '0' }}>
                {loading ? (
                    <div className="loading-page">
                        <div className="spinner"></div>
                    </div>
                ) : sorted.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📦</div>
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
                    ✅ {toast}
                </div>
            )}
        </div>
    );
}
