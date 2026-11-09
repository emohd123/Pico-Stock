import { NextResponse } from 'next/server';
import { bahrainStamp, getElectricityForm, getElectricityOrderById, updateElectricityOrder } from '@/lib/electricityOrderStore';
import { electricityQuotationFilename, generateElectricityQuotationPdf } from '@/lib/electricityQuotationPdf';
import { sendElectricityQuotation } from '@/lib/electricityOrderEmails';

export const dynamic = 'force-dynamic';

// Admin-only (middleware).

async function load(request, id) {
    const order = await getElectricityOrderById(id);
    if (!order) return {};
    const form = await getElectricityForm();
    const orderUrl = `${new URL(request.url).origin}/electricity/order/${order.orderKey}`;
    return { order, form, orderUrl };
}

/** The quotation PDF, or the invoice with ?kind=invoice. */
export async function GET(request, { params }) {
    const { order, form, orderUrl } = await load(request, params.id);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    try {
        const kind = new URL(request.url).searchParams.get('kind') === 'invoice' ? 'invoice' : 'quotation';
        const pdf = await generateElectricityQuotationPdf(form, order, { orderUrl, kind });
        return new NextResponse(pdf, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename="${electricityQuotationFilename(order, kind)}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('Electricity quotation PDF failed:', error);
        return NextResponse.json({ error: 'Could not create the quotation.' }, { status: 500 });
    }
}

/** Email the quotation to the vendor (Pico copied). Body: { intro?, previousTotal? } */
export async function POST(request, { params }) {
    const { order, form, orderUrl } = await load(request, params.id);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    try {
        const body = await request.json().catch(() => ({}));
        const intro = String(body.intro || '').trim().slice(0, 1000);
        const previousTotal = body.previousTotal === undefined || body.previousTotal === null ? null : Number(body.previousTotal);
        const pdf = await generateElectricityQuotationPdf(form, order, { orderUrl });
        const sent = await sendElectricityQuotation({
            form, order, orderUrl, intro, previousTotal,
            attachment: { filename: electricityQuotationFilename(order), content: pdf, contentType: 'application/pdf' },
        });
        if (!sent.success) return NextResponse.json({ error: `The email could not be sent (${sent.error}).` }, { status: 502 });
        const updated = await updateElectricityOrder(order, { appendNote: `Quotation emailed to ${order.vendor.email}, ${bahrainStamp()}.` });
        return NextResponse.json({ order: updated });
    } catch (error) {
        console.error('Electricity quotation email failed:', error);
        return NextResponse.json({ error: 'Could not send the quotation.' }, { status: 500 });
    }
}
