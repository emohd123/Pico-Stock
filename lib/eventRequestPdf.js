/**
 * Event request form PDF.
 *
 * Renders a client's event marketplace request in the same layout as the
 * Pico quotation (logo + company block, client panel, item table with
 * pictures, VAT summary, terms) by mapping the request onto a quotation
 * shaped object and reusing the quotation PDF engine.
 */

import fs from 'fs';
import path from 'path';
import { generateQuotationPdf } from '@/lib/quotationExport';
import { QUOTATION_COMPANY_PROFILE, normalizeCurrencyCode } from '@/lib/quotationCommercial';
import { extractCleanName, getProductSpecs } from '@/lib/nameHelpers';
import { computeRequestTotals, roundMoney } from '@/lib/eventMarketplacePricing';
import { getProducts } from '@/lib/store';

const IMAGE_MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

/** Load a public product image as a base64 data URL (PDFKit supports JPEG/PNG only). */
function loadImageDataUrl(imagePath) {
    const value = String(imagePath || '').trim();
    if (!value || /^https?:\/\//i.test(value) || value.startsWith('data:')) {
        return value.startsWith('data:') ? value : '';
    }
    try {
        const relative = value.startsWith('/') ? value.slice(1) : value;
        const absolute = path.join(process.cwd(), 'public', relative);
        const ext = path.extname(absolute).toLowerCase();
        if (!IMAGE_MIME[ext] || !fs.existsSync(absolute)) return '';
        return `data:${IMAGE_MIME[ext]};base64,${fs.readFileSync(absolute).toString('base64')}`;
    } catch {
        return '';
    }
}

const REMOTE_IMAGE_TIMEOUT_MS = 8000;

/** Hosts we fetch product photos from: our own Supabase storage only. */
function isTrustedImageUrl(value) {
    try {
        const url = new URL(value);
        const storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://invalid.local');
        return url.protocol === 'https:' && url.host === storage.host && url.pathname.startsWith('/storage/v1/object/public/');
    } catch {
        return false;
    }
}

