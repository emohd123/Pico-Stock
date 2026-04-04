'use client';

import { useEffect, useState } from 'react';

export function useProducts(category) {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        async function loadProducts() {
            setLoading(true);

            try {
                const query = category ? `?category=${encodeURIComponent(category)}` : '';
                const response = await fetch(`/api/products${query}`);
                const data = await response.json();

                if (!cancelled) {
                    setProducts(Array.isArray(data) ? data : []);
                }
            } catch {
                if (!cancelled) {
                    setProducts([]);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        loadProducts();

        return () => {
            cancelled = true;
        };
    }, [category]);

    return { products, loading };
}
