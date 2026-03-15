/**
 * GET  /api/brain/threads?userId=xxx  — list all threads for a user
 * POST /api/brain/threads              — create a new thread
 */

import { NextResponse } from 'next/server';
import { listThreads, createThread } from '@/lib/brain/chatService';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId') || 'admin';

        const threads = await listThreads(userId);

        return NextResponse.json({ success: true, threads });
    } catch (error) {
        console.error('[brain/threads] GET error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to fetch threads' },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { userId, title } = body;

        const resolvedUserId = userId || 'admin';
        const thread = await createThread(resolvedUserId, title || 'New conversation');

        return NextResponse.json({ success: true, thread });
    } catch (error) {
        console.error('[brain/threads] POST error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to create thread' },
            { status: 500 }
        );
    }
}
