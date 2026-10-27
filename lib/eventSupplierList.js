/**
 * Supplier list for an event: every item clients requested, added up across
 * all requests and grouped by the supplier it comes from, so each supplier can
 * be sent one list of the total quantities needed. Pure functions, shared by
 * the admin tab, the printable sheet and the CSV.
 */

import { SUPPLIERS, supplierForItem } from './eventMarginReport';
import { extractCleanName, getProductSpecs } from './nameHelpers';

export const SUPPLIER_ORDER = ['warehouse', 'rahal', 'pico', 'custom'];

/** Which requests count: confirmed only, or everything not declined. */
export const SUPPLIER_LIST_SCOPES = {
    confirmed: 'Confirmed requests only',
    active: 'All requests except declined',
};

// Pico's own stock names carry codes ("ID 5119 FSSOFABEIGE3 [10] Armchair Beige H88*D92*W97cm");
// other suppliers' names are already clean and must be kept as they are.
function isCodedName(item) {
    return item.source !== 'custom' && /^ID\s/i.test(String(item.name || ''));
}

function displayName(item) {
    if (!isCodedName(item)) return item.name;
    const clean = extractCleanName(item.name);
    return clean && clean !== '--' ? clean : item.name;
}

function specsOf(item) {
    if (!isCodedName(item)) return { code: '', size: item.size || '' };
    const specs = getProductSpecs({ name: item.name });
    const code = [specs.idNo !== '—' ? `ID ${specs.idNo}` : '', specs.code !== '—' ? specs.code : ''].filter(Boolean).join(' · ');
    return { code, size: specs.dimensions !== '—' ? specs.dimensions.replace(/x/g, ' × ') : (item.size || '') };
}

export function requestsInScope(requests, scope = 'confirmed') {
    return (requests || []).filter((request) => (scope === 'active' ? request.status !== 'declined' : request.status === 'confirmed'));
}

/**
 * @returns {{ suppliers: Array, requestCount: number, totalQuantity: number, lineCount: number }}
 * Each supplier: { supplier, supplierName, items: [{ id, name, code, size, image, quantity,
 *   clients: [{ reference, company, quantity, comment }] }], totalQuantity }.
 */
export function buildSupplierList(requests, scope = 'confirmed') {
    const included = requestsInScope(requests, scope);
    const groups = new Map();

    for (const request of included) {
        for (const item of request.items || []) {
            const supplier = supplierForItem(item.id, item.source);
            if (!groups.has(supplier)) groups.set(supplier, new Map());
            const items = groups.get(supplier);
            const quantity = Math.max(1, Number.parseInt(item.quantity, 10) || 1);
            if (!items.has(item.id)) {
                items.set(item.id, { id: item.id, name: displayName(item), ...specsOf(item), image: item.image || '', quantity: 0, clients: [] });
            }
            const entry = items.get(item.id);
            entry.quantity += quantity;
            if (!entry.image && item.image) entry.image = item.image;
            entry.clients.push({ reference: request.reference, company: request.company, quantity, comment: item.comment || '' });
        }
    }

    const rank = (key) => {
        const index = SUPPLIER_ORDER.indexOf(key);
        return index === -1 ? SUPPLIER_ORDER.length : index;
    };
    const suppliers = [...groups.entries()]
        .sort(([a], [b]) => rank(a) - rank(b))
        .map(([supplier, items]) => {
            const list = [...items.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
            return {
                supplier,
                supplierName: SUPPLIERS[supplier] || supplier,
                items: list,
                totalQuantity: list.reduce((sum, item) => sum + item.quantity, 0),
            };
        });

    return {
        suppliers,
        requestCount: included.length,
        lineCount: suppliers.reduce((sum, group) => sum + group.items.length, 0),
        totalQuantity: suppliers.reduce((sum, group) => sum + group.totalQuantity, 0),
    };
}

/** Plain text for WhatsApp / email: items and total quantities only. */
export function supplierListText(group, eventName) {
    const lines = group.items.map((item, index) => `${index + 1}. ${item.name}${item.code ? ` (${item.code})` : ''}${item.size ? `, ${item.size}` : ''} — Qty ${item.quantity}`);
    return [
        `Pico International (Bahrain) — requirement list`,
        `${eventName}${group.supplierName ? ` · ${group.supplierName}` : ''}`,
        '',
        ...lines,
        '',
        `Total: ${group.items.length} item${group.items.length === 1 ? '' : 's'}, ${group.totalQuantity} piece${group.totalQuantity === 1 ? '' : 's'}`,
    ].join('\n');
}
