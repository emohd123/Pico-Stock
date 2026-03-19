import { NextResponse } from 'next/server';
import { deletePriceReference, getPriceReferenceById, updatePriceReference } from '@/lib/priceReferenceStore';

export const runtime = 'nodejs';

export async function GET(_request, { params }) {
    try {
        const reference = await getPriceReferenceById(params.id);
        if (!reference) {
            return NextResponse.json({ error: 'Price reference not found' }, { status: 404 });
        }

        return NextResponse.json(reference);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch price reference' }, { status: 500 });
    }
}

export async function PUT(request, { params }) {
    try {
        const body = await request.json();
        const reference = await updatePriceReference(params.id, body);
        if (!reference) {
            return NextResponse.json({ error: 'Price reference not found' }, { status: 404 });
        }

        return NextResponse.json(reference);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update price reference' }, { status: 500 });
    }
}

export async function DELETE(_request, { params }) {
    try {
        const deleted = await deletePriceReference(params.id);
        if (!deleted) {
            return NextResponse.json({ error: 'Price reference not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete price reference' }, { status: 500 });
    }
}
