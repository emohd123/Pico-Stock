import { NextResponse } from 'next/server';
import { sendCompanyContactEmail } from '@/lib/email';

export async function POST(request) {
    try {
        const body = await request.json();
        const payload = {
            name: body.name?.trim(),
            email: body.email?.trim(),
            phone: body.phone?.trim(),
            company: body.company?.trim(),
            service: body.service?.trim(),
            message: body.message?.trim(),
        };

        if (!payload.name || !payload.email || !payload.phone || !payload.company || !payload.service || !payload.message) {
            return NextResponse.json({ success: false, error: 'Please complete all required fields.' }, { status: 400 });
        }

        const result = await sendCompanyContactEmail(payload);

        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error || 'Email sending failed.' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Inquiry sent successfully.' });
    } catch (error) {
        console.error('Company contact error:', error);
        return NextResponse.json({ success: false, error: 'Unable to submit the inquiry right now.' }, { status: 500 });
    }
}
