import { handleUpload } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/ministry/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Client-side upload: the browser sends the file straight to Vercel Blob, so a
// 40MB logo/artwork archive is not capped by the 4.5MB serverless body limit.
// Files stay private and are only readable through the token-gated download
// route, matching how quotation PDFs and ministry photos are stored.
const ALLOWED_TYPES = [
    'application/pdf', 'application/postscript', 'application/illustrator',
    'image/vnd.adobe.photoshop', 'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml',
    'application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream', 'text/plain',
];

export async function POST(request) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    const body = await request.json();
    try {
        const jsonResponse = await handleUpload({
            body,
            request,
            // NB: this hook may only return the options below — `access` is not
            // among them, it is set by the browser's upload() call.
            onBeforeGenerateToken: async () => ({
                allowedContentTypes: ALLOWED_TYPES,
                maximumSizeInBytes: 50 * 1024 * 1024,
                addRandomSuffix: true,
            }),
            onUploadCompleted: async () => {
                // The row in mm_production_files is written by the client once the
                // upload resolves (see /api/quotations/production/files).
            },
        });
        return NextResponse.json(jsonResponse);
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
