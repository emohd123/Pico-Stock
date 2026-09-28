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
 *   our margin    = client total − supplier cost
 * Pico's own stock has no supplier: the whole line is our revenue.
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
    return { lines: 0, quantity: 0, clientTotal: 0, supplierCost: 0, margin: 0, missingCost: 0 };
}

function addTo(totals, line) {
    totals.lines += 1;
    totals.quantity += line.quantity;
    totals.clientTotal = roundMoney(totals.clientTotal + line.clientTotal);
    totals.supplierCost = roundMoney(totals.supplierCost + (line.supplierCost || 0));
    totals.margin = roundMoney(totals.margin + (line.margin || 0));
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

    for (const { config, requests: eventRequests } of events || []) {
        const days = Math.max(1, Number.parseInt(config?.days, 10) || 1);
        for (const request of eventRequests || []) {
            if (request.status !== 'confirmed') continue;
            let requestClient = 0;
            let requestMargin = 0;
            let requestCost = 0;
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
                    costMissing,
                };
                lines.push(line);
                requestClient += clientTotal;
                requestCost += supplierCost || 0;
                requestMargin += margin || 0;
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
            linesMissingCost: overall.missingCost,
        },
        bySupplier: supplierRows,
        byClient: Object.values(byClient).sort((a, b) => b.clientTotal - a.clientTotal),
        requests,
        lines,
    };
}
