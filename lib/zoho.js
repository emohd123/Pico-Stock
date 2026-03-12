/**
 * Zoho Books API integration
 * Handles token refresh, contact lookup/creation, estimate creation, and PDF download.
 */

const ZOHO_TOKEN_URL  = 'https://accounts.zoho.com/oauth/v2/token';
const ZOHO_API_BASE   = 'https://www.zohoapis.com/books/v3';
const ORG_ID          = process.env.ZOHO_BOOKS_ORG_ID;
const CLIENT_ID       = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET   = process.env.ZOHO_CLIENT_SECRET;
const REFRESH_TOKEN   = process.env.ZOHO_REFRESH_TOKEN;

/** Exchange refresh token for a fresh access token (valid 1 hour) */
async function getAccessToken() {
    const res = await fetch(
        `${ZOHO_TOKEN_URL}?refresh_token=${REFRESH_TOKEN}&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=refresh_token`,
        { method: 'POST' }
    );
    const data = await res.json();
    if (!data.access_token) throw new Error(`Zoho token refresh failed: ${JSON.stringify(data)}`);
    return data.access_token;
}

/** Zoho API GET helper */
async function zohoGet(path, token) {
    const url = `${ZOHO_API_BASE}${path}${path.includes('?') ? '&' : '?'}organization_id=${ORG_ID}`;
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
    if (!res.ok) throw new Error(`Zoho GET ${path} failed: ${res.status}`);
    return res;
}

/** Zoho API POST helper */
async function zohoPost(path, token, body) {
    const url = `${ZOHO_API_BASE}${path}?organization_id=${ORG_ID}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.code !== 0) throw new Error(`Zoho POST ${path} failed: ${data.message || JSON.stringify(data)}`);
    return data;
}

/**
 * Find an existing contact by email, or create a new one.
 * Returns the Zoho contact_id.
 */
async function findOrCreateContact(exhibitor, token) {
    const email = exhibitor.email || '';
    const company = exhibitor.company || exhibitor.name || 'Unknown';

    // 1. Search by exact company name first
    const res = await zohoGet(`/contacts?contact_name=${encodeURIComponent(company)}&contact_type=customer`, token);
    const data = await res.json();
    if (data.contacts && data.contacts.length > 0) {
        const exact = data.contacts.find(c => c.contact_name.toLowerCase() === company.toLowerCase());
        if (exact) return exact.contact_id;
        return data.contacts[0].contact_id;
    }

    // 2. Create new contact
    try {
        const created = await zohoPost('/contacts', token, {
            contact_name: company,
            contact_type: 'customer',
            contact_persons: [{
                first_name: exhibitor.name || '',
                email: email,
                phone: exhibitor.phone || '',
                is_primary_contact: true,
            }],
        });
        return created.contact.contact_id;
    } catch (err) {
        // If it failed (often because the email is already used by another company contact),
        // try creating it without the email so the Quotation name is still correct.
        const fallback = await zohoPost('/contacts', token, {
            contact_name: company,
            contact_type: 'customer',
            contact_persons: [{
                first_name: exhibitor.name || '',
                phone: exhibitor.phone || '',
                is_primary_contact: true,
            }],
        });
        return fallback.contact.contact_id;
    }
}

/**
 * Create a Zoho Books estimate from an order.
 * Returns { estimate_id, estimate_number }
 */
export async function createZohoEstimate(order) {
    const token = await getAccessToken();
    const customerId = await findOrCreateContact(order.exhibitor || {}, token);

    const days = order.days || 1;
    const today = new Date().toISOString().slice(0, 10);
    const expiry = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

    const lineItems = (order.items || []).map(item => ({
        name: item.name,
        description: item.comment || '',
        quantity: item.quantity || 1,
        rate: (item.price || 0) * days,   // rate = unit price × days
        unit: days === 1 ? '1 day' : `${days} days`,
    }));

    const notes = [
        order.exhibitor?.eventName ? `Event: ${order.exhibitor.eventName}` : '',
        order.exhibitor?.boothNumber ? `Booth: ${order.exhibitor.boothNumber}` : '',
        order.notes ? `Notes: ${order.notes}` : '',
    ].filter(Boolean).join(' | ');

    const payload = {
        customer_id: customerId,
        reference_number: order.id,
        date: today,
        expiry_date: expiry,
        line_items: lineItems,
        notes: notes || undefined,
        terms: `All prices in BHD. Rental period: ${days} ${days === 1 ? 'day' : 'days'}.`,
    };

    const result = await zohoPost('/estimates', token, payload);
    const est = result.estimate;
    return { estimate_id: est.estimate_id, estimate_number: est.estimate_number };
}

/**
 * Download the PDF of a Zoho Books estimate.
 * Returns a Buffer.
 */
export async function getEstimatePDF(estimateId) {
    const token = await getAccessToken();
    const res = await zohoGet(`/estimates/${estimateId}?accept=pdf`, token);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

/**
 * Mark a Zoho Books estimate status as "sent".
 */
export async function markEstimateSent(estimateId) {
    const token = await getAccessToken();
    await zohoPost(`/estimates/${estimateId}/status/sent`, token, {});
}
