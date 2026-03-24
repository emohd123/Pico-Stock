export function numberToWords(value) {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    function say(n) {
        if (n === 0) return '';
        if (n < 20) return ones[n];
        if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`.trim();
        return `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${say(n % 100)}` : ''}`.trim();
    }
    const dinars = Math.floor(Number(value) || 0);
    const fils = Math.round(((Number(value) || 0) - dinars) * 1000);
    let phrase = dinars >= 1000 ? `${say(Math.floor(dinars / 1000))} Thousand ` : '';
    phrase += say(dinars % 1000);
    phrase = phrase.trim() || 'Zero';
    if (fils > 0) phrase += ` and ${say(fils)} Fils`;
    return `Bahraini Dinars ${phrase} Only`;
}

export const SELLING_RULE_OPTIONS = [
    { value: '0.70', label: '0.70', description: 'Selling = subtotal / 0.70' },
    { value: '0.75', label: '0.75', description: 'Selling = subtotal / 0.75' },
    { value: 'none', label: 'None', description: 'Selling = subtotal' },
];

export const QUOTATION_COMPANY_PROFILE = {
    logoPath: '/branding/pico-logo.png',
    legalName: 'Pico International (Bahrain) W.L.L.',
    addressLines: [
        '11, Building 1144, Road 4617',
        'Block 346, Manama / Seafront',
        'P.O. Box 13990, Muharraq',
        'Kingdom of Bahrain',
    ],
    contactLines: [
        'info@picobahrain.com',
        'Tel: (973) 7707 7777',
        'Fax: (973) 1311 6090',
        'www.pico.com',
    ],
    vatNumber: 'VAT: 200012210700002',
};

export function normalizeSellingRule(value) {
    return SELLING_RULE_OPTIONS.some((rule) => rule.value === value) ? value : '0.70';
}

export function computeSellingFromInternal(internalSubtotal, sellingRule) {
    const total = Number(internalSubtotal || 0);
    const normalizedRule = normalizeSellingRule(sellingRule);

    if (normalizedRule === 'none') {
        return total;
    }

    return total > 0 ? total / Number(normalizedRule) : 0;
}

export function getSectionCommercialSummary(section = {}) {
    const items = Array.isArray(section.items) ? section.items : [];
    const internalSubtotal = items.reduce((sum, item) => {
        const qty = Number(item?.qty || 0);
        const rate = Number(item?.rate || 0);
        return sum + (qty * rate);
    }, 0);
    const clientLineTotal = items.reduce((sum, item) => sum + Number(item?.costs_bhd || 0), 0);
    const sellingRule = normalizeSellingRule(section.selling_rule);
    const suggestedSelling = internalSubtotal > 0 ? computeSellingFromInternal(internalSubtotal, sellingRule) : clientLineTotal;
    const sectionSelling = Number(section.section_selling || 0);

    return {
        internalSubtotal,
        clientLineTotal,
        sellingRule,
        suggestedSelling,
        customerTotal: sectionSelling > 0 ? sectionSelling : suggestedSelling,
    };
}

export function defaultExclusions() {
    return [
        'Permit and approvals for the organizing the event including any fees payable to government authorities where applicable.',
        'Approvals and permissions from the venue for all temporary installations / structures, technical visits, and use of venue facilities for installation, event, and dismantling.',
        'Pre-event and post-event working power supply on site for setup, operation, and dismantling works.',
        'Main power supply and associated costs.',
        'Security coverage for personnel and equipment from start of installation to completion of dismantling.',
        'Cleaning, waste disposal, and maintenance during the event period.',
        'Event food and beverage service.',
        'Personnel and vehicle access passes for Pico personnel and designated subcontractors.',
        'All risk public liability and event cancellation insurance, including materials and equipment on site.',
        'Content for screens and tablets.',
        'Any cost payable to the venue.',
        'Project model transportation and installation.',
        'Any scope of works not mentioned above.',
    ];
}

export function defaultTerms() {
    return [
        'Validity: 10 days from the quotation date; subject to re-validation thereafter.',
        'Order must be confirmed by contract at least 21 days prior to the event date.',
        'Client to arrange venue, authorizations, utilities, and applicable fees for the duration of installation, event, and dismantling.',
        'All audiovisual and other show equipment and structures are supplied on rental basis for the stated show duration only. Any extension is chargeable.',
        'Rental items are subject to ex-stock availability at time of order confirmation. Pico may substitute equivalent stock where necessary.',
        'Client to provide safe access, storage, and working conditions on site.',
        'Any additional work or variation requested after confirmation will be charged separately.',
        'Postponement or cancellation after confirmation may incur applicable cancellation or rescheduling charges.',
        'Pico is not liable for damage caused by misuse, vandalism, or force majeure.',
        'Quoted scope takes precedence over drawings in the event of discrepancies.',
    ];
}

export function defaultPaymentTerms() {
    return [
        'Purchase Order and signed quotation are required for order confirmation.',
        '70% payment on order confirmation.',
        '30% payment within 30 days from invoice date.',
    ];
}

export function defaultCommercialLists() {
    return {
        exclusions: defaultExclusions(),
        terms: defaultTerms(),
        payment_terms: defaultPaymentTerms(),
    };
}
