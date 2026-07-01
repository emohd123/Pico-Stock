import { NextResponse } from 'next/server';
import { destroyAdminSession } from '@/lib/ministry/auth';

export const runtime = 'nodejs';

export async function POST(req) {
    destroyAdminSession();
    return NextResponse.redirect(new URL('/quotations', new URL(req.url).origin), 303);
}
