import { NextResponse } from 'next/server';
import { generateQuotationPdf } from '@/lib/quotationExport';
import { sendQuotationEmail } from '@/lib/email';
import { getOrderById, updateOrder } from '@/lib/store';
import { getSignatureByName } from '@/lib/signatureStore';
import { getQuotationById, updateQuotation } from '@/lib/quotationStore';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
    try {
        const body = await request.json().catch(() => ({}));
        const markConfirmed = body.markConfirmed === true;
        const quotation = await getQuotationById(params.id);

        if (!quotation) {
            return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
        }

        const order = quotation.source_order_id ? await getOrderById(quotation.source_order_id) : null;
        const recipientEmail = quotation.source_order_customer_email || order?.exhibitor?.email || '';
        if (!recipientEmail) {
            return NextResponse.json({ error: 'Customer email is missing for this quotation' }, { status: 400 });
        }

        let staffSig = null;
        if (quotation.created_by?.trim()) {
            try {
                staffSig = await getSignatureByName(quotation.created_by.trim());
            } catch {}
        }

        const pdfBuffer = await generateQuotationPdf(quotation, 'customer', staffSig);
        const sendResult = await sendQuotationEmail({
            quotation,
            order,
            pdfBuffer,
            toEmail: recipientEmail,
            ccEmail: process.env.ADMIN_EMAIL || 'ebrahim@picobahrain.com',
        });

        if (!sendResult.success) {
            return NextResponse.json({ error: sendResult.error || 'Failed to send quotation email' }, { status: 500 });
        }

        const timestamp = new Date().toISOString();
        const nextStatus = markConfirmed ? 'Confirmed' : (quotation.status || 'Draft');
        const updatedQuotation = await updateQuotation(quotation.id, {
            ...quotation,
            status: nextStatus,
            email_sent_at: timestamp,
            confirmed_at: markConfirmed ? timestamp : quotation.confirmed_at,
        });

        if (order) {
            await updateOrder(order.id, {
                status: markConfirmed ? 'confirmed' : (order.status === 'pending' ? 'quoted' : order.status),
                quotationId: quotation.id,
                quotationQtNumber: quotation.qt_number,
                quotationStatus: nextStatus,
                quotationSentAt: timestamp,
                quotationConfirmedAt: markConfirmed ? timestamp : order.quotationConfirmedAt,
            });
        }

        return NextResponse.json({
            success: true,
            quotation: updatedQuotation,
            messageId: sendResult.messageId,
        });
    } catch (error) {
        console.error('Quotation send error:', error);
        return NextResponse.json({ error: 'Failed to send quotation' }, { status: 500 });
    }
}
