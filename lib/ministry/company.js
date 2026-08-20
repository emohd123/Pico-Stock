export const COMPANY = {
    name: 'Pico International (Bahrain) W.L.L.',
    addressLines: [
        '11, Building 1144, Road 4617',
        'Block 346, Manama / Seafront',
        'P.O. Box 13990, Muharraq',
        'Kingdom of Bahrain',
    ],
    email: 'info@picobahrain.com',
    tel: '(973) 7707 7777',
    fax: '(973) 1311 6090',
    web: 'www.pico.com',
    vat: '200012210700002',
    refPrefix: 'Q',
    refDept: 'EM',
    signatory: { name: 'Ebrahim Mohd', title: 'Project Executive' },
    brand: { primary: '#00C7B1', primaryDark: '#00857A', ink: '#4D4D4F', gray: '#75787B', lightGray: '#EAECEC' },
};

export const EXCLUSIONS = [
    'Permit and approvals for organising the event including any fees payable to government authorities where applicable.',
    'Any fees payable for venue rental.',
    'Approvals and permissions from the venue for all event temporary installations/structures, technical visits and use of the venue & facilities (storage, car park, toilets etc.) for the duration of installation, event and dismantling.',
    'Pre & Post-Event Working Power. Client to provide electrical power supply (380V, 3-phase; 24-hrs) on site for setup, operation and dismantling works.',
    'Personnel and vehicle access passes for all Pico personnel & designated sub-contractors during the event.',
    'All risk public liability and event cancellation insurance including insurance for all materials and equipment on site.',
    'Photography & Videography.',
    'Any building or site infrastructure refurbishment or reinstatement works required.',
    'Any scope not mentioned above.',
];

export const TERMS = 'As per terms of tender with Ministry of Finance & National Economy.';

// The schedule printed on the quotations PICO issues today (see
// Q/08/2026/EM/11988 Rev 2). Generated quotations print the same three lines so
// a portal quotation and a hand-issued one carry identical terms.
export const PAYMENT_TERMS = [
    'Purchase Order (PO) and Signed quotation for order confirmation.',
    '70% down payment on order confirmation, OR at least 60 days prior to event whichever is earlier.',
    '30% balance payment and any Variation Orders within 7 days of event completion.',
];

export const APPROVAL_NOTICE =
    'The Client must obtain Ministry of Finance & National Economy approval for any scope changes, additions, or amendments before implementation.';
