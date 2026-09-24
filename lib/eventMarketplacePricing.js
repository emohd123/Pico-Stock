/**
 * Event marketplace pricing helpers.
 *
 * Pure functions shared by the public event page, the admin page and the
 * API, so the client-side running total and the server-side stored totals
 * are always computed the same way.
 *
 * Pricing model
 * -------------
 * Catalogue products carry a per-day rental rate. An event marketplace runs
 * for a fixed number of days (Royal Bahrain Concours 2026 is a 2-day event),
 * so the default "event rate" for a product is:
 *
 *     event rate = catalogue rate per day × event days
 *
 * The admin can override the event rate per item (e.g. a flat package price
 * for the whole event). Custom, event-only items always carry an explicit
 * event rate. VAT is applied on top of the subtotal at the configured rate.
 */

import { extractSizeLabel } from './nameHelpers';

export const DEFAULT_VAT_PERCENT = 10;

export function roundMoney(value) {
    const number = Number(value) || 0;
    return Math.round(number * 1000) / 1000;
}

export function formatMoney(value, currency = 'BHD') {
    const number = roundMoney(value);
    // Whole amounts print without decimals (10 BHD); fractional amounts keep
    // up to three decimals with trailing zeros removed (99.5 BHD, 0.125 BHD).
    const fixed = Number.isInteger(number)
        ? String(number)
        : number.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
    return `${fixed} ${currency}`;
}

export function getEventDays(config) {
    const days = Number.parseInt(config?.days, 10);
    return Number.isFinite(days) && days > 0 ? days : 1;
}

export function getVatPercent(config) {
    const vat = Number(config?.vatPercent);
    if (!Number.isFinite(vat) || vat < 0) return DEFAULT_VAT_PERCENT;
    return vat;
}

/**
 * Resolve the event rate for a catalogue product.
 * Returns a number (0 means "price on request").
 */
export function resolveEventRate(product, itemSettings, config) {
    const override = itemSettings?.eventPrice;
    if (override !== null && override !== undefined && override !== '') {
        const parsed = Number(override);
        if (Number.isFinite(parsed) && parsed >= 0) return roundMoney(parsed);
    }
    const perDay = Number(product?.price) || 0;
    return roundMoney(perDay * getEventDays(config));
}

/**
 * Build the list of items the client sees on the event page.
 *
 * @param {Array} products      Catalogue products (from /api/products).
 * @param {Object} config       Event config (items map + customItems + days).
 * @param {Object} options      { includeHidden: boolean } — admin view lists everything.
 */
export function buildEventCatalogue(products, config, { includeHidden = false } = {}) {
    const itemSettings = config?.items && typeof config.items === 'object' ? config.items : {};
    const catalogue = [];

    for (const product of products || []) {
        if (!product?.id) continue;
        const settings = itemSettings[product.id] || {};
        // A product is on the event page only when the admin explicitly enabled it.
        const enabled = settings.visible === true;
        if (!enabled && !includeHidden) continue;

        const eventRate = resolveEventRate(product, settings, config);
        catalogue.push({
            id: product.id,
            source: 'catalogue',
            name: product.name,
            description: product.description || '',
            category: product.category || 'furniture',
            image: product.image || '',
            gallery: Array.isArray(product.gallery) ? product.gallery : [],
            perDayPrice: Number(product.price) || 0,
            eventPrice: eventRate,
            hasOverride: settings.eventPrice !== null && settings.eventPrice !== undefined && settings.eventPrice !== '',
            visible: enabled,
            sortOrder: Number(settings.sortOrder) || 0,
            stock: product.availableStock ?? product.stock ?? null,
            inStock: product.inStock !== false,
            note: String(settings.note || ''),
            // Admin-entered size wins; otherwise read it from the Pico product name.
            size: String(settings.size || '') || extractSizeLabel(product.name),
        });
    }

    for (const custom of Array.isArray(config?.customItems) ? config.customItems : []) {
        if (!custom?.id) continue;
        const enabled = custom.visible !== false;
        if (!enabled && !includeHidden) continue;
        catalogue.push({
            id: custom.id,
            source: 'custom',
            name: String(custom.name || 'Event item'),
            description: String(custom.description || ''),
            category: String(custom.category || 'event'),
            image: String(custom.image || ''),
            gallery: [],
            perDayPrice: null,
            eventPrice: roundMoney(custom.eventPrice),
            hasOverride: true,
            visible: enabled,
            sortOrder: Number(custom.sortOrder) || 0,
            stock: null,
            inStock: true,
            note: String(custom.note || ''),
            size: String(custom.size || ''),
        });
    }

    return catalogue.sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
}

/**
 * Compute totals for a set of selected items.
 * Items: [{ id, name, eventPrice, quantity }]
 */
export function computeRequestTotals(items, config) {
    const vatPercent = getVatPercent(config);
    const lines = (items || []).map((item) => {
        const quantity = Math.max(1, Number.parseInt(item.quantity, 10) || 1);
        const unit = roundMoney(item.eventPrice);
        return {
            ...item,
            quantity,
            eventPrice: unit,
            lineTotal: roundMoney(unit * quantity),
        };
    });
    const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
    const vatAmount = roundMoney(subtotal * (vatPercent / 100));
    const total = roundMoney(subtotal + vatAmount);
    const hasPriceOnRequest = lines.some((line) => line.eventPrice <= 0);
    return { lines, subtotal, vatPercent, vatAmount, total, hasPriceOnRequest };
}
