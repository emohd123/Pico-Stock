/**
 * GET /api/pcloud/files/[id] — full file details with understanding + extracted content
 */

import { NextResponse } from 'next/server';
import { getFileRecordById, getUnderstandingByFileId, getExtractedContentByFileId } from '@/lib/pcloud/store';
import { supabase } from '@/lib/supabase';
import {
    normalizeClientLabel,
    normalizeDocumentType,
    normalizeProjectLabel,
    normalizeUnderstandingLevel,
} from '@/lib/pcloud/normalization.js';

export async function GET(request, { params }) {
    try {
        const { id } = params;

        const fileRecord = await getFileRecordById(id);
        if (!fileRecord) {
            return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
        }

        const understanding = await getUnderstandingByFileId(id);
        const extractedContent = await getExtractedContentByFileId(id);
        const normalizedUnderstanding = understanding ? {
            ...understanding,
            understandingLevel: normalizeUnderstandingLevel(understanding.understandingLevel),
            detectedClient: normalizeClientLabel(understanding.detectedClient),
            detectedProject: normalizeProjectLabel(understanding.detectedProject),
            detectedDocumentType: normalizeDocumentType(understanding.detectedDocumentType, understanding.detectedMediaType),
        } : null;

        // Get processing errors for this file
        const { data: errors } = await supabase
            .from('pcloud_processing_errors')
            .select('*')
            .eq('file_record_id', id)
            .order('created_at', { ascending: false })
            .limit(10);

        // Get review items for this file
        const { data: reviews } = await supabase
            .from('pcloud_review_queue')
            .select('*')
            .eq('file_record_id', id)
            .order('created_at', { ascending: false })
            .limit(5);

        return NextResponse.json({
            success: true,
            fileRecord,
            understanding: normalizedUnderstanding,
            extractedContent,
            processingErrors: errors || [],
            reviewItems: reviews || [],
        });
    } catch (err) {
        console.error('File detail error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
