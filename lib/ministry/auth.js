import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

// Ministry-portal admin session — separate cookie from pico-stock's own admin.
// Next 14: cookies() is synchronous.
const COOKIE = 'ministry_admin_session';

function secret() {
    return process.env.MINISTRY_SESSION_SECRET || process.env.SUPABASE_JWT_SECRET || 'dev-insecure-secret';
}
function adminPassword() {
    return process.env.MINISTRY_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || '';
}

function sign(value) {
    const mac = createHmac('sha256', secret()).update(value).digest('base64url');
    return `${value}.${mac}`;
}
function verify(signed) {
    if (!signed) return false;
    const idx = signed.lastIndexOf('.');
    if (idx < 0) return false;
    const value = signed.slice(0, idx);
    const mac = signed.slice(idx + 1);
    const expected = createHmac('sha256', secret()).update(value).digest('base64url');
    try {
        const a = Buffer.from(mac); const b = Buffer.from(expected);
        return a.length === b.length && timingSafeEqual(a, b) && value === 'admin';
    } catch { return false; }
}

export function checkPassword(input) {
    const expected = adminPassword();
    if (!expected) return false;
    const a = Buffer.from(input); const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

export function createAdminSession() {
    cookies().set(COOKIE, sign('admin'), {
        httpOnly: true, sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 12,
    });
}
export function destroyAdminSession() { cookies().delete(COOKIE); }
export function isAdmin() { return verify(cookies().get(COOKIE)?.value); }
