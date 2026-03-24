const ADMIN_SESSION_COOKIE = 'pico_admin_session';
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12;

function textEncoder() {
    return new TextEncoder();
}

function toHex(bytes) {
    return Array.from(bytes).map((value) => value.toString(16).padStart(2, '0')).join('');
}

function fromHex(value) {
    const clean = String(value || '').trim();
    if (!clean || clean.length % 2 !== 0) return null;
    const bytes = new Uint8Array(clean.length / 2);
    for (let index = 0; index < clean.length; index += 2) {
        const next = Number.parseInt(clean.slice(index, index + 2), 16);
        if (Number.isNaN(next)) return null;
        bytes[index / 2] = next;
    }
    return bytes;
}

function constantTimeEqual(left, right) {
    if (left.length !== right.length) return false;
    let mismatch = 0;
    for (let index = 0; index < left.length; index += 1) {
        mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return mismatch === 0;
}

function getAdminPassword() {
    return String(process.env.ADMIN_PASSWORD || '').trim();
}

function getAdminSessionSecret() {
    const explicitSecret = String(process.env.ADMIN_SESSION_SECRET || '').trim();
    if (explicitSecret) return explicitSecret;
    const password = getAdminPassword();
    return password ? `pico-admin:${password}` : '';
}

async function signValue(value) {
    const secret = getAdminSessionSecret();
    if (!secret) return '';
    const key = await crypto.subtle.importKey(
        'raw',
        textEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, textEncoder().encode(value));
    return toHex(new Uint8Array(signature));
}

export function hasAdminPasswordConfigured() {
    return Boolean(getAdminPassword());
}

export function getAdminCookieName() {
    return ADMIN_SESSION_COOKIE;
}

export function getAdminCookieOptions() {
    const secure = process.env.NODE_ENV === 'production';
    return {
        httpOnly: true,
        sameSite: 'lax',
        secure,
        path: '/',
        maxAge: ADMIN_SESSION_TTL_SECONDS,
    };
}

export async function createAdminSessionToken() {
    const issuedAt = Math.floor(Date.now() / 1000);
    const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
    const nonce = toHex(nonceBytes);
    const payload = `${issuedAt}.${nonce}`;
    const signature = await signValue(payload);
    return `${payload}.${signature}`;
}

export async function verifyAdminSessionToken(token) {
    const raw = String(token || '').trim();
    if (!raw) return false;

    const parts = raw.split('.');
    if (parts.length !== 3) return false;

    const [issuedAtRaw, nonce, signature] = parts;
    const issuedAt = Number.parseInt(issuedAtRaw, 10);
    if (!Number.isFinite(issuedAt) || !nonce || !signature) return false;
    if (!fromHex(nonce) || !fromHex(signature)) return false;
    if ((Math.floor(Date.now() / 1000) - issuedAt) > ADMIN_SESSION_TTL_SECONDS) return false;

    const expectedSignature = await signValue(`${issuedAt}.${nonce}`);
    return Boolean(expectedSignature) && constantTimeEqual(signature, expectedSignature);
}

