/**
 * Brain — Context Builder
 *
 * Orchestrates all brain connectors and data sources into a single, unified
 * system prompt ready for use with the OpenAI Chat Completions API.
 *
 * Calling buildContext() triggers parallel lookups across:
 *   - Product catalogue       (lib/brain/connectors/products.js)
 *   - Portfolio & capabilities (lib/brain/connectors/portfolio.js)
 *   - Zoho Books CRM          (lib/brain/connectors/zoho.js)
 *   - OSFam stock system      (lib/brain/connectors/osfam.js)
 *   - Knowledge graph          (lib/brain/knowledgeGraph.js)
 *
 * File summaries and extracted text are passed in directly from the caller
 * (typically the pCloud intelligence layer which already holds ranked results).
 */

import { getProductContext }   from './connectors/products';
import { getPortfolioContext }  from './connectors/portfolio';
import { getZohoContext }       from './connectors/zoho';
import { getOsfamContext }      from './connectors/osfam';
import { getEntityContext }     from './knowledgeGraph';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Rough chars-per-token estimate used for token budgeting */
const CHARS_PER_TOKEN = 4;

/** Maximum characters to include per file summary in the prompt */
const MAX_CHARS_PER_FILE = 1200;

/** Maximum number of file results to embed in the prompt */
const MAX_FILE_RESULTS = 6;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Format a date as a readable string for the system prompt.
 * @returns {string}  e.g. "Sunday, 15 March 2026"
 */
function formatDate() {
    return new Date().toLocaleDateString('en-GB', {
        weekday: 'long',
        day:     'numeric',
        month:   'long',
        year:    'numeric',
    });
}

/**
 * Truncate a string to a maximum character length, appending an ellipsis
 * if the string was trimmed.
 * @param {string} text
 * @param {number} maxChars
 * @returns {string}
 */
function truncate(text, maxChars) {
    if (!text || text.length <= maxChars) return text || '';
    return text.slice(0, maxChars).trimEnd() + ' …';
}

/**
 * Build the "=== RELEVANT FILES ===" section from an array of file result
 * objects.  Each object may contain any of: name, path, summary, snippet,
 * file_type, created_at.
 *
 * @param {Object[]} fileResults
 * @returns {string}
 */
function buildFilesSection(fileResults) {
    if (!Array.isArray(fileResults) || fileResults.length === 0) {
        return 'No file results were found for this query.';
    }

    const topFiles = fileResults.slice(0, MAX_FILE_RESULTS);
    const lines = [];

    for (let i = 0; i < topFiles.length; i++) {
        const f = topFiles[i];
        const label   = f.name || f.path || `File ${i + 1}`;
        const type    = f.file_type ? ` [${f.file_type.toUpperCase()}]` : '';
        const date    = f.created_at ? ` — ${new Date(f.created_at).toLocaleDateString('en-GB')}` : '';
        const summary = truncate(f.summary || f.snippet || '', MAX_CHARS_PER_FILE);

        lines.push(`${i + 1}. ${label}${type}${date}`);
        if (f.path && f.path !== label) lines.push(`   Path: ${f.path}`);
        if (summary) lines.push(`   ${summary}`);
        lines.push('');
    }

    if (fileResults.length > MAX_FILE_RESULTS) {
        lines.push(`(${fileResults.length - MAX_FILE_RESULTS} additional results not shown.)`);
    }

    return lines.join('\n').trimEnd();
}

/**
 * Estimate token count from a string.
 * @param {string} str
 * @returns {number}
 */
