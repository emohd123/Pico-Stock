import { NextResponse } from 'next/server';
import { searchPCloud } from '@/lib/pcloud/searchService';

export const dynamic = 'force-dynamic';

function getFilters(searchParams) {
    return {
        fileType: searchParams.get('fileType') || '',
        client: searchParams.get('client') || '',
        project: searchParams.get('project') || '',
        folderPrefix: searchParams.get('folderPrefix') || '',
        status: searchParams.get('status') || '',
        understandingLevel: searchParams.get('understandingLevel') || '',
        documentType: searchParams.get('documentType') || '',
    };
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q') || '';
        const page = Number(searchParams.get('page') || '1');
        const pageSize = Number(searchParams.get('pageSize') || '20');
        const sort = searchParams.get('sort') || 'relevance';

        const result = await searchPCloud({
            query,
            filters: getFilters(searchParams),
            page,
            pageSize,
            sort,
        });

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error) {
        console.error('pCloud search error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Search failed' },
            { status: 500 }
        );
    }
}
