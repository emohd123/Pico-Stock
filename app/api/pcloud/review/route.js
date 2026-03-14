/**
 * GET  /api/pcloud/review — list review queue items
 * PUT  /api/pcloud/review — update a review item (approve/edit/defer)
 */

import { NextResponse } from 'next/server';
import { getReviewQueue, updateReviewItem } from '@/lib/pcloud/store';
import { supabase } from '@/lib/supabase';
import { upsertUnderstanding } from '@/lib/pcloud/store';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status') || 'pending';
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
        const offset = parseInt(searchParams.get('offset') || '0');
        const folder = searchParams.get('folder') || '';

        let query = supabase
            .from('pcloud_review_queue')
            .select(`
                *,
                pcloud_file_records!inner (
                    filename,
                    extension,
                    relative_path,
                    mime_type,
                    size_bytes
                )
            `, { count: 'estimated' })
            .eq('status', status)
            .order('created_at', { ascending: false });

        if (folder) query = query.like('pcloud_file_records.relative_path', `${folder}/%`);

        query = query.range(offset, offset + limit - 1);

        const { data, error, count } = await query;
        if (error) throw error;

        // Enrich with file record data
        const enriched = (data || []).map(item => {
            const f = Array.isArray(item.pcloud_file_records) ? item.pcloud_file_records[0] : (item.pcloud_file_records || {});
            return {
                id: item.id,
                fileRecordId: item.file_record_id,
                reviewReason: item.review_reason,
                suggestedLabels: item.suggested_labels,
                confidenceScore: item.confidence_score,
                status: item.status,
                reviewedBy: item.reviewed_by,
                reviewedAt: item.reviewed_at,
                createdAt: item.created_at,
                
                // File info
                filename: f.filename || 'Unknown',
                extension: f.extension || '',
                relativePath: f.relative_path || '',
                mimeType: f.mime_type || '',
                sizeBytes: Number(f.size_bytes) || 0,
            };
        });

        return NextResponse.json({ success: true, items: enriched, total: count || 0 });
    } catch (err) {
        console.error('Review queue error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}

export async function PUT(request) {
    try {
        const body = await request.json();
        const { id, action, labels } = body;

        if (!id || !action) {
            return NextResponse.json({ success: false, error: 'Missing id or action' }, { status: 400 });
        }

        let updated;
        switch (action) {
            case 'approve':
                updated = await updateReviewItem(id, {
                    status: 'approved',
                    reviewedAt: new Date().toISOString(),
                    reviewedBy: 'admin',
                });
                // Update the file understanding to mark as reviewed
                if (updated) {
                    const { data: rq } = await supabase
                        .from('pcloud_review_queue')
                        .select('file_record_id')
                        .eq('id', id)
                        .single();
                    if (rq) {
                        const { data: existing } = await supabase
                            .from('pcloud_file_understandings')
                            .select('id')
                            .eq('file_record_id', rq.file_record_id)
                            .single();
                        if (existing) {
                            await supabase
                                .from('pcloud_file_understandings')
                                .update({ requires_review: false, updated_at: new Date().toISOString() })
                                .eq('id', existing.id);
                        }
                    }
                }
                break;

            case 'edit':
                if (labels) {
                    updated = await updateReviewItem(id, {
                        status: 'approved',
                        suggestedLabels: labels,
                        reviewedAt: new Date().toISOString(),
                        reviewedBy: 'admin',
                    });
                    // Also update the understanding with the new labels
                    const { data: rq2 } = await supabase
                        .from('pcloud_review_queue')
                        .select('file_record_id')
                        .eq('id', id)
                        .single();
                    if (rq2) {
                        const { data: existing2 } = await supabase
                            .from('pcloud_file_understandings')
                            .select('id')
                            .eq('file_record_id', rq2.file_record_id)
                            .single();
                        if (existing2) {
                            const updateFields = {
                                requires_review: false,
                                updated_at: new Date().toISOString(),
                            };
                            if (labels.client) updateFields.detected_client = labels.client;
                            if (labels.project) updateFields.detected_project = labels.project;
                            if (labels.documentType) updateFields.detected_document_type = labels.documentType;
                            await supabase
                                .from('pcloud_file_understandings')
                                .update(updateFields)
                                .eq('id', existing2.id);
                        }
                    }
                }
                break;

            case 'unknown':
                updated = await updateReviewItem(id, {
                    status: 'marked_unknown',
                    reviewedAt: new Date().toISOString(),
                    reviewedBy: 'admin',
                });
                break;

            case 'defer':
                updated = await updateReviewItem(id, { status: 'deferred' });
                break;

            default:
                return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
        }

        return NextResponse.json({ success: true, item: updated });
    } catch (err) {
        console.error('Review update error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
