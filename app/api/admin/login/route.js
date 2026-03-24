import { NextResponse } from 'next/server';
import {
    createAdminSessionToken,
    getAdminCookieName,
    getAdminCookieOptions,
    hasAdminPasswordConfigured,
} from '@/lib/adminAuth';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 8;
const loginAttempts = globalThis.__picoAdminLoginAttempts || new Map();
if (!globalThis.__picoAdminLoginAttempts) {
    globalThis.__picoAdminLoginAttempts = loginAttempts;
}

function getClientKey(request) {
    const forwarded = request.headers.get('x-forwarded-for') || '';
    return forwarded.split(',')[0]?.trim() || 'local';
}

function readAttempts(key) {
    const now = Date.now();
    const entry = loginAttempts.get(key);
    if (!entry || entry.expiresAt <= now) {
        loginAttempts.delete(key);
        return { count: 0, expiresAt: now + LOGIN_WINDOW_MS };
    }
    return entry;
}

function storeFailedAttempt(key) {
    const current = readAttempts(key);
    loginAttempts.set(key, {
        count: current.count + 1,
        expiresAt: current.expiresAt,
    });
}

function clearAttempts(key) {
    loginAttempts.delete(key);
}

export async function POST(request) {
    try {
        const clientKey = getClientKey(request);
        const attempts = readAttempts(clientKey);
        if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
            return NextResponse.json({ success: false, error: 'Too many login attempts. Try again later.' }, { status: 429 });
        }

        const { password } = await request.json();
        const adminPassword = String(process.env.ADMIN_PASSWORD || '').trim();

        if (!hasAdminPasswordConfigured()) {
            return NextResponse.json({ success: false, error: 'Admin login is not configured' }, { status: 503 });
        }

        if (password === adminPassword) {
            clearAttempts(clientKey);
            const response = NextResponse.json({ success: true });
            response.cookies.set(getAdminCookieName(), await createAdminSessionToken(), getAdminCookieOptions());
            return response;
        }

        storeFailedAttempt(clientKey);
        return NextResponse.json({ success: false, error: 'Invalid password' }, { status: 401 });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Login failed' }, { status: 500 });
    }
}
