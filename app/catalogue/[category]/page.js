'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
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

const categoryLabels = {
    furniture: {
        title: 'Furniture',
        icon: '🪑',
        description: 'Premium tables, chairs, counters and display furniture for your exhibition booth.',
    },
    'tv-led': {
        title: 'TV / LED Screens',
        icon: '📺',
        description: 'High-definition displays, video walls, touch screens and digital kiosks.',
    },
    graphics: {
        title: 'Graphics',
        icon: '🎨',
        description: 'Custom printed backdrops, banners, signage and floor graphics.',
    },
};

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

export default function CategoryPage() {
    const params = useParams();
    const category = params.category;
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [availability, setAvailability] = useState('all');
    const [sortBy, setSortBy] = useState('name');
    const { toast } = useCart();

    const catInfo = categoryLabels[category] || { title: category, icon: '📦', description: '' };

    useEffect(() => {
        fetch(`/api/products?category=${category}`)
            .then((res) => res.json())
            .then((data) => {
                setProducts(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [category]);

    const visibleProducts = products.filter((product) => hasMeaningfulProductName(product.name));
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const filteredProducts = visibleProducts.filter((product) => {
        const matchesSearch = !normalizedQuery || buildSearchText(product).includes(normalizedQuery);
        const inStock = isProductInStock(product);
        const matchesAvailability = availability === 'all'
            || (availability === 'in-stock' && inStock)
            || (availability === 'out-of-stock' && !inStock);

        return matchesSearch && matchesAvailability;
    });

    const sortedProducts = [...filteredProducts].sort((a, b) => {
        if (sortBy === 'price-low') return a.price - b.price;
        if (sortBy === 'price-high') return b.price - a.price;
        return extractCleanName(a.name || '').localeCompare(extractCleanName(b.name || ''));
    });

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
                                placeholder={`Search within ${catInfo.title}`}
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
                        <div className="empty-state-icon">📦</div>
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
                    ✅ {toast}
                </div>
            )}
        </div>
    );
}
