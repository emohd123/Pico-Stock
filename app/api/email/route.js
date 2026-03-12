import { NextResponse } from 'next/server';
import { getOrderById } from '@/lib/store';
import { sendOrderEmail } from '@/lib/email';

export async function POST(request) {
    try {
        const body = await request.json();
        const { orderId, toEmail } = body;

        if (!orderId) {
            return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
        }

        const order = await getOrderById(orderId);
        if (!order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        const adminEmail = process.env.ADMIN_EMAIL || 'ebrahim@picobahrain.com';
        const customerEmail = order.exhibitor?.email;

        // toCustomer: true → Admin confirming order. Send TO customer, CC admin.
        // default        → Customer placing new order. Send TO admin, NO CC to customer.
        const sendToCustomer = body.toCustomer === true;
        const toAddr = sendToCustomer && customerEmail ? customerEmail : adminEmail;
        const ccAddr = sendToCustomer ? adminEmail : null;

        const result = await sendOrderEmail({
            order,
            toEmail: toAddr,
            ccEmail: ccAddr,
        });

        if (result.success) {
            return NextResponse.json({
                success: true,
                messageId: result.messageId,
                message: 'Email sent successfully',
            });
        } else {
            return NextResponse.json({
                success: false,
                error: result.error,
                message: 'Email sending failed — order was still saved successfully',
            }, { status: 200 });
        }
    } catch (error) {
        console.error('Email API error:', error);
        return NextResponse.json({
            success: false,
            error: error.message,
            message: 'Email service error — order was still saved successfully',
        }, { status: 200 });
    }
}
