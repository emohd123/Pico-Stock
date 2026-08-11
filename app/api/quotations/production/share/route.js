import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/ministry/auth';
import { createShareToken, revokeShareToken, getQuotationById, logActivity } from '@/lib/ministry/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Create ({quotationId}) or revoke ({quotationId, revoke:true}) the read-only
// production link for a meeting. Creating again issues a fresh token, which
// invalidates any link already handed out.
export async function POST(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    const body = await req.json();
    const quotationId = Number(body.quotationId);
    if (!quotationId) return new NextResponse('Bad request', { status: 400 });

    const quote = await getQuotationById(quotationId);
    const log = (action, detail) => quote
        ? logActivity({ ministryId: quote.ministryId, quotationId, actor: 'admin', action, detail })
        : null;

    if (body.revoke) {
        await revokeShareToken(quotationId);
        await log('sharelink.revoked', `Production share link revoked for ${quote ? quote.ref : quotationId}`);
        return NextResponse.json({ ok: true, token: null });
    }
    const token = await createShareToken(quotationId);
    await log('sharelink.created', `Read-only production share link issued for ${quote ? quote.ref : quotationId}`);
    return NextResponse.json({ ok: true, token });
}
