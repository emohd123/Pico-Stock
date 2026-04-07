import { handleUpload } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const ALLOWED_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/webp',
];

export async function POST(request) {
    const body = await request.json();
    try {
        const jsonResponse = await handleUpload({
            body,
            request,
            onBeforeGenerateToken: async () => ({
                allowedContentTypes: ALLOWED_TYPES,
                maximumSizeInBytes: 20 * 1024 * 1024, // 20 MB
            }),
            onUploadCompleted: async () => {
                // No-op: files are cleaned up by the AI draft route after processing
            },
        });
        return NextResponse.json(jsonResponse);
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
