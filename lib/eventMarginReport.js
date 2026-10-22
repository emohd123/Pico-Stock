/**
 * Margin report for confirmed event requests.
 *
 * Internal only: it names the supplier behind each item, which the public
 * pages never show. Pure functions, so the API and any export share one
 * calculation.
 *
 * Per request line
 *   client total  = unit price on the request × quantity (VAT excluded)
 *   supplier cost = supplier 1-day price (product cost price) × event days × quantity
 *   margin        = client total − supplier cost
 *   client share  = client total × the event's client share % (the organizer's cut)
 *   our net       = margin − client share
 * Pico's own stock has no supplier: the whole line is margin (the client share still applies).
 */

import { roundMoney } from './eventMarketplacePricing';

export const SUPPLIERS = {
    warehouse: 'Warehouse (warehousebh.com)',
    rahal: 'Rahal',
    pico: 'Pico own stock',
    custom: 'Custom event item',
};

/** Which supplier an item comes from, by its product id. */
export function supplierForItem(itemId, source) {
    if (source === 'custom') return 'custom';
    const id = String(itemId || '');
    if (id.startsWith('wh-')) return 'warehouse';
    if (id.startsWith('nx-')) return 'rahal';
    if (id.startsWith('custom-')) return 'custom';
    return 'pico';
}

function emptyTotals() {
    return { lines: 0, quantity: 0, clientTotal: 0, supplierCost: 0, margin: 0, clientShare: 0, ourNet: 0, missingCost: 0 };
}

function addTo(totals, line) {
    totals.lines += 1;
    totals.quantity += line.quantity;
    totals.clientTotal = roundMoney(totals.clientTotal + line.clientTotal);
    totals.supplierCost = roundMoney(totals.supplierCost + (line.supplierCost || 0));
    totals.margin = roundMoney(totals.margin + (line.margin || 0));
    totals.clientShare = roundMoney(totals.clientShare + line.clientShare);
    totals.ourNet = roundMoney(totals.ourNet + (line.ourNet || 0));
    if (line.costMissing) totals.missingCost += 1;
}

/**
 * @param {Array} events    [{ config, requests }] — config gives name and days.
 * @param {Array} products  Catalogue products with costPrice (supplier 1-day price).
 */
export function buildMarginReport(events, products) {
    const productById = new Map((products || []).map((product) => [product.id, product]));
    const lines = [];
    const requests = [];
    const eventSettings = [];

    for (const { config, requests: eventRequests } of events || []) {
        const days = Math.max(1, Number.parseInt(config?.days, 10) || 1);
        const sharePercent = Math.max(0, Math.min(100, Number(config?.clientSharePercent) || 0));
        eventSettings.push({ id: config.id, name: config.name, clientSharePercent: sharePercent });
        for (const request of eventRequests || []) {
            if (request.status !== 'confirmed') continue;
            let requestClient = 0;
            let requestMargin = 0;
            let requestCost = 0;
            let requestShare = 0;
            let requestNet = 0;
            for (const item of request.items || []) {
                const supplier = supplierForItem(item.id, item.source);
                const quantity = Math.max(1, Number(item.quantity) || 1);
                const clientUnit = roundMoney(item.eventPrice);
                const clientTotal = roundMoney(clientUnit * quantity);
                const product = productById.get(item.id);
                const dayCost = product?.costPrice;
                let supplierUnitCost = null;
                if (supplier === 'pico' || supplier === 'custom') supplierUnitCost = 0;
                else if (dayCost !== null && dayCost !== undefined && dayCost !== '') supplierUnitCost = roundMoney(Number(dayCost) * days);
                const costMissing = supplierUnitCost === null;
                const supplierCost = costMissing ? null : roundMoney(supplierUnitCost * quantity);
                const margin = costMissing ? null : roundMoney(clientTotal - supplierCost);
                const clientShare = roundMoney((clientTotal * sharePercent) / 100);
                const ourNet = costMissing ? null : roundMoney(margin - clientShare);
                const line = {
                    eventId: config.id,
                    eventName: config.name,
                    days,
                    requestId: request.id,
                    reference: request.reference,
                    company: request.company,
                    confirmedAt: request.updatedAt,
                    itemId: item.id,
                    itemName: item.name,
                    supplier,
                    supplierName: SUPPLIERS[supplier],
                    quantity,
                    clientUnit,
                    clientTotal,
                    supplierUnitCost,
                    supplierCost,
                    margin,
                    clientShare,
                    ourNet,
                    costMissing,
                };
                lines.push(line);
                requestClient += clientTotal;
                requestCost += supplierCost || 0;
                requestMargin += margin || 0;
                requestShare += clientShare;
                requestNet += ourNet || 0;
            }
            requests.push({
                eventName: config.name,
                reference: request.reference,
                company: request.company,
                confirmedAt: request.updatedAt,
                clientTotal: roundMoney(requestClient),
                vatAmount: roundMoney(request.vatAmount),
                totalWithVat: roundMoney(request.total),
                supplierCost: roundMoney(requestCost),
                margin: roundMoney(requestMargin),
                clientShare: roundMoney(requestShare),
                ourNet: roundMoney(requestNet),
            });
        }
    }

    const bySupplier = {};
    const byClient = {};
    const overall = emptyTotals();
    for (const line of lines) {
        addTo((bySupplier[line.supplier] ||= { supplier: line.supplier, supplierName: line.supplierName, ...emptyTotals() }), line);
        addTo((byClient[line.company] ||= { company: line.company, ...emptyTotals() }), line);
        addTo(overall, line);
    }

    const supplierRows = Object.values(bySupplier).sort((a, b) => b.clientTotal - a.clientTotal);
    const ownStock = bySupplier.pico || emptyTotals();
    const supplierMargin = roundMoney(supplierRows.filter((row) => row.supplier !== 'pico').reduce((sum, row) => sum + row.margin, 0));

    return {
        generatedAt: new Date().toISOString(),
        summary: {
            confirmedRequests: requests.length,
            clientTotal: overall.clientTotal,
            payToSuppliers: roundMoney(overall.supplierCost),
            marginOnSupplierItems: supplierMargin,
            ownStockRevenue: ownStock.clientTotal,
            totalEarnings: roundMoney(supplierMargin + ownStock.clientTotal),
            margin: overall.margin,
            clientShare: overall.clientShare,
            ourNet: overall.ourNet,
            linesMissingCost: overall.missingCost,
        },
        events: eventSettings,
        bySupplier: supplierRows,
        byClient: Object.values(byClient).sort((a, b) => b.clientTotal - a.clientTotal),
        requests,
        lines,
    };
}