/** Download a stored product photo and shrink it to a small JPEG data URL for the PDF. */
async function loadRemoteImageDataUrl(value) {
    if (!isTrustedImageUrl(value)) return '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS);
    try {
        const response = await fetch(value, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) return '';
        const sharp = (await import('sharp')).default;
        const jpeg = await sharp(Buffer.from(await response.arrayBuffer()))
            .resize(360, 360, { fit: 'inside', withoutEnlargement: true })
            .flatten({ background: '#ffffff' })
            .jpeg({ quality: 80 })
            .toBuffer();
        return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
    } catch {
        return '';
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Photo for each request line, keyed by item id. The picture comes from our own
 * catalogue (or the event's custom items), never from the image URL in the
 * request, which a client's browser supplies.
 */
async function resolveLineImages(event, lines) {
    const products = await getProducts().catch(() => []);
    const imageById = new Map(products.map((product) => [product.id, product.image]));
    for (const custom of Array.isArray(event?.customItems) ? event.customItems : []) {
        if (custom?.id && custom.image) imageById.set(custom.id, custom.image);
    }
    const entries = await Promise.all(lines.map(async (line) => {
        const source = imageById.get(line.id) || '';
        const dataUrl = /^https?:\/\//i.test(source) ? await loadRemoteImageDataUrl(source) : loadImageDataUrl(source);
        return [line.id, dataUrl];
    }));
    return new Map(entries);
}

function formatDate(value) {
    const date = value ? new Date(value) : new Date();
    const safe = Number.isNaN(date.getTime()) ? new Date() : date;
    return `${String(safe.getDate()).padStart(2, '0')}.${String(safe.getMonth() + 1).padStart(2, '0')}.${safe.getFullYear()}`;
}

function formatEventDates(event) {
    const fmt = (value) => {
        if (!value) return '';
        const date = new Date(`${value}T00:00:00`);
        return Number.isNaN(date.getTime()) ? value : formatDate(date);
    };
    const start = fmt(event?.startDate);
    const end = fmt(event?.endDate);
    // Plain ASCII separator: the PDF text sanitiser drops en/em dashes.
    if (start && end && start !== end) return `${start} to ${end}`;
    return start || end || '';
}

function describeLine(line) {
    const parts = [];
    if (line.source === 'custom') {
        parts.push(line.name);
    } else {
        const clean = extractCleanName(line.name);
        parts.push(clean === '--' ? line.name : clean);
        const specs = getProductSpecs({ name: line.name });
        const meta = [
            specs.idNo !== '—' ? `ID ${specs.idNo}` : '',
            specs.code !== '—' ? specs.code : '',
            specs.colour !== '—' ? specs.colour : '',
            specs.dimensions !== '—' ? specs.dimensions : '',
        ].filter(Boolean);
        if (meta.length) parts.push(meta.join(' · '));
    }
    if (line.comment) parts.push(`Client note: ${line.comment}`);
    return parts.join('  |  ');
}

/**
 * Map an event + request into the quotation document model.
 * `request` may be a stored request or an unsaved draft with the same shape.
 */
export function buildEventRequestDocument(event, request, imageById = null) {
    const days = Number(event?.days) || 1;
    const currencyCode = normalizeCurrencyCode(request?.currency || event?.currency);
    const totals = computeRequestTotals(request?.items || [], event);
    const contact = request?.contact || {};
    const eventDates = formatEventDates(event);

    const items = totals.lines.map((line) => ({
        description: describeLine(line),
        qty: line.quantity,
        unit: 'unit',
        costs_bhd: roundMoney(line.eventPrice),
        rate: 0,
        image: imageById ? (imageById.get(line.id) || '') : loadImageDataUrl(line.image),
    }));

    const contactLines = [
        contact.name ? `Attn: ${contact.name}` : '',
        contact.email || '',
        contact.phone || '',
    ].filter(Boolean);

    const notes = [
        `This request form lists the items requested for ${event?.name || 'the event'} and the indicative total for the full ${days}-day event. It is not an invoice.`,
        'Pico will confirm availability and issue the official quotation; prices marked as "on request" are confirmed in that quotation.',
    ];
    if (contact.notes) notes.push(`Client notes: ${contact.notes}`);

    return {
        company_profile: QUOTATION_COMPANY_PROFILE,
        document_title: 'EVENT REQUEST FORM',
        document_labels: {
            billTo: 'REQUESTED BY',
            date: 'Request Date',
            preparedBy: 'Contact Person',
            number: 'Request No.',
            ref: 'Stand / Location',
            scope: 'REQUESTED ITEMS',
        },
        document_number: request?.reference || 'DRAFT',
        date: formatDate(request?.createdAt),
        ref: contact.stand || '',
        client_org: request?.company || '—',
        client_to: contactLines.join('   '),
        client_location: [event?.venue, eventDates].filter(Boolean).join(' · '),
        client_trn: '',
        created_by: contact.name || '—',
        project_title: `${event?.name || 'Event'} - ${days}-day event${eventDates ? ` (${eventDates})` : ''}`,
        currency_code: currencyCode,
        vat_percent: totals.vatPercent,
        sections: [{
            name: `Rental items · price per unit for the ${days}-day event`,
            items,
            section_selling: totals.subtotal,
            selling_rule: 'none',
        }],
        total_selling: totals.subtotal,
        total_with_vat: totals.total,
        extra_blocks: [{ title: 'Notes', items: notes }],
        exclusions: [],
        terms: [],
        payment_terms: event?.paymentTerms ? [event.paymentTerms] : [],
    };
}

export async function generateEventRequestPdf(event, request) {
    const imageById = await resolveLineImages(event, request?.items || []);
    const document = buildEventRequestDocument(event, request, imageById);
    return generateQuotationPdf(document, 'customer', null);
}

export function eventRequestPdfFilename(event, request) {
    const reference = String(request?.reference || '').trim();
    // Stored references already carry the event prefix (RBC26-260916-XXXX); drafts get it added.
    const base = reference && reference !== 'DRAFT'
        ? `Pico-Request-${reference}`
        : `Pico-Request-${event?.referencePrefix || 'Event'}-Draft`;
    return `${base.replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`;
}
