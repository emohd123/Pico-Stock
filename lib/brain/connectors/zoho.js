/**
 * Brain Connector — Zoho Books
 *
 * Provides read-only access to Zoho Books for client lookups and recent
 * invoices.  Builds on the same OAuth flow used in lib/zoho.js (estimates),
 * but exposes context-generation helpers for the AI brain layer.
 *
 * Required env vars:
 *   ZOHO_BOOKS_ORG_ID
 *   ZOHO_CLIENT_ID
 *   ZOHO_CLIENT_SECRET
 *   ZOHO_REFRESH_TOKEN
 */

const ZOHO_TOKEN_URL = 'https://accounts.zoho.com/oauth/v2/token';
const ZOHO_API_BASE  = 'https://www.zohoapis.com/books/v3';

const ORG_ID        = process.env.ZOHO_BOOKS_ORG_ID;
const CLIENT_ID     = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;

/** True when all required env vars are present */
const ZOHO_CONFIGURED = !!(ORG_ID && CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

/**
 * getZohoAccessToken — exchanges the stored refresh token for a fresh access
 * token (Zoho access tokens expire after 1 hour).
 *
 * @returns {Promise<string>} access token
 * @throws {Error} when credentials are missing or the request fails
 */
export async function getZohoAccessToken() {
    if (!ZOHO_CONFIGURED) {
        throw new Error(
            'Zoho credentials not configured. ' +
            'Set ZOHO_BOOKS_ORG_ID, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN.'
        );
    }

    const url = new URL(ZOHO_TOKEN_URL);
    url.searchParams.set('refresh_token', REFRESH_TOKEN);
    url.searchParams.set('client_id',     CLIENT_ID);
    url.searchParams.set('client_secret', CLIENT_SECRET);
    url.searchParams.set('grant_type',    'refresh_token');

    const res = await fetch(url.toString(), { method: 'POST' });
    const data = await res.json();

    if (!data.access_token) {
        throw new Error(`Zoho token refresh failed: ${JSON.stringify(data)}`);
    }

    return data.access_token;
}

// ---------------------------------------------------------------------------
// Internal GET helper
// ---------------------------------------------------------------------------

/**
 * Perform an authenticated GET request against the Zoho Books v3 API.
 * @param {string} path — e.g. "/contacts"
 * @param {string} token — valid access token
 * @param {Record<string, string>} [params] — additional query params
 * @returns {Promise<Object>} parsed JSON body
 */
async function zohoGet(path, token, params = {}) {
    const url = new URL(`${ZOHO_API_BASE}${path}`);
    url.searchParams.set('organization_id', ORG_ID);
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
    }

    const res = await fetch(url.toString(), {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });

    if (!res.ok) {
        throw new Error(`Zoho GET ${path} failed with HTTP ${res.status}`);
    }

    return res.json();
}

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

/**
 * searchZohoClients — searches Zoho Books contacts/customers whose name
 * contains the given query string.
 *
 * @param {string} query — client name or partial name
 * @returns {Promise<Object[]>} array of Zoho contact objects
 */
export async function searchZohoClients(query) {
    if (!ZOHO_CONFIGURED) return [];

    try {
        const token = await getZohoAccessToken();
        const data  = await zohoGet('/contacts', token, {
            contact_type:    'customer',
            contact_name_startswith: '',   // Zoho supports this filter for prefix
            search_text:     query,        // broader full-text search
        });
        return data.contacts || [];
    } catch (err) {
        console.error('[brain/zoho] searchZohoClients error:', err.message);
        return [];
    }
}

/**
 * getRecentInvoices — retrieves the most recent invoices associated with a
 * client name.  Finds the contact first, then queries invoices filtered by
 * that customer_id.
 *
 * @param {string} clientName
 * @param {number} [limit=10]
 * @returns {Promise<Object[]>} array of Zoho invoice objects
 */
export async function getRecentInvoices(clientName, limit = 10) {
    if (!ZOHO_CONFIGURED) return [];

    try {
        const token = await getZohoAccessToken();

        // Find the contact
        const contactData = await zohoGet('/contacts', token, {
            contact_type: 'customer',
            search_text:  clientName,
        });
        const contacts = contactData.contacts || [];
        if (contacts.length === 0) return [];

        // Use the best-matching contact (first result)
        const contact = contacts[0];

        // Fetch invoices for that customer, newest first
        const invoiceData = await zohoGet('/invoices', token, {
            customer_id: contact.contact_id,
            sort_column: 'date',
            sort_order:  'D',            // descending
            per_page:    String(limit),
        });

        return invoiceData.invoices || [];
    } catch (err) {
        console.error('[brain/zoho] getRecentInvoices error:', err.message);
        return [];
    }
}

/**
 * getZohoContext — builds a formatted text block about clients and invoices
 * matching the query, for inclusion in an AI system prompt.
 *
 * @param {string} query — client name or topic to search for
 * @returns {Promise<string>}
 */
export async function getZohoContext(query) {
    if (!ZOHO_CONFIGURED) {
        return (
            'Zoho Books integration is not configured. ' +
            'Financial and client data is unavailable for this session.'
        );
    }

    if (!query || typeof query !== 'string') {
        return 'No client query provided — skipping Zoho lookup.';
    }

    try {
        const [clients, invoices] = await Promise.all([
            searchZohoClients(query),
            getRecentInvoices(query, 10),
        ]);

        if (clients.length === 0 && invoices.length === 0) {
            return `No Zoho Books records found matching "${query}".`;
        }

        const lines = [];

        if (clients.length > 0) {
            lines.push(`Zoho Books clients matching "${query}":`);
            for (const c of clients.slice(0, 5)) {
                lines.push(
                    `• ${c.contact_name}` +
                    (c.email          ? ` | Email: ${c.email}`          : '') +
                    (c.phone          ? ` | Phone: ${c.phone}`          : '') +
                    (c.outstanding_receivable_amount !== undefined
                        ? ` | Outstanding: ${c.outstanding_receivable_amount} BHD`
                        : '')
                );
            }
            lines.push('');
        }

        if (invoices.length > 0) {
            lines.push(`Recent invoices for "${query}":`);
            for (const inv of invoices) {
                lines.push(
                    `• Invoice ${inv.invoice_number} — ` +
                    `Date: ${inv.date} — ` +
                    `Total: ${inv.total} ${inv.currency_code || 'BHD'} — ` +
                    `Status: ${inv.status}`
                );
            }
        }

        return lines.join('\n');
    } catch (err) {
        console.error('[brain/zoho] getZohoContext error:', err.message);
        return `Zoho Books lookup failed: ${err.message}`;
    }
}
