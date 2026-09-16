import { NextResponse } from 'next/server';
import { getEventMarketplace } from '@/lib/eventMarketplaceStore';
import { buildEventCatalogue } from '@/lib/eventMarketplacePricing';
import { getProducts, getOrderStockInfo } from '@/lib/store';

export const dynamic = 'force-dynamic';

const STOCK_HOLD_STATUSES = new Set(['confirmed', 'processing']);

async function loadProductsWithAvailability() {
    const [products, orders] = await Promise.all([
        getProducts(),
        getOrderStockInfo().catch(() => []),
    ]);
    const reserved = new Map();
    for (const order of orders) {
        if (!STOCK_HOLD_STATUSES.has(order.status)) continue;
        for (const item of order.items || []) {
            if (!item?.id) continue;
            reserved.set(item.id, (reserved.get(item.id) || 0) + (Number(item.quantity) || 0));
        }
    }
    return products.map((product) => {
        if (product.stock === null || product.stock === undefined) {
            return { ...product, availableStock: null };
        }
        const availableStock = Math.max(0, Number(product.stock) - (reserved.get(product.id) || 0));
        return { ...product, availableStock, inStock: availableStock > 0 };
    });
}

/**
 * Public event marketplace payload. Only the fields a client needs are
 * returned, and only when the event is open (draft/closed events return the
 * header so the page can explain why the catalogue is unavailable).
 */
export async function GET(_request, { params }) {
    try {
        const config = await getEventMarketplace(params.slug);
        if (!config) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }

        const isOpen = config.status === 'open';
        const products = isOpen ? await loadProductsWithAvailability() : [];
        const items = isOpen ? buildEventCatalogue(products, config) : [];

        return NextResponse.json({
            event: {
                id: config.id,
                name: config.name,
                tagline: config.tagline,
                description: config.description,
                days: config.days,
                startDate: config.startDate,
                endDate: config.endDate,
                venue: config.venue,
                status: config.status,
                currency: config.currency,
                vatPercent: config.vatPercent,
                paymentTerms: config.paymentTerms,
                contactEmail: config.contactEmail,
                contactPhone: config.contactPhone,
                heroImage: config.heroImage,
            },
            items,
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Event marketplace load failed:', error);
        return NextResponse.json({ error: 'Failed to load event' }, { status: 500 });
    }
}
