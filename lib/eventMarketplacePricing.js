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
 *
 * Late-order surcharge: the event can carry a schedule of steps
 * ({ from: 'YYYY-MM-DD', percent, label }). An order placed on or after a
 * step's date (Bahrain time) pays that % on top of the item subtotal, as a
 * separate line before VAT; item prices themselves never change. The % is
 * fixed when the order is placed and stored with it.
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
/** Calendar date (YYYY-MM-DD) in Bahrain (UTC+3, no DST) for a timestamp. */
export function bahrainDate(value = new Date()) {
    const date = new Date(value);
    const time = Number.isNaN(date.getTime()) ? Date.now() : date.getTime();
    return new Date(time + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** The event's surcharge steps, cleaned and sorted by start date. */
export function surchargeSteps(config) {
    return (Array.isArray(config?.surcharges) ? config.surcharges : [])
        .map((step) => ({
            from: String(step?.from || '').slice(0, 10),
            percent: Math.max(0, Math.min(500, Number(step?.percent) || 0)),
            label: String(step?.label || '').trim().slice(0, 80),
        }))
        .filter((step) => /^\d{4}-\d{2}-\d{2}$/.test(step.from) && step.percent > 0)
        .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

/** Surcharge in force for an order placed at `when`: { percent, label } (0 when none). */
export function surchargeFor(config, when = new Date()) {
    const day = bahrainDate(when);
    const step = surchargeSteps(config).filter((s) => s.from <= day).pop();
    return step ? { percent: step.percent, label: step.label || 'Late-order surcharge' } : { percent: 0, label: '' };
}

/** The surcharge stored on a request; drafts (never saved) use today's rate. */
export function requestSurcharge(request, config) {
    if (request && request.surchargePercent !== undefined && request.surchargePercent !== null) {
        return { percent: Number(request.surchargePercent) || 0, label: String(request.surchargeLabel || '') || 'Late-order surcharge' };
    }
    return surchargeFor(config, request?.createdAt || new Date());
}

export function computeRequestTotals(items, config, surcharge = null) {
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
    const surchargePercent = Math.max(0, Number(surcharge?.percent) || 0);
    const surchargeLabel = surchargePercent > 0 ? String(surcharge?.label || 'Late-order surcharge') : '';
    const surchargeAmount = roundMoney(subtotal * (surchargePercent / 100));
    const vatAmount = roundMoney((subtotal + surchargeAmount) * (vatPercent / 100));
    const total = roundMoney(subtotal + surchargeAmount + vatAmount);
    const hasPriceOnRequest = lines.some((line) => line.eventPrice <= 0);
    return { lines, subtotal, surchargePercent, surchargeLabel, surchargeAmount, vatPercent, vatAmount, total, hasPriceOnRequest };
}

/**
 * Turn the lines a client sent ({ id, quantity, comment }) into priced
 * request lines, using only the live event catalogue for name and price —
 * prices are never taken from the client. Unknown ids are dropped.
 */
export function resolveOrderLines(catalogue, requestedLines, maxLines = 60) {
    const byId = new Map((catalogue || []).map((item) => [item.id, item]));
    const lines = [];
    for (const line of (Array.isArray(requestedLines) ? requestedLines : []).slice(0, maxLines)) {
        const match = line && line.id ? byId.get(String(line.id)) : null;
        if (!match) continue;
        lines.push({
            id: match.id,
            source: match.source,
            name: match.name,
            category: match.category,
            image: match.image,
            eventPrice: match.eventPrice,
            quantity: line.quantity,
            comment: line.comment,
        });
    }
    return lines;
}
