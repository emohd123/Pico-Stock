/**
 * Brain Connector — Portfolio & Company Capabilities
 *
 * Hard-coded knowledge about Pico Bahrain's identity, past clients, key
 * projects, and service capabilities.  This data is sourced directly from
 * the company profile page and approved marketing material; it does not
 * require an external API call.
 *
 * Update this file whenever new reference clients or projects are confirmed.
 */

// ---------------------------------------------------------------------------
// Static knowledge base
// ---------------------------------------------------------------------------

/** Core company facts */
const COMPANY_FACTS = {
    name:        'Pico Bahrain',
    parent:      'Pico (global)',
    location:    'Bahrain',
    website:     'https://pico.com/en',
    contact: {
        phone:     '+973 3635 7377',
        email:     'ebrahim@picobahrain.com',
        instagram: '@picobahrain',
    },
    tagline: 'Exhibition stand design, interior fit-out, events & branding in Bahrain.',
    description:
        'Pico Bahrain is the local Bahrain arm of Pico Global — an internationally ' +
        'recognised brand environment company. Pico Bahrain provides locally coordinated ' +
        'exhibition stand design, interior fit-out, event environments, graphics & signage, ' +
        'AV & digital display support, and booth furniture rental.',
};

/** Services Pico Bahrain offers */
const SERVICES = [
    {
        name:        'Exhibition Stands',
        description: 'Design-led exhibition stands and branded booth environments for trade shows and business events.',
        portfolioUrl: 'https://u.pcloud.link/publink/show?code=XZHFte5Zk0MLSfIJLGLAW8fqj1l8juMDH4s7',
    },
    {
        name:        'Interior Design & Fit-Out',
        description: 'Interior solutions for branded spaces, receptions, lounges, and functional commercial environments.',
        portfolioUrl: 'https://u.pcloud.link/publink/show?code=XZLCzq5ZuOJCabuPOMLh0WtIdgPaukB0sI5y',
    },
    {
        name:        'Events & Activations',
        description: 'Integrated event environments covering visitor flow, hospitality, feature areas, and live brand experiences.',
        portfolioUrl: 'https://u.pcloud.link/publink/show?code=XZOwzq5ZCX8ABOA4HHRp92vxfuoa80RX7bRV',
    },
    {
        name:        'Graphics & Signage',
        description: 'Visual communication: booth graphics, branded surfaces, directional messaging, and presentation signage.',
    },
    {
        name:        'Audio Visual (AV) & Digital Display',
        description: 'Screen-based and presentation-focused support for digital content, display moments, and high-visibility touchpoints.',
    },
    {
        name:        'Booth Furniture & Rental',
        description: 'Flexible furniture and booth extras rental to complete exhibition spaces quickly and consistently.',
    },
];

/** Key past clients and projects — add new entries here as they are completed */
const PORTFOLIO_ENTRIES = [
    {
        client:   'BLINK',
        type:     'interior fit-out',
        service:  'Interior Design & Fit-Out',
        notes:    'Interior fit-out project delivered for BLINK in Bahrain.',
        tags:     ['interior', 'fit-out', 'retail'],
    },
    {
        client:   'THEATRO',
        type:     'interior',
        service:  'Interior Design & Fit-Out',
        notes:    'Interior design and fit-out for THEATRO.',
        tags:     ['interior', 'hospitality'],
    },
    {
        client:   'Arab League Summit',
        type:     'events',
        service:  'Events & Activations',
        notes:    'Event environment and production support for the Arab League Summit.',
        tags:     ['events', 'government', 'summit', 'arab league'],
    },
    {
        client:   'GCC Heads of State',
        type:     'events',
        service:  'Events & Activations',
        notes:    'High-protocol event environment delivered for the GCC Heads of State gathering.',
        tags:     ['events', 'government', 'gcc', 'heads of state', 'protocol'],
    },
    {
        client:   'Routes World',
        type:     'events',
        service:  'Events & Activations',
        notes:    'Exhibition and event environment support for Routes World aviation conference.',
        tags:     ['events', 'aviation', 'exhibition', 'conference'],
    },
    {
        client:   'City Scape 2023',
        type:     'exhibition stands',
        service:  'Exhibition Stands',
        notes:    'Exhibition stand design and build for City Scape 2023 real-estate event.',
        tags:     ['exhibition', 'stands', 'real estate', 'cityscape', '2023'],
    },
    {
        client:   'Future Energy Asia Bangkok',
        type:     'exhibition stands',
        service:  'Exhibition Stands',
        notes:    'Exhibition stand built for Future Energy Asia in Bangkok — international delivery.',
        tags:     ['exhibition', 'stands', 'energy', 'asia', 'bangkok', 'international'],
    },
];

