import { NextResponse } from 'next/server';
import { getStandDesignById, StandDesignStoreError, updateStandDesign } from '@/lib/standDesignStore';
import { generateStandDesignScene, getStandDesignAiStatus } from '@/lib/standDesignAi';

export const runtime = 'nodejs';

function buildScenePayload(existing, conceptIndex, generated = {}) {
    const nextConcepts = Array.isArray(existing.concepts) ? [...existing.concepts] : [];
    const selectedConcept = nextConcepts[conceptIndex];
    nextConcepts[conceptIndex] = {
        ...selectedConcept,
        scene: generated.scene || null,
        scene_status: generated.scene ? 'ready' : 'idle',
        scene_updated_at: new Date().toISOString(),
        scene_generated_by: generated.generated_by || 'manual',
        scene_model: generated.model || selectedConcept?.scene_model || '',
        scene_renders: Array.isArray(selectedConcept?.scene_renders) ? selectedConcept.scene_renders : [],
        reference_analysis: generated.reference_analysis ?? selectedConcept?.reference_analysis ?? null,
        scene_match_camera: generated.scene_match_camera ?? selectedConcept?.scene_match_camera ?? null,
        scene_match_score: generated.scene_match_score ?? selectedConcept?.scene_match_score ?? null,
        scene_match_notes: Array.isArray(generated.scene_match_notes)
            ? generated.scene_match_notes
            : (Array.isArray(selectedConcept?.scene_match_notes) ? selectedConcept.scene_match_notes : []),
        scene_reference_views_used: Array.isArray(generated.scene_reference_views_used)
            ? generated.scene_reference_views_used
            : (Array.isArray(selectedConcept?.scene_reference_views_used) ? selectedConcept.scene_reference_views_used : []),
        scene_reconstruction_status: generated.scene_reconstruction_status || selectedConcept?.scene_reconstruction_status || 'idle',
        architectural_reasoning: generated.architectural_reasoning || selectedConcept?.architectural_reasoning || '',
        blueprint: generated.blueprint || selectedConcept?.blueprint || null,
    };

    return {
        ...existing,
        concepts: nextConcepts,
    };
}

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

        const concept = existing.concepts?.[conceptIndex];
        if (!concept?.path) {
            return NextResponse.json({ error: 'Selected concept image is missing' }, { status: 400 });
        }

        const generated = await generateStandDesignScene({
            brief: body.brief ?? existing.brief,
            conceptTitle: concept.title || `Concept ${conceptIndex + 1}`,
            conceptSummary: concept.summary || '',
            conceptIndex,
            conceptPath: concept.path,
            conceptViews: Array.isArray(concept.views) ? concept.views : [],
        });

        const updated = await updateStandDesign(
            existing.id,
            buildScenePayload(existing, conceptIndex, generated),
        );

        return NextResponse.json({
            item: updated,
            concept_index: conceptIndex,
            scene: generated.scene,
            generated_by: generated.generated_by,
            ai: getStandDesignAiStatus(),
        });
    } catch (error) {
        if (error instanceof StandDesignStoreError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json({ error: error.message || 'Failed to generate 3D scene' }, { status: 500 });
    }
}
