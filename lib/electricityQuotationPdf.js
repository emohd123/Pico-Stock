/**
 * Quotation PDF for an additional electricity order, in the Pico quotation
 * layout (reuses the quotation PDF engine). Shows the late surcharge and any
 * agreed discount as their own lines before VAT.
 */

import { generateQuotationPdf } from '@/lib/quotationExport';
import { QUOTATION_COMPANY_PROFILE, normalizeCurrencyCode } from '@/lib/quotationCommercial';
import { bankDetailLines } from '@/lib/eventPayments';
import { roundMoney } from '@/lib/eventMarketplacePricing';

function formatDate(value) {
    const date = value ? new Date(value) : new Date();
    const safe = Number.isNaN(date.getTime()) ? new Date() : date;
    return `${String(safe.getDate()).padStart(2, '0')}.${String(safe.getMonth() + 1).padStart(2, '0')}.${safe.getFullYear()}`;
}

export function buildElectricityQuotation(form, order, options = {}) {
    const currencyCode = normalizeCurrencyCode(order.currency || form.currency);
    const v = order.vendor || {};
    const money = (value) => `${currencyCode} ${roundMoney(value).toFixed(3)}`;
    const gross = roundMoney(order.subtotal + (order.surcharge?.amount || 0));
    const net = roundMoney(gross - (order.discount?.amount || 0));

    const sections = [{
        name: 'Additional electricity · supply up to one connection point',
        items: order.items.map((item) => ({ description: item.name, qty: item.quantity, unit: 'nos', costs_bhd: item.price, rate: 0, image: '' })),
        section_selling: order.subtotal,
        selling_rule: 'none',
    }];
    if (order.surcharge) {
        sections.push({
            name: order.surcharge.label,
            items: [{
                description: `${order.surcharge.label} (+${order.surcharge.percent}% of ${money(order.subtotal)})`,
                qty: 1, unit: 'lot', costs_bhd: order.surcharge.amount, rate: 0, image: '',
            }],
            section_selling: order.surcharge.amount,
            selling_rule: 'none',
        });
    }

    const notes = [
        `Quotation for the additional electricity ordered by ${v.company || 'the vendor'} for ${form.eventName || 'the event'}${form.venue ? `, ${form.venue}` : ''}.`,
        'Supply only: Pico provides the electrical supply up to a single connection point at your booth, truck or stand. Connecting, wiring, testing and operating your equipment is not included.',
    ];
    if (order.discount) {
        notes.push(`A ${order.discount.percent}% discount of ${money(order.discount.amount)} is applied${order.discount.note ? ` ${order.discount.note}` : ''}. VAT is charged on the amount after the discount.`);
    }
    notes.push(`Total to pay: ${money(order.total)}${order.vat ? ` including VAT ${order.vat.percent}%` : ''}. Please transfer it to the bank account below, quoting ${order.reference}, and send us the transfer receipt.`);
    if (options.orderUrl) notes.push(`Your order page (to upload the receipt): ${options.orderUrl}`);

    return {
        company_profile: QUOTATION_COMPANY_PROFILE,
        document_title: 'QUOTATION',
        document_labels: {
            billTo: 'QUOTATION TO',
            date: 'Date',
            preparedBy: 'Contact Person',
            number: 'Order No.',
            ref: 'Booth / Location',
            scope: 'ADDITIONAL ELECTRICITY',
        },
        document_number: order.reference,
        date: formatDate(options.date),
        ref: v.booth || '',
        client_org: v.company || '—',
        client_to: [v.contactPerson ? `Attn: ${v.contactPerson}` : '', v.email, v.mobile || v.tel].filter(Boolean).join('   '),
        client_location: [form.venue, form.eventDates].filter(Boolean).join(' · '),
        client_trn: '',
        created_by: v.contactPerson || '—',
        project_title: `${form.eventName || 'Event'} - Additional electricity`,
        currency_code: currencyCode,
        vat_percent: order.vat?.percent || 0,
        sections,
        discount: order.discount ? { gross, amount: order.discount.amount, label: `Discount (${order.discount.percent}%)` } : null,
        total_selling: net,
        total_with_vat: order.total,
        extra_blocks: [
            { title: 'Notes', items: notes },
            { title: 'Bank transfer details', items: bankDetailLines(order.reference) },
        ],
        exclusions: [],
        terms: [],
        payment_terms: [],
    };
}

export function generateElectricityQuotationPdf(form, order, options = {}) {
    return generateQuotationPdf(buildElectricityQuotation(form, order, options), 'customer', null);
}

export function electricityQuotationFilename(order) {
    return `Pico-Quotation-${String(order?.reference || 'Electricity').replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`;
}
