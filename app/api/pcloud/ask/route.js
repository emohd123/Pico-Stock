import { NextResponse } from 'next/server';
import { askPCloud } from '@/lib/pcloud/searchService';

export async function POST(request) {
    try {
        const body = await request.json();
        const query = body?.query || '';

        if (!query.trim()) {
            return NextResponse.json(
                { success: false, error: 'Query is required.' },
                { status: 400 }
            );
        }

        const result = await askPCloud({
            query,
            filters: body?.filters || {},
            pageSize: Number(body?.pageSize) || 6,
        });

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error) {
        console.error('Ask pCloud error:', error);
        console.error('Stack trace:', error.stack);
        return NextResponse.json(
            { success: false, error: error.message || 'Ask pCloud failed', details: error.stack },
            { status: 500 }
        );
    }
}
