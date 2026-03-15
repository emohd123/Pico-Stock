/**
 * GET    /api/brain/pin?limit=20         — list pinned insights
 * POST   /api/brain/pin                  — pin a message as an insight
 * DELETE /api/brain/pin?id=xxx           — delete a pinned insight
 */

import { NextResponse } from 'next/server';
import { getPinnedInsights, pinInsight, deletePin } from '@/lib/brain/chatService';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

        const pins = await getPinnedInsights(limit);

        return NextResponse.json({ success: true, pins });
    } catch (error) {
        console.error('[brain/pin] GET error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to fetch pins' },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { messageId, title, tags, userId } = body;

        if (!messageId) {
            return NextResponse.json(
                { success: false, error: 'messageId is required' },
                { status: 400 }
            );
        }

        if (!title || typeof title !== 'string' || !title.trim()) {
            return NextResponse.json(
                { success: false, error: 'title is required' },
                { status: 400 }
            );
        }

        const resolvedUserId = userId || 'admin';
        const pin = await pinInsight(messageId, title.trim(), tags || [], resolvedUserId);

        return NextResponse.json({ success: true, pin });
    } catch (error) {
        console.error('[brain/pin] POST error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to pin insight' },
            { status: 500 }
        );
    }
}

export async function DELETE(request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'id query parameter is required' },
                { status: 400 }
            );
        }

        await deletePin(id);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[brain/pin] DELETE error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to delete pin' },
            { status: 500 }
        );
    }
}