function estimateTokens(str) {
    return Math.ceil((str || '').length / CHARS_PER_TOKEN);
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

/**
 * buildContext — fetches context from all connectors in parallel and assembles
 * a unified system prompt for the PICO BRAIN AI assistant.
 *
 * @param {string}   query       — the user's question or search query
 * @param {Object[]} fileResults — ranked file search results from pCloud/Supabase
 * @param {string}   [userId]    — optional user ID (reserved for future personalisation)
 *
 * @returns {Promise<{
 *   systemPrompt: string,
 *   sources: { type: string, label: string }[],
 *   tokensUsed: number
 * }>}
 */
export async function buildContext(query, fileResults = [], userId = null) {
    const today = formatDate();

    // ---------------------------------------------------------------------------
    // Fetch all context sources in parallel — failures are caught individually
    // ---------------------------------------------------------------------------

    const [
        productContext,
        portfolioContext,
        zohoContext,
        osfamContext,
        entityContext,
    ] = await Promise.all([
        // Products — synchronous but wrapped for uniform error handling
        Promise.resolve(getProductContext(query)).catch(err => {
            console.error('[brain/context] products error:', err.message);
            return 'Product catalogue unavailable.';
        }),

        // Portfolio — synchronous
        Promise.resolve(getPortfolioContext(query)).catch(err => {
            console.error('[brain/context] portfolio error:', err.message);
            return 'Portfolio data unavailable.';
        }),

        // Zoho Books — async, may fail if not configured
        getZohoContext(query).catch(err => {
            console.error('[brain/context] zoho error:', err.message);
            return 'Zoho Books data unavailable.';
        }),

        // OSFam — async, may fail if not configured
        getOsfamContext(query).catch(err => {
            console.error('[brain/context] osfam error:', err.message);
            return 'OSFam stock data unavailable.';
        }),

        // Knowledge graph entity context
        getEntityContext(query).catch(err => {
            console.error('[brain/context] entities error:', err.message);
            return 'Knowledge graph unavailable.';
        }),
    ]);

    // Build the files section synchronously (data already in memory)
    const filesContext = buildFilesSection(fileResults);

    // ---------------------------------------------------------------------------
    // Assemble system prompt
    // ---------------------------------------------------------------------------

    const systemPrompt = `You are PICO BRAIN — the intelligent knowledge assistant for Pico Bahrain, a leading exhibition stand design, interior fit-out, events, and branding company in Bahrain.

You have access to Pico's internal files, product catalogue, portfolio, client history, and live stock data.

Answer questions accurately based on the provided context. Be concise and professional.
If you reference a file, mention its name. If you don't have enough information, say so clearly.
Today's date is ${today}.

=== PRODUCT CATALOGUE ===
${productContext}

=== PORTFOLIO & CAPABILITIES ===
${portfolioContext}

=== RELEVANT FILES ===
${filesContext}

=== CLIENT / FINANCIAL DATA ===
${zohoContext}

=== STOCK DATA ===
${osfamContext}

=== KNOWLEDGE GRAPH ===
${entityContext}`;

    // ---------------------------------------------------------------------------
    // Build sources list for citation in the UI
    // ---------------------------------------------------------------------------

    const sources = [];

    // File sources
    if (Array.isArray(fileResults) && fileResults.length > 0) {
        for (const f of fileResults.slice(0, MAX_FILE_RESULTS)) {
            sources.push({
                type:  'file',
                label: f.name || f.path || 'Unknown file',
                path:  f.path || null,
                id:    f.id   || null,
            });
        }
    }

    // Connector sources (only include when they provided meaningful content)
    if (productContext && !productContext.includes('No products closely matched')) {
        sources.push({ type: 'catalogue', label: 'Product Catalogue' });
    }

    if (portfolioContext) {
        sources.push({ type: 'portfolio', label: 'Pico Bahrain Portfolio' });
    }

    if (zohoContext && !zohoContext.includes('not configured') && !zohoContext.includes('No Zoho')) {
        sources.push({ type: 'zoho', label: 'Zoho Books CRM' });
    }

    if (osfamContext && !osfamContext.includes('not configured') && !osfamContext.includes('No OSFam')) {
        sources.push({ type: 'osfam', label: 'OSFam Stock System' });
    }

    if (entityContext && !entityContext.includes('No entities found') && !entityContext.includes('unavailable')) {
        sources.push({ type: 'knowledge_graph', label: 'Knowledge Graph' });
    }

    // ---------------------------------------------------------------------------
    // Return assembled context
    // ---------------------------------------------------------------------------

    return {
        systemPrompt,
        sources,
        tokensUsed: estimateTokens(systemPrompt),
    };
}
