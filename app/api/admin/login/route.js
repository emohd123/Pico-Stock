import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const { password } = await request.json();
        const adminPassword = process.env.ADMIN_PASSWORD || 'Admin1234';

        if (password === adminPassword) {
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ success: false, error: 'Invalid password' }, { status: 401 });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Login failed' }, { status: 500 });
    }
}
