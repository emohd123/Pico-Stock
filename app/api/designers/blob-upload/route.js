import { handleUpload } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Design project files: documents, artwork sources, archives.
// .ai / .psd / .cdr usually arrive as application/octet-stream or postscript.
const ALLOWED_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/postscript',
    'application/illustrator',
    'image/vnd.adobe.photoshop',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/octet-stream',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
];

export async function POST(request) {
    const body = await request.json();
    try {
        const jsonResponse = await handleUpload({
            body,
            request,
            onBeforeGenerateToken: async () => ({
                allowedContentTypes: ALLOWED_TYPES,
                maximumSizeInBytes: 50 * 1024 * 1024, // 50 MB
                addRandomSuffix: true,
            }),
            onUploadCompleted: async () => {
                // File URL is persisted on the project record by the client after upload.
            },
        });
        return NextResponse.json(jsonResponse);
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
