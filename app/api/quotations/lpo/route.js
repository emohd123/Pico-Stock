import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/ministry/auth';
import { setMinistryLpo, logActivity } from '@/lib/ministry/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Admin toggles whether the LPO (purchase order) has been received for a
// ministry. Its calendar dates then render red (confirmed) instead of green.
export async function POST(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    const { ministryId, received } = await req.json();
    if (!ministryId) return new NextResponse('Bad request', { status: 400 });
    await setMinistryLpo(Number(ministryId), Boolean(received));
    await logActivity({
        ministryId: Number(ministryId), actor: 'admin',
        action: received ? 'lpo.received' : 'lpo.cleared',
        detail: received
            ? 'LPO (purchase order) received — meeting confirmed and released to production'
            : 'LPO mark removed — meeting no longer confirmed',
    });
    return NextResponse.json({ ok: true });
}
