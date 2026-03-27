import { NextResponse } from 'next/server';
import { removeStandDesignAssets } from '@/lib/standDesignAi';
import { deleteStandDesign, getStandDesignById } from '@/lib/standDesignStore';

export const runtime = 'nodejs';

export async function GET(_request, { params }) {
    try {
        const item = await getStandDesignById(params.id);
        if (!item) {
            return NextResponse.json({ error: 'Stand design not found' }, { status: 404 });
        }
        return NextResponse.json(item);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch stand design' }, { status: 500 });
    }
}

export async function DELETE(_request, { params }) {
    try {
        const existing = await getStandDesignById(params.id);
        if (!existing) {
            return NextResponse.json({ error: 'Stand design not found' }, { status: 404 });
        }

        const deleted = await deleteStandDesign(params.id);
        if (!deleted) {
            return NextResponse.json({ error: 'Stand design not found' }, { status: 404 });
        }
        await removeStandDesignAssets(existing);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete stand design' }, { status: 500 });
    }
}
