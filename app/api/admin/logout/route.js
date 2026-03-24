import { NextResponse } from 'next/server';
import { getAdminCookieName } from '@/lib/adminAuth';

export async function POST() {
    const response = NextResponse.json({ success: true });
    response.cookies.set(getAdminCookieName(), '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
        expires: new Date(0),
    });
    return response;
}
