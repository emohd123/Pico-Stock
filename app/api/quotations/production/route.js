import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/ministry/auth';
import { setProductionAssignment, setProductionNote, setProductionTitle } from '@/lib/ministry/queries';
import { DEPARTMENTS, TITLE_ITEM_NOS } from '@/lib/ministry/production';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Admin saves a per-item department override ({quotationId, itemNo, dept}), a
// per-item event title ({quotationId, itemNo, title}), or a per-meeting
// production note ({quotationId, note}).
export async function POST(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    const body = await req.json();
    const quotationId = Number(body.quotationId);
    if (!quotationId) return new NextResponse('Bad request', { status: 400 });

    if (body.itemNo != null && 'title' in body) {
        const itemNo = Number(body.itemNo);
        if (!TITLE_ITEM_NOS.includes(itemNo)) return new NextResponse('Bad request', { status: 400 });
        await setProductionTitle(quotationId, itemNo, String(body.title || '').trim().slice(0, 300));
        return NextResponse.json({ ok: true });
    }
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
