// Appends a row to the master quotation-number Google Sheet.
//
// Activates only when these env vars are set (otherwise it silently no-ops, so
// quotation generation never depends on the sheet being configured):
//   GOOGLE_SA_EMAIL        service-account email
//   GOOGLE_SA_PRIVATE_KEY  service-account private key (PEM; \n may be escaped)
//   QUOTE_SHEET_ID         the spreadsheet id (from its URL)
//   QUOTE_SHEET_RANGE      optional, defaults to "Sheet1!A:F"
//
// No external dependencies — it mints a Google OAuth token from the service
// account with the built-in crypto module, then calls the Sheets REST API.

import crypto from 'crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

function base64url(input) {
    return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function isConfigured() {
    return Boolean(process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY && process.env.QUOTE_SHEET_ID);
}

async function getAccessToken() {
    const email = process.env.GOOGLE_SA_EMAIL;
    const key = String(process.env.GOOGLE_SA_PRIVATE_KEY).replace(/\\n/g, '\n');
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = base64url(JSON.stringify({
        iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600,
    }));
    const signingInput = `${header}.${claim}`;
    const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(key);
    const jwt = `${signingInput}.${base64url(signature)}`;

    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    });
    if (!res.ok) throw new Error(`Google token error ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return json.access_token;
}

/**
 * Append one row [ref, ministry, event, date, total, ...] to the master sheet.
 * Best-effort: returns true on success, false if not configured or on failure.
 * Never throws — callers should not fail quote generation if this fails.
 */
export async function appendQuoteRow(values) {
    if (!isConfigured()) return false;
    try {
        const token = await getAccessToken();
        const sheetId = process.env.QUOTE_SHEET_ID;
        const range = process.env.QUOTE_SHEET_RANGE || 'Sheet1!A:F';
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: [values] }),
        });
        if (!res.ok) throw new Error(`Sheets append error ${res.status}: ${await res.text()}`);
        return true;
    } catch (e) {
        console.error('[quoteLog] append failed:', e.message);
        return false;
    }
}
