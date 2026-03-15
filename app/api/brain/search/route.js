/**
 * GET /api/brain/search?q=xxx&page=1&pageSize=20&client=xxx&project=xxx&fileType=xxx
 * Hybrid (vector + keyword) search over the company knowledge base.
 */

import { NextResponse } from 'next/server';
import { hybridSearch } from '@/lib/brain/hybridSearch';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);

        const q = searchParams.get('q') || '';
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const pageSize = Math.min(
            100,
            Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10))
        );

        const filters = {
            client: searchParams.get('client') || '',
            project: searchParams.get('project') || '',
            documentType: searchParams.get('fileType') || '',
        };

        if (!q.trim()) {
            return NextResponse.json({
                success: true,
                results: [],
                total: 0,
                page,
                pageSize,
                totalPages: 0,
                vectorHits: 0,
                keywordHits: 0,
            });
        }

        const result = await hybridSearch(q, filters, { page, pageSize });

        const totalPages = Math.ceil((result.total || 0) / pageSize);

        return NextResponse.json({
            success: true,
            results: result.results,
            total: result.total,
            page,
            pageSize,
            totalPages,
            vectorHits: result.vectorHits,
            keywordHits: result.keywordHits,
        });
    } catch (error) {
        console.error('[brain/search] GET error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Search failed' },
            { status: 500 }
        );
    }
}
