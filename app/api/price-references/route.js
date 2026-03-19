import { NextResponse } from 'next/server';
import { createPriceReference, getPriceReferences } from '@/lib/priceReferenceStore';

export const runtime = 'nodejs';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';

    try {
        const references = await getPriceReferences({ search });
        return NextResponse.json(references);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch price references' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const reference = await createPriceReference(body);
        return NextResponse.json(reference, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to create price reference' }, { status: 500 });
    }
}
