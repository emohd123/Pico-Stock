import {
    extractCatalogNumber,
    extractCleanName,
    extractProductCode,
    hasMeaningfulProductName,
    inferProductType,
} from '@/lib/nameHelpers';

export const SHOP_CATEGORIES = [
    {
        value: 'all',
        slug: 'all',
        icon: '\u{1F4E6}',
        label: 'All Products',
        title: 'All Products',
        description: 'Browse the full rental catalogue for exhibition furniture, screens, and graphics.',
    },
    {
        value: 'furniture',
        slug: 'furniture',
        icon: '\u{1FA91}',
        label: 'Furniture',
        title: 'Furniture',
        description: 'Premium tables, chairs, counters and display furniture for your exhibition booth.',
    },
    {
        value: 'tv-led',
        slug: 'tv-led',
        icon: '\u{1F4FA}',
        label: 'TV / LED',
        title: 'TV / LED Screens',
        description: 'High-definition displays, video walls, touch screens and digital kiosks.',
    },
    {
        value: 'graphics',
        slug: 'graphics',
        icon: '\u{1F3A8}',
        label: 'Graphics',
        title: 'Graphics',
        description: 'Custom printed backdrops, banners, signage and floor graphics.',
    },
];

export const HOME_STEPS = [
    { icon: '\u{1F4CB}', title: 'Browse', description: 'Explore our catalogue of furniture, screens, and graphics.' },
    { icon: '\u{1F6D2}', title: 'Order', description: 'Add items to your cart and submit your order with booth details.' },
    { icon: '\u{1F4E7}', title: 'Confirm', description: 'Receive confirmation email and our team will follow up.' },
    { icon: '\u{1F69A}', title: 'Deliver', description: 'We deliver, set up, and collect while you focus on your exhibition.' },
];

export function getCategoryDetails(category) {
    return SHOP_CATEGORIES.find((item) => item.value === category || item.slug === category)
        || {
            value: category,
            slug: category,
            icon: '\u{1F4E6}',
            label: category,
            title: category,
            description: '',
        };
}

export function getVisibleProducts(products) {
    return products.filter((product) => hasMeaningfulProductName(product?.name));
}

export function buildProductSearchText(product) {
    return [
        product?.name,
        extractCleanName(product?.name),
        extractCatalogNumber(product?.name),
        extractProductCode(product?.name),
        inferProductType(product),
        product?.category,
        product?.description,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

export function isProductInStock(product) {
    const availableStock = product?.availableStock ?? product?.stock;
    return product?.inStock !== false && (
        availableStock === null
        || availableStock === undefined
        || availableStock > 0
    );
}

export function filterProducts(products, { category = 'all', query = '', availability = 'all' } = {}) {
    const normalizedQuery = query.trim().toLowerCase();

    return products.filter((product) => {
        const matchesCategory = category === 'all' || product?.category === category;
        const matchesSearch = !normalizedQuery || buildProductSearchText(product).includes(normalizedQuery);
        const inStock = isProductInStock(product);
        const matchesAvailability = availability === 'all'
            || (availability === 'in-stock' && inStock)
            || (availability === 'out-of-stock' && !inStock);

        return matchesCategory && matchesSearch && matchesAvailability;
    });
}

export function sortProducts(products, sortBy = 'name') {
    return [...products].sort((a, b) => {
        if (sortBy === 'price-low') return Number(a?.price || 0) - Number(b?.price || 0);
        if (sortBy === 'price-high') return Number(b?.price || 0) - Number(a?.price || 0);
        return extractCleanName(a?.name || '').localeCompare(extractCleanName(b?.name || ''));
    });
}
