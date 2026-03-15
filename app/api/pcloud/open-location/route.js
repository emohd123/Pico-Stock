import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

/**
 * POST /api/pcloud/open-location
 * Opens Windows Explorer with the file selected in its folder.
 * Body: { fileId: string }
 */
export async function POST(request) {
    try {
        const { fileId } = await request.json();
        if (!fileId) {
            return NextResponse.json({ success: false, error: 'fileId required' }, { status: 400 });
        }

        // Fetch the absolute path from Supabase
        const { data, error } = await supabase
            .from('pcloud_file_records')
            .select('absolute_path, relative_path, filename')
            .eq('id', fileId)
            .single();

        if (error || !data) {
            return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
        }

        const filePath = data.absolute_path;
        if (!filePath) {
            return NextResponse.json(
                { success: false, error: 'No absolute path stored for this file', relativePath: data.relative_path },
                { status: 422 }
            );
        }

        // Run explorer.exe /select,"<path>" — opens Explorer with the file highlighted
        const escapedPath = filePath.replace(/"/g, '\\"');
        exec(`explorer.exe /select,"${escapedPath}"`, (err) => {
            // Explorer sometimes returns a non-zero exit code even on success — ignore it
            if (err && err.code !== 1) {
                console.error('Explorer open error:', err.message);
            }
        });

        return NextResponse.json({ success: true, path: filePath });
    } catch (err) {
        console.error('open-location error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
