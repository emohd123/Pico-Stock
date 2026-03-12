import { NextResponse } from 'next/server';
import { getDesigners, addDesigner, updateDesigner, deleteDesigner } from '@/lib/store';

export async function GET() {
    try {
        return NextResponse.json(await getDesigners());
    } catch {
        return NextResponse.json({ error: 'Failed to fetch designers' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const { name } = await request.json();
        if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
        const designer = {
            id: `des-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            name: name.trim(),
            projects: [],
            createdAt: new Date().toISOString(),
        };
        return NextResponse.json({ success: true, designer: await addDesigner(designer) });
    } catch {
        return NextResponse.json({ error: 'Failed to create designer' }, { status: 500 });
    }
}

export async function PUT(request) {
    try {
        const { id, ...updates } = await request.json();
        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
        const updated = await updateDesigner(id, updates);
        if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ success: true, designer: updated });
    } catch {
        return NextResponse.json({ error: 'Failed to update designer' }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
        await deleteDesigner(id);
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Failed to delete designer' }, { status: 500 });
    }
}
