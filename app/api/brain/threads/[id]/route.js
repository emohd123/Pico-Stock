/**
 * GET    /api/brain/threads/[id]  — fetch a thread with all its messages
 * DELETE /api/brain/threads/[id]  — delete a thread and all its messages
 */

import { NextResponse } from 'next/server';
import { getThread, deleteThread } from '@/lib/brain/chatService';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
    try {
        const { id } = params;

        const result = await getThread(id);

        if (!result) {
            return NextResponse.json(
                { success: false, error: 'Thread not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            thread: result.thread,
            messages: result.messages,
        });
    } catch (error) {
        console.error('[brain/threads/[id]] GET error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to fetch thread' },
            { status: 500 }
        );
    }
}

export async function DELETE(request, { params }) {
    try {
        const { id } = params;

        await deleteThread(id);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[brain/threads/[id]] DELETE error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to delete thread' },
            { status: 500 }
        );
    }
}
