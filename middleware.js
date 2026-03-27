import { NextResponse } from 'next/server';
import { getAdminCookieName, verifyAdminSessionToken } from '@/lib/adminAuth';

const ADMIN_LOGIN_PATH = '/admin/login';

function isAdminPage(pathname) {
    return pathname === '/admin' || pathname.startsWith('/admin/');
}

function isProtectedApiRequest(pathname, method) {
    if (pathname.startsWith('/api/quotations')) return true;
    if (pathname.startsWith('/api/stand-design')) return true;
    if (pathname.startsWith('/api/customers')) return true;
    if (pathname.startsWith('/api/designers')) return true;
    if (pathname.startsWith('/api/price-references')) return true;
    if (pathname.startsWith('/api/signatures')) return true;
    if (pathname === '/api/upload') return true;
    if (pathname === '/api/extract') return true;
    if (pathname === '/api/sync-stock') return true;
    if (pathname === '/api/email') return true;
    if (pathname === '/api/admin/logout') return true;
    if (pathname === '/api/products') return method !== 'GET';
    if (pathname === '/api/orders') return method !== 'POST';
    return false;
}

export async function middleware(request) {
    const { pathname } = request.nextUrl;
    const method = request.method || 'GET';
    const token = request.cookies.get(getAdminCookieName())?.value || '';
    const isAuthenticated = await verifyAdminSessionToken(token);

    if (pathname === ADMIN_LOGIN_PATH && isAuthenticated) {
        return NextResponse.redirect(new URL('/admin/quotations', request.url));
    }

    if (isAdminPage(pathname) && pathname !== ADMIN_LOGIN_PATH && !isAuthenticated) {
        return NextResponse.redirect(new URL(ADMIN_LOGIN_PATH, request.url));
    }

    if (isProtectedApiRequest(pathname, method) && !isAuthenticated) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/admin/:path*', '/api/:path*'],
};
