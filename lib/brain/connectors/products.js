/**
 * Brain Connector — Products Catalogue
 *
 * Provides fuzzy search and context generation over data/products.json.
 * All functions are synchronous (no I/O after the initial require) so they
 * can safely be called inside API route handlers without extra async overhead.
 */

import productsData from '@/data/products.json';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Tokenise a string into lowercase words for matching.
 * @param {string} str
 * @returns {string[]}
 */
function tokenise(str) {
    return String(str || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s*]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
}

/**
 * Extract a colour token from a product name or description.
 * Looks for common colour words; returns null if none found.
 * @param {string} text
 * @returns {string|null}
 */
const COLOUR_WORDS = [
    'black', 'white', 'red', 'blue', 'green', 'orange', 'yellow',
    'grey', 'gray', 'brown', 'beige', 'silver', 'gold', 'pink',
    'purple', 'navy', 'teal', 'chrome', 'transparent', 'clear',
];

function extractColour(text) {
    const lower = text.toLowerCase();
    return COLOUR_WORDS.find(c => lower.includes(c)) || null;
}

/**
 * Compute a relevance score for a product given a set of query tokens.
 * Returns a number; higher = more relevant.
 *
 * Scoring strategy:
 *  - Exact substring match on name → +10
 *  - Each query token found in name → +5
 *  - Each query token found in description → +3
 *  - Each query token found in category → +4
 *  - Product code (alphanumeric segment in name) exact match → +8
 *  - Colour match → +6
 *
 * @param {Object} product
 * @param {string[]} queryTokens
 * @param {string} rawQuery
 * @returns {number}
 */
function scoreProduct(product, queryTokens, rawQuery) {
    const nameLower = (product.name || '').toLowerCase();
    const descLower = (product.description || '').toLowerCase();
    const catLower  = (product.category || '').toLowerCase();
    const rawLower  = rawQuery.toLowerCase();

    let score = 0;

    // Full substring match on name
    if (nameLower.includes(rawLower)) score += 10;

    for (const token of queryTokens) {
        if (nameLower.includes(token)) score += 5;
        if (descLower.includes(token)) score += 3;
        if (catLower.includes(token))  score += 4;
    }

    // Product code match — codes look like "FVCHBLU1", "ID 1530", etc.
    const codeSegments = nameLower.match(/[a-z][a-z0-9]{2,}/g) || [];
    for (const token of queryTokens) {
        if (codeSegments.includes(token)) score += 8;
    }

    // Colour match
    const productColour = extractColour(nameLower + ' ' + descLower);
    const queryColour   = extractColour(rawLower);
    if (productColour && queryColour && productColour === queryColour) score += 6;

    return score;
}

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

/**
 * getAllProducts — returns every product from the catalogue with full details.
 * @returns {Object[]}
 */
export function getAllProducts() {
    return productsData;
}

/**
 * searchProducts — fuzzy-search the products catalogue.
 *
 * Matches on product name, product code, colour, category, and description.
 * Returns products sorted by relevance score (descending), filtered to those
 * with a score > 0.
 *
 * @param {string} query — free-text search query
 * @param {number} [limit=10] — maximum number of results to return
 * @returns {{ product: Object, score: number }[]}
 */
export function searchProducts(query, limit = 10) {
    if (!query || typeof query !== 'string') return [];

    const tokens = tokenise(query);
    if (tokens.length === 0) return [];

    const scored = productsData
        .map(product => ({
            product,
            score: scoreProduct(product, tokens, query),
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score);

    return scored.slice(0, limit);
}

/**
 * getProductContext — returns a formatted text block describing products that
 * match the query, suitable for inclusion in an AI system prompt.
 *
 * @param {string} query
 * @param {number} [limit=8] — maximum number of products to include
 * @returns {string}
 */
export function getProductContext(query, limit = 8) {
    const results = searchProducts(query, limit);

    if (results.length === 0) {
        // Fall back: if no matches, return a brief catalogue summary
        const total     = productsData.length;
        const inStock   = productsData.filter(p => p.inStock).length;
        const categories = [...new Set(productsData.map(p => p.category).filter(Boolean))];
        return (
            `Pico Bahrain product catalogue contains ${total} items ` +
            `(${inStock} currently in stock) across categories: ${categories.join(', ')}. ` +
            `No products closely matched the query "${query}".`
        );
    }

    const lines = [
        `Found ${results.length} matching product(s) for "${query}":`,
        '',
    ];

    for (const { product, score } of results) {
        const stockInfo = product.inStock
            ? `In stock (${product.stock ?? 'qty unknown'} units)`
            : 'Out of stock';
        lines.push(
            `• ${product.name}` +
            `\n  Category: ${product.category || 'N/A'}` +
            `\n  Price: ${product.price} ${product.currency || 'BHD'}/day` +
            `\n  Stock: ${stockInfo}` +
            (product.description ? `\n  Details: ${product.description}` : '') +
            `\n  ID: ${product.id}` +
            `\n  Relevance score: ${score}`
        );
    }

    return lines.join('\n');
}
