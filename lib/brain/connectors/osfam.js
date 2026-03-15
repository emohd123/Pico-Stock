/**
 * Brain Connector — OSFam Stock System
 *
 * Connects to an OSFam stock management API to retrieve live stock levels
 * and search inventory items.
 *
 * Required env vars:
 *   OSFAM_URL   — base URL of the OSFam API (e.g. https://osfam.example.com)
 *   OSFAM_USER  — username / API user
 *   OSFAM_PASS  — password / API secret
 *
 * If any of these are missing, all functions degrade gracefully and return
 * empty results or explanatory context strings.
 *
 * NOTE: OSFam's actual REST API surface is implementation-specific.
 * This module assumes a basic Bearer-token auth endpoint and REST
 * item/search endpoints.  Adjust endpoint paths if the live system differs.
 */

const OSFAM_URL  = process.env.OSFAM_URL;
const OSFAM_USER = process.env.OSFAM_USER;
const OSFAM_PASS = process.env.OSFAM_PASS;

/** True when all required env vars are present */
const OSFAM_CONFIGURED = !!(OSFAM_URL && OSFAM_USER && OSFAM_PASS);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** In-memory token cache to avoid logging in on every request */
let _cachedToken    = null;
let _tokenExpiresAt = 0;   // Unix ms timestamp

/**
 * getOsfamAuth — returns an Authorization header value for OSFam requests.
 * Logs in with username/password if no valid cached token exists.
 *
 * @returns {Promise<{ Authorization: string }>} headers object
 * @throws {Error} when credentials are missing or login fails
 */
export async function getOsfamAuth() {
    if (!OSFAM_CONFIGURED) {
        throw new Error(
            'OSFam credentials not configured. ' +
            'Set OSFAM_URL, OSFAM_USER, and OSFAM_PASS environment variables.'
        );
    }

    // Return cached token if still valid (with 60 s safety buffer)
    if (_cachedToken && Date.now() < _tokenExpiresAt - 60_000) {
        return { Authorization: `Bearer ${_cachedToken}` };
    }

    // Attempt login — adjust endpoint/body format to match the live OSFam instance
    const loginUrl = `${OSFAM_URL}/api/auth/login`;
    const res = await fetch(loginUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username: OSFAM_USER, password: OSFAM_PASS }),
    });

    if (!res.ok) {
        throw new Error(`OSFam login failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    const token   = data.token || data.access_token;
    const expires = data.expires_in ? Date.now() + data.expires_in * 1000 : Date.now() + 3_600_000;

    if (!token) {
        throw new Error(`OSFam login response missing token: ${JSON.stringify(data)}`);
    }

    _cachedToken    = token;
    _tokenExpiresAt = expires;

    return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

/**
 * Perform an authenticated GET against the OSFam API.
 * @param {string} path — relative path, e.g. "/api/items/search"
 * @param {Record<string, string>} [params] — query parameters
 * @returns {Promise<Object>} parsed JSON
 */
async function osfamGet(path, params = {}) {
    const authHeaders = await getOsfamAuth();

    const url = new URL(`${OSFAM_URL}${path}`);
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, String(v));
    }

    const res = await fetch(url.toString(), { headers: authHeaders });

    if (!res.ok) {
        throw new Error(`OSFam GET ${path} failed: HTTP ${res.status}`);
    }

    return res.json();
}

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

/**
 * searchOsfamStock — search OSFam inventory for items matching a query.
 *
 * @param {string} query — item name, code, or description
 * @returns {Promise<Object[]>} array of stock item objects
 */
export async function searchOsfamStock(query) {
    if (!OSFAM_CONFIGURED) return [];

    try {
        // Endpoint path may need to be adjusted to match the live OSFam API
        const data = await osfamGet('/api/items/search', { q: query, limit: '20' });
        return data.items || data.results || data || [];
    } catch (err) {
        console.error('[brain/osfam] searchOsfamStock error:', err.message);
        return [];
    }
}

/**
 * getStockLevel — retrieve the current stock level for a specific item code.
 *
 * @param {string} itemCode — OSFam item/product code
 * @returns {Promise<{ itemCode: string, quantity: number|null, unit: string|null }|null>}
 */
export async function getStockLevel(itemCode) {
    if (!OSFAM_CONFIGURED) return null;

    try {
        // Endpoint path may need to be adjusted to match the live OSFam API
        const data = await osfamGet(`/api/items/${encodeURIComponent(itemCode)}`);

        return {
            itemCode,
            quantity: data.quantity ?? data.stock ?? data.qty ?? null,
            unit:     data.unit || data.unit_of_measure || null,
            name:     data.name || data.description || null,
            rawData:  data,
        };
    } catch (err) {
        console.error('[brain/osfam] getStockLevel error:', err.message);
        return null;
    }
}

/**
 * getOsfamContext — returns a formatted text block about stock items matching
 * the query, suitable for inclusion in an AI system prompt.
 *
 * @param {string} query
 * @returns {Promise<string>}
 */
export async function getOsfamContext(query) {
    if (!OSFAM_CONFIGURED) {
        return (
            'OSFam stock system integration is not configured. ' +
            'Live stock data is unavailable for this session.'
        );
    }

    if (!query || typeof query !== 'string') {
        return 'No stock query provided — skipping OSFam lookup.';
    }

    try {
        const items = await searchOsfamStock(query);

        if (!items || items.length === 0) {
            return `No OSFam stock items found matching "${query}".`;
        }

        const lines = [`OSFam stock items matching "${query}":`];

        for (const item of items.slice(0, 10)) {
            // Normalise common field names across OSFam API response shapes
            const name     = item.name || item.description || item.item_name || 'Unknown';
            const code     = item.code || item.item_code   || item.sku       || '-';
            const qty      = item.quantity ?? item.stock   ?? item.qty       ?? 'N/A';
            const unit     = item.unit || item.unit_of_measure || '';
            const location = item.location || item.warehouse || '';

            lines.push(
                `• ${name} (Code: ${code}) — ` +
                `Qty: ${qty}${unit ? ' ' + unit : ''}` +
                (location ? ` — Location: ${location}` : '')
            );
        }

        return lines.join('\n');
    } catch (err) {
        console.error('[brain/osfam] getOsfamContext error:', err.message);
        return `OSFam stock lookup failed: ${err.message}`;
    }
}
