/**
 * POST /api/brain/embed  — embed a single file or all files with extracted content
 * GET  /api/brain/embed  — return embedding stats
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { upsertFileEmbeddings } from '@/lib/brain/embeddings';

export const dynamic = 'force-dynamic';

// Service-key Supabase client (bypasses RLS)
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

export async function GET() {
    try {
        // Total chunks in brain_embeddings
        const { count: totalChunks, error: chunksError } = await supabase
            .from('brain_embeddings')
            .select('*', { count: 'exact', head: true });

        if (chunksError) throw chunksError;

        // Distinct files that have at least one embedding
        const { data: embeddedFiles, error: embeddedError } = await supabase
            .from('brain_embeddings')
            .select('file_record_id');

        if (embeddedError) throw embeddedError;

        const filesEmbedded = new Set((embeddedFiles || []).map((r) => r.file_record_id)).size;

        // Files that have extracted content but no embeddings yet
        const { data: extractedFiles, error: extractedError } = await supabase
            .from('pcloud_extracted_contents')
            .select('file_record_id')
            .not('cleaned_text', 'is', null);

        if (extractedError) throw extractedError;

        const embeddedSet = new Set((embeddedFiles || []).map((r) => r.file_record_id));
        const pending = (extractedFiles || []).filter(
            (r) => !embeddedSet.has(r.file_record_id)
        ).length;

        return NextResponse.json({
            success: true,
            stats: {
                total_chunks: totalChunks || 0,
                files_embedded: filesEmbedded,
                pending,
            },
        });
    } catch (error) {
        console.error('[brain/embed] GET error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to fetch embed stats' },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { fileRecordId, embedAll } = body;

        if (!fileRecordId && !embedAll) {
            return NextResponse.json(
                { success: false, error: 'Either fileRecordId or embedAll must be provided' },
                { status: 400 }
            );
        }

        // ── Single file ────────────────────────────────────────────────────
        if (fileRecordId) {
            const { data: record, error: fetchError } = await supabase
                .from('pcloud_extracted_contents')
                .select('file_record_id, cleaned_text, preview_text')
                .eq('file_record_id', fileRecordId)
                .single();

            if (fetchError || !record) {
                return NextResponse.json(
                    { success: false, error: 'File extracted content not found' },
                    { status: 404 }
                );
            }

            const text = record.cleaned_text || record.preview_text || '';
            if (!text.trim()) {
                return NextResponse.json(
                    { success: false, error: 'No text content available for this file' },
                    { status: 422 }
                );
            }

            const result = await upsertFileEmbeddings(fileRecordId, text);

            if (result.error) {
                return NextResponse.json(
                    { success: false, error: result.error },
                    { status: 500 }
                );
            }

            return NextResponse.json({
                success: true,
                embedded: result.inserted,
                errors: result.skipped,
            });
        }

        // ── Embed all ──────────────────────────────────────────────────────
        const { data: allRecords, error: allError } = await supabase
            .from('pcloud_extracted_contents')
            .select('file_record_id, cleaned_text, preview_text')
            .not('cleaned_text', 'is', null)
            .limit(500);

        if (allError) throw allError;

        const records = allRecords || [];
        let totalEmbedded = 0;
        let totalErrors = 0;

        for (const record of records) {
            const text = record.cleaned_text || record.preview_text || '';
            if (!text.trim()) {
                totalErrors++;
                continue;
            }

            try {
                const result = await upsertFileEmbeddings(record.file_record_id, text);
                totalEmbedded += result.inserted || 0;
                totalErrors += result.skipped || 0;
            } catch (err) {
                console.error(
                    `[brain/embed] Failed to embed file ${record.file_record_id}:`,
                    err.message
                );
                totalErrors++;
            }
        }

        return NextResponse.json({
            success: true,
            embedded: totalEmbedded,
            errors: totalErrors,
        });
    } catch (error) {
        console.error('[brain/embed] POST error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Embedding failed' },
            { status: 500 }
        );
    }
}
