import { NextResponse } from 'next/server';
import { getStandDesignAiStatus, storeStandDesignSceneRender } from '@/lib/standDesignAi';
import { getStandDesignById, StandDesignStoreError, updateStandDesign } from '@/lib/standDesignStore';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
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
        if (!selectedConcept?.scene) {
            return NextResponse.json({ error: 'Generate a 3D scene first before rendering a match preview' }, { status: 400 });
        }

        const render = await storeStandDesignSceneRender({
            designId: existing.id,
            conceptId: selectedConcept.id || `concept-${conceptIndex + 1}`,
            imageDataUrl: body.image_data_url,
            label: body.label || 'Match Preview',
        });

        const nextConcepts = Array.isArray(existing.concepts) ? [...existing.concepts] : [];
        nextConcepts[conceptIndex] = {
            ...selectedConcept,
            scene_renders: [render, ...(Array.isArray(selectedConcept.scene_renders) ? selectedConcept.scene_renders : [])].slice(0, 8),
            scene_reconstruction_status: selectedConcept.scene_reconstruction_status || 'needs-manual-correction',
            scene_updated_at: new Date().toISOString(),
        };

        const updated = await updateStandDesign(existing.id, {
            ...existing,
            concepts: nextConcepts,
        });

        return NextResponse.json({
            item: updated,
            concept_index: conceptIndex,
            render,
            ai: getStandDesignAiStatus(),
        });
    } catch (error) {
        if (error instanceof StandDesignStoreError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json({ error: error.message || 'Failed to save match preview' }, { status: 500 });
    }
}
