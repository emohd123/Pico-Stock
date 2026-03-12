import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request) {
    try {
        const formData = await request.formData();
        const files = formData.getAll('files');

        if (!files || files.length === 0) {
            return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
        }

        const uploadDir = path.join(process.cwd(), 'public', 'uploads');
        await mkdir(uploadDir, { recursive: true });

        const uploadedFiles = [];

        for (const file of files) {
            const bytes = await file.arrayBuffer();
            const buffer = Buffer.from(bytes);

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
