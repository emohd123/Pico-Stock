import { NextResponse } from 'next/server';
import { checkPassword, createAdminSession } from '@/lib/ministry/auth';

export const runtime = 'nodejs';

export async function POST(req) {
    const form = await req.formData();
    const password = String(form.get('password') || '');
    const origin = new URL(req.url).origin;
    if (!checkPassword(password)) {
        return NextResponse.redirect(new URL('/quotations?error=1', origin), 303);
    }
    createAdminSession();
    return NextResponse.redirect(new URL('/quotations', origin), 303);
}