/** Why-work-with-us value propositions */
const VALUE_POINTS = [
    'Local Bahrain coordination with a delivery mindset built around event-ready execution.',
    'Integrated support across space design, rental requirements, graphics, and presentation finishes.',
    'A practical design-to-delivery approach that reduces handoffs from concept to setup.',
    'Flexible capability for exhibitions, event environments, interiors, and booth requirements.',
    'Part of the globally recognised Pico brand with international delivery experience.',
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Score a portfolio entry against a query string.
 * @param {Object} entry
 * @param {string} queryLower — lowercased query
 * @returns {number}
 */
function scoreEntry(entry, queryLower) {
    let score = 0;

    if (entry.client.toLowerCase().includes(queryLower))  score += 10;
    if (entry.type.toLowerCase().includes(queryLower))    score += 6;
    if (entry.service.toLowerCase().includes(queryLower)) score += 5;
    if (entry.notes.toLowerCase().includes(queryLower))   score += 3;

    for (const tag of entry.tags) {
        if (tag.includes(queryLower) || queryLower.includes(tag)) score += 4;
    }

    // Split query into tokens for partial matching
    const tokens = queryLower.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
        if (entry.client.toLowerCase().includes(token))  score += 3;
        if (entry.service.toLowerCase().includes(token)) score += 2;
        for (const tag of entry.tags) {
            if (tag.includes(token)) score += 2;
        }
    }

    return score;
}

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

/**
 * searchPortfolio — returns relevant portfolio entries based on the query.
 *
 * @param {string} query — free-text search (client name, service type, event, etc.)
 * @param {number} [limit=5]
 * @returns {{ entry: Object, score: number }[]}
 */
export function searchPortfolio(query, limit = 5) {
    if (!query || typeof query !== 'string') return PORTFOLIO_ENTRIES.map(e => ({ entry: e, score: 1 }));

    const queryLower = query.toLowerCase();

    return PORTFOLIO_ENTRIES
        .map(entry => ({ entry, score: scoreEntry(entry, queryLower) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

/**
 * getPortfolioContext — returns a formatted text block about Pico Bahrain's
 * portfolio, capabilities, and key facts, suitable for an AI system prompt.
 *
 * When a query is provided, the most relevant portfolio entries are surfaced
 * first; otherwise a general company overview is returned.
 *
 * @param {string} [query] — optional free-text query to focus the context
 * @returns {string}
 */
export function getPortfolioContext(query) {
    const lines = [];

    // Company overview
    lines.push(`Company: ${COMPANY_FACTS.name} (part of ${COMPANY_FACTS.parent})`);
    lines.push(`Location: ${COMPANY_FACTS.location}`);
    lines.push(`Description: ${COMPANY_FACTS.description}`);
    lines.push('');

    // Services
    lines.push('Services offered by Pico Bahrain:');
    for (const svc of SERVICES) {
        lines.push(`• ${svc.name}: ${svc.description}`);
    }
    lines.push('');

    // Portfolio — if query given, show relevant matches; otherwise show all
    const entries = query
        ? searchPortfolio(query, 5).map(r => r.entry)
        : PORTFOLIO_ENTRIES;

    if (entries.length > 0) {
        lines.push(query ? `Relevant past projects for "${query}":` : 'Past projects & key clients:');
        for (const e of entries) {
            lines.push(`• ${e.client} — ${e.type} (${e.service}): ${e.notes}`);
        }
        lines.push('');
    }

    // Value points
    lines.push('Why clients choose Pico Bahrain:');
    for (const pt of VALUE_POINTS) {
        lines.push(`• ${pt}`);
    }

    return lines.join('\n');
}
