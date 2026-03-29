import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

function isImageFile(file) {
    return /^image\/(png|jpeg|jpg|webp)$/i.test(String(file?.type || ''));
}

function toInlineDataUrl(file, buffer) {
    return `data:${file.type || 'application/octet-stream'};base64,${buffer.toString('base64')}`;
}

export async function POST(request) {
    try {
        const formData = await request.formData();
        const files = formData.getAll('files');

        if (!files || files.length === 0) {
            return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
        }

        const productionReadonlyMode = process.env.VERCEL === '1';
        const uploadDir = path.join(process.cwd(), 'public', 'uploads');
        if (!productionReadonlyMode) {
            await mkdir(uploadDir, { recursive: true });
        }

        const uploadedFiles = [];

        for (const file of files) {
            const bytes = await file.arrayBuffer();
            const buffer = Buffer.from(bytes);

             if (productionReadonlyMode) {
                if (!isImageFile(file)) {
                    return NextResponse.json({
                        error: 'Production file uploads require external storage for non-image files. Upload PNG, JPG, or WEBP images only in the current setup.',
                    }, { status: 503 });
                }

                uploadedFiles.push({
                    filename: file.name,
                    originalName: file.name,
                    size: file.size,
                    type: file.type,
                    path: toInlineDataUrl(file, buffer),
                });
                continue;
            }

            const timestamp = Date.now();
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const filename = `${timestamp}_${safeName}`;
            const filepath = path.join(uploadDir, filename);

            await writeFile(filepath, buffer);

            uploadedFiles.push({
                filename: filename,
                originalName: file.name,
                size: file.size,
                type: file.type,
                path: `/uploads/${filename}`,
            });
        }

        return NextResponse.json({
            success: true,
            files: uploadedFiles,
            message: `${uploadedFiles.length} file(s) uploaded successfully`
        });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
