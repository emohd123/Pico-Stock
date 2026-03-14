/**
 * GET /api/pcloud/files — list/search file records with filters
 * Query params: limit, offset, search, extension, sourceStatus
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import {
    normalizeClientLabel,
    normalizeDocumentType,
    normalizeProjectLabel,
    normalizeUnderstandingLevel,
} from '@/lib/pcloud/normalization.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
        const offset = parseInt(searchParams.get('offset') || '0');
        const search = searchParams.get('search') || '';
        const extension = searchParams.get('extension') || '';
        const client = searchParams.get('client') || '';
        const project = searchParams.get('project') || '';
        const level = searchParams.get('level') || '';
        const minConf = parseFloat(searchParams.get('minConf') || '0');
        const maxConf = parseFloat(searchParams.get('maxConf') || '1');
        const folder = searchParams.get('folder') || '';

        // Join file_records with understandings for rich listing
        // Use inner join so we can filter on the joined table fields
        let query = supabase
            .from('pcloud_file_records')
            .select(`
                *,
                pcloud_file_understandings!inner (
                    understanding_level,
                    detected_client,
                    detected_project,
                    detected_document_type,
                    detected_media_type,
                    confidence_score,
                    short_summary,
                    requires_review
                )
            `, { count: 'estimated' })
            .eq('is_active', true)
            .order('indexed_at', { ascending: false });

        if (extension) query = query.eq('extension', extension);
        if (search) query = query.or(`filename.ilike.%${search}%,relative_path.ilike.%${search}%`);
        if (folder) query = query.like('relative_path', `${folder}/%`);

        // Push down understanding filters to database level
        if (client) query = query.ilike('pcloud_file_understandings.detected_client', `%${client}%`);
        if (project) query = query.ilike('pcloud_file_understandings.detected_project', `%${project}%`);
        if (level) query = query.eq('pcloud_file_understandings.understanding_level', level);
        if (minConf > 0) query = query.gte('pcloud_file_understandings.confidence_score', minConf);
        if (maxConf < 1) query = query.lte('pcloud_file_understandings.confidence_score', maxConf);

        // Apply pagination last
        query = query.range(offset, offset + limit - 1);

        const { data, error, count } = await query;
        if (error) throw error;

        // Transform rows
        let records = (data || []).map(row => {
            // !inner forces it to be an array of length 1 in the response
            const u = Array.isArray(row.pcloud_file_understandings) ? row.pcloud_file_understandings[0] : (row.pcloud_file_understandings || {});
            return {
                id:               row.id,
                filename:         row.filename,
                extension:        row.extension,
                mimeType:         row.mime_type,
                sizeBytes:        Number(row.size_bytes),
                relativePath:     row.relative_path,
                parentPath:       row.parent_path,
                indexedAt:        row.indexed_at,
                lastSeenAt:       row.last_seen_at,
                sourceStatus:     row.source_status,
                // Understanding fields
                understandingLevel: normalizeUnderstandingLevel(u.understanding_level || 'metadata_only'),
                detectedClient:     normalizeClientLabel(u.detected_client) || null,
                detectedProject:    normalizeProjectLabel(u.detected_project) || null,
                detectedDocType:    normalizeDocumentType(u.detected_document_type, u.detected_media_type) || null,
                detectedMediaType:  u.detected_media_type || null,
                confidenceScore:    Number(u.confidence_score) || 0,
                shortSummary:       u.short_summary || null,
                requiresReview:     u.requires_review || false,
            };
        });

        return NextResponse.json({
            success: true,
            records,
            total: count || 0,
            limit,
            offset,
        });
    } catch (err) {
        console.error('File list error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
