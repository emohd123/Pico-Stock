import { NextResponse } from 'next/server';
import { analyzeStandDesignReference, getStandDesignAiStatus } from '@/lib/standDesignAi';
import { createStandDesignMaintenanceResponse, getStandDesignMaintenanceStatus } from '@/lib/standDesignMaintenance';
import { getStandDesignById, StandDesignStoreError, updateStandDesign } from '@/lib/standDesignStore';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
    if (getStandDesignMaintenanceStatus().heavy_jobs_paused) {
        return createStandDesignMaintenanceResponse(NextResponse);
    }
    try {
        const existing = await getStandDesignById(params.id);
        if (!existing) {
            return NextResponse.json({ error: 'Stand design not found' }, { status: 404 });
        }

        const body = await request.json();
        const conceptIndex = Number(body.concept_index);
        if (!Number.isInteger(conceptIndex) || conceptIndex < 0 || conceptIndex > 1) {
            return NextResponse.json({ error: 'Valid concept_index is required' }, { status: 400 });
        }

        const selectedConcept = existing.concepts?.[conceptIndex];
        if (!selectedConcept?.path) {
            return NextResponse.json({ error: 'Selected concept image is missing' }, { status: 400 });
        }

        const analysis = await analyzeStandDesignReference({
            brief: existing.brief,
            conceptTitle: selectedConcept.title || `Concept ${conceptIndex + 1}`,
            conceptSummary: selectedConcept.summary || '',
            conceptIndex,
            conceptPath: selectedConcept.path,
            conceptViews: Array.isArray(selectedConcept.views) ? selectedConcept.views : [],
        });

        const nextConcepts = Array.isArray(existing.concepts) ? [...existing.concepts] : [];
        nextConcepts[conceptIndex] = {
            ...selectedConcept,
            reference_analysis: analysis.reference_analysis,
            scene_match_camera: analysis.scene_match_camera,
            scene_reference_views_used: analysis.scene_reference_views_used,
            scene_reconstruction_status: analysis.scene_reconstruction_status,
            scene_updated_at: new Date().toISOString(),
        };

        const updated = await updateStandDesign(existing.id, {
            ...existing,
            concepts: nextConcepts,
        });

        return NextResponse.json({
            item: updated,
            concept_index: conceptIndex,
            analysis: analysis.reference_analysis,
            ai: getStandDesignAiStatus(),
        });
    } catch (error) {
        if (error instanceof StandDesignStoreError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json({ error: error.message || 'Failed to analyze reference concept' }, { status: 500 });
    }
}
