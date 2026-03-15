/**
 * POST /api/brain/chat  — send a message, optionally creating a new thread first
 * GET  /api/brain/chat?threadId=xxx  — fetch a thread with its messages
 */

import { NextResponse } from 'next/server';
import {
    createThread,
    getThread,
    sendMessage,
} from '@/lib/brain/chatService';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const threadId = searchParams.get('threadId');

        if (!threadId) {
            return NextResponse.json(
                { success: false, error: 'threadId query parameter is required' },
                { status: 400 }
            );
        }

        const result = await getThread(threadId);

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
        console.error('[brain/chat] GET error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to fetch thread' },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { threadId: incomingThreadId, message, userId } = body;

        if (!message || typeof message !== 'string' || !message.trim()) {
            return NextResponse.json(
                { success: false, error: 'message is required' },
                { status: 400 }
            );
        }

        const resolvedUserId = userId || 'admin';

        // Create a new thread if no threadId was supplied
        let threadId = incomingThreadId;
        if (!threadId) {
            const newThread = await createThread(resolvedUserId);
            threadId = newThread.id;
        }

        const result = await sendMessage(threadId, message.trim(), resolvedUserId);

        return NextResponse.json({
            success: true,
            threadId: result.threadId,
            messageId: result.messageId,
            answer: result.answer,
            sources: result.sources,
            confidence: result.confidence,
            confidenceScore: result.confidenceScore,
        });
    } catch (error) {
        console.error('[brain/chat] POST error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to send message' },
            { status: 500 }
        );
    }
}
