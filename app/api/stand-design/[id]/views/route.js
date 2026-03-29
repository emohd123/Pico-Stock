import { NextResponse } from 'next/server';
import { generateStandDesignConceptViews, getStandDesignAiStatus, removeStandDesignAssets } from '@/lib/standDesignAi';
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

        if (Array.isArray(selectedConcept.views) && selectedConcept.views.length > 0) {
            await removeStandDesignAssets({ concepts: [{ views: selectedConcept.views }] });
        }

        const generation = await generateStandDesignConceptViews({
            designId: existing.id,
            conceptId: selectedConcept.id || `concept-${conceptIndex + 1}`,
            conceptTitle: selectedConcept.title || `Concept ${conceptIndex + 1}`,
            prompt: body.prompt ?? existing.prompt,
            brief: body.brief ?? existing.brief,
            stylePreset: body.style_preset ?? existing.style_preset,
            conceptPath: selectedConcept.path,
        });

        const nextConcepts = Array.isArray(existing.concepts) ? [...existing.concepts] : [];
        nextConcepts[conceptIndex] = {
            ...selectedConcept,
            views: generation.views,
        };

        const updated = await updateStandDesign(existing.id, {
            ...existing,
            prompt: body.prompt ?? existing.prompt,
            brief: body.brief ?? existing.brief,
            style_preset: body.style_preset ?? existing.style_preset,
            concepts: nextConcepts,
            provider: generation.provider,
            model: generation.model,
        });

        return NextResponse.json({
            item: updated,
            ai: getStandDesignAiStatus(),
        });
    } catch (error) {
        if (error instanceof StandDesignStoreError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json({ error: error.message || 'Failed to generate concept views' }, { status: 500 });
    }
}
