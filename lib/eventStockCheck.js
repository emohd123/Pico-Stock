/**
 * Stock check for confirming an event request.
 *
 * Available = product stock − confirmed/processing shop orders − every other
 * confirmed event request. A request can only be confirmed when each of its
 * lines fits in what is available, so confirmed totals never exceed stock.
 * Items without a stock figure (custom items, items with no quantity on file)
 * are not limited.
 */

import { getProducts, getOrderStockInfo } from './store';
import { EVENT_MARKETPLACE_DEFAULTS, listEventRequests, updateEventRequest } from './eventMarketplaceStore';

const SHOP_HOLD_STATUSES = new Set(['confirmed', 'processing']);

function displayName(name) {
    const match = String(name || '').match(/^ID[\s\d;]+[A-Z][A-Z0-9]*\s*\[[^\]]*\]\s*(.*)$/i);
    const clean = match ? match[1].replace(/\s+H\d[\d.*xXDWL]*(cm)?\s*$/i, '').trim() : String(name || '');
    return clean || String(name || '');
}

/**
 * Units held per product id, leaving out one request (the one being checked).
 */
async function heldQuantities(excludeRequestId) {
    const held = new Map();
    const add = (id, quantity) => {
        if (!id) return;
        held.set(id, (held.get(id) || 0) + (Number(quantity) || 0));
    };

    const orders = await getOrderStockInfo().catch(() => []);
    for (const order of orders) {
        if (!SHOP_HOLD_STATUSES.has(order.status)) continue;
        for (const item of order.items || []) add(item?.id, item?.quantity);
    }

    for (const slug of Object.keys(EVENT_MARKETPLACE_DEFAULTS)) {
        const requests = await listEventRequests(slug);
        for (const request of requests) {
            if (request.status !== 'confirmed' || request.id === excludeRequestId) continue;
            for (const item of request.items || []) add(item.id, item.quantity);
        }
    }
    return held;
}

/**
 * Per-line availability for a request, as if every other confirmed
 * request and order stays as it is.
 * Returns { lines: [{ id, name, requested, available }], shortages: [...] }.
 */
export async function checkRequestAvailability(request) {
    const [products, held] = await Promise.all([getProducts(), heldQuantities(request.id)]);
    const stockById = new Map(products.map((product) => [product.id, product.stock]));

    const requestedById = new Map();
    for (const item of request.items || []) {
        const entry = requestedById.get(item.id) || { id: item.id, name: displayName(item.name), requested: 0 };
        entry.requested += Number(item.quantity) || 0;
        requestedById.set(item.id, entry);
    }

    const lines = [...requestedById.values()].map((entry) => {
        const stock = stockById.get(entry.id);
        const limited = stock !== null && stock !== undefined;
        const available = limited ? Math.max(0, Number(stock) - (held.get(entry.id) || 0)) : null;
        return { ...entry, available };
    });
    return { lines, shortages: lines.filter((line) => line.available !== null && line.requested > line.available) };
}

export function shortageMessage(shortages) {
    const parts = shortages.map((line) => `${line.name}: ${line.requested} requested, ${line.available} available`);
    return `Not enough stock to confirm. ${parts.join('; ')}. Reduce the quantities or decline the request.`;
}

export class StockShortageError extends Error {
    constructor(shortages) {
        super(shortageMessage(shortages));
        this.name = 'StockShortageError';
        this.status = 409;
        this.shortages = shortages;
    }
}

/**
 * Change a request's status, refusing a confirmation that would oversell.
 * After saving a confirmation it checks once more, so two confirmations made
 * at the same moment can't both take the last units: the later one is put
 * back to its previous status.
 */
export async function updateRequestStatusSafely(slug, existing, updates) {
    const confirming = updates.status === 'confirmed' && existing.status !== 'confirmed';
    if (confirming) {
        const { shortages } = await checkRequestAvailability(existing);
        if (shortages.length) throw new StockShortageError(shortages);
    }

    const updated = await updateEventRequest(slug, existing.id, updates);
    if (!confirming || !updated) return updated;

    const recheck = await checkRequestAvailability(updated);
    if (recheck.shortages.length) {
        await updateEventRequest(slug, existing.id, { status: existing.status, adminNotes: existing.adminNotes });
        throw new StockShortageError(recheck.shortages);
    }
    return updated;
}

/**
 * Availability for several requests at once (the organizer's review list).
 * For each request, "available" is what it could take if confirmed now:
 * stock minus everything else that is held, its own hold excluded.
 */
export async function availabilityForRequests(requests) {
    const [products, heldAll] = await Promise.all([getProducts(), heldQuantities(null)]);
    const stockById = new Map(products.map((product) => [product.id, product.stock]));
    const result = new Map();
    for (const request of requests) {
        const own = new Map();
        if (request.status === 'confirmed') {
            for (const item of request.items || []) own.set(item.id, (own.get(item.id) || 0) + (Number(item.quantity) || 0));
        }
        const lines = (request.items || []).map((item) => {
            const stock = stockById.get(item.id);
            if (stock === null || stock === undefined) return { id: item.id, available: null };
            const heldByOthers = (heldAll.get(item.id) || 0) - (own.get(item.id) || 0);
            return { id: item.id, available: Math.max(0, Number(stock) - heldByOthers) };
        });
        result.set(request.id, lines);
    }
    return result;
}
