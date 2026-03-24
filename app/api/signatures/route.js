import { getSignatures, getSignatureByName, upsertSignature, deleteSignature } from '@/lib/signatureStore';

export const runtime = 'nodejs';

export async function GET(request) {
    try {
        const searchParams = request.nextUrl?.searchParams || new URL(request.url).searchParams;
        const name = searchParams.get('name');
        if (name) {
            const sig = await getSignatureByName(name);
            return Response.json(sig || null);
        }
        const sigs = await getSignatures();
        return Response.json(sigs);
    } catch (error) {
        return Response.json({ error: 'Failed to load signatures' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const payload = await request.json();
        if (!payload.name?.trim()) {
            return Response.json({ error: 'name is required' }, { status: 400 });
        }
        const sig = await upsertSignature(payload.name, {
            signature_image: payload.signature_image,
            stamp_image: payload.stamp_image,
        });
        return Response.json(sig);
    } catch (error) {
        return Response.json({ error: 'Failed to save signature' }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const searchParams = request.nextUrl?.searchParams || new URL(request.url).searchParams;
        const name = searchParams.get('name');
        if (!name) return Response.json({ error: 'name is required' }, { status: 400 });
        const deleted = await deleteSignature(name);
        if (!deleted) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: 'Failed to delete signature' }, { status: 500 });
    }
}
