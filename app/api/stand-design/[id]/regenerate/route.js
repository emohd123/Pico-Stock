import { NextResponse } from 'next/server';
import { generateStandDesignConcepts, getStandDesignAiStatus, removeStandDesignAssets } from '@/lib/standDesignAi';
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
        const conceptIndexRaw = Number(body.concept_index);
        const conceptIndex = (Number.isInteger(conceptIndexRaw) && conceptIndexRaw >= 0 && conceptIndexRaw <= 1)
            ? conceptIndexRaw
            : null;
        const conceptIndexes = conceptIndex !== null ? [conceptIndex] : [0, 1];
        const nextPayload = {
            ...existing,
            mode: body.mode ?? existing.mode,
            prompt: body.prompt ?? existing.prompt,
            refinement_prompt: body.refinement_prompt ?? existing.refinement_prompt,
            style_preset: body.style_preset ?? existing.style_preset,
            angle: body.angle ?? existing.angle,
            reference_image_path: body.reference_image_path ?? existing.reference_image_path,
            brief: body.brief ?? existing.brief,
            id: existing.id,
        };

        const generation = await generateStandDesignConcepts({
            designId: existing.id,
            mode: nextPayload.mode,
            prompt: nextPayload.prompt,
            brief: nextPayload.brief,
            stylePreset: nextPayload.style_preset,
            angle: nextPayload.angle,
            refinementPrompt: nextPayload.refinement_prompt,
            referenceImagePath: nextPayload.reference_image_path,
            conceptIndexes,
        });

        const nextConcepts = Array.isArray(existing.concepts) ? [...existing.concepts] : [];
        for (let index = 0; index < conceptIndexes.length; index += 1) {
            const targetIndex = conceptIndexes[index];
            const previous = nextConcepts[targetIndex];
            if (previous) {
                await removeStandDesignAssets({ concepts: [previous] });
            }
            nextConcepts[targetIndex] = generation.concepts[index];
        }

        const updated = await updateStandDesign(existing.id, {
            ...nextPayload,
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
        return NextResponse.json({ error: error.message || 'Failed to regenerate stand design concepts' }, { status: 500 });
    }
}
