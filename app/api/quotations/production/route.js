import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/ministry/auth';
import { setProductionAssignment, setProductionNote } from '@/lib/ministry/queries';
import { DEPARTMENTS } from '@/lib/ministry/production';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Admin saves a per-item department override ({quotationId, itemNo, dept}) or
// a per-meeting production note ({quotationId, note}).
export async function POST(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    const body = await req.json();
    const quotationId = Number(body.quotationId);
    if (!quotationId) return new NextResponse('Bad request', { status: 400 });

    if (body.itemNo != null) {
        const itemNo = Number(body.itemNo);
        const dept = String(body.dept || '');
        if (!itemNo || !DEPARTMENTS.some((d) => d.id === dept)) return new NextResponse('Bad request', { status: 400 });
        await setProductionAssignment(quotationId, itemNo, dept);
        return NextResponse.json({ ok: true });
    }
    if ('note' in body) {
        await setProductionNote(quotationId, String(body.note || '').slice(0, 2000));
        return NextResponse.json({ ok: true });
    }
    return new NextResponse('Bad request', { status: 400 });
}
