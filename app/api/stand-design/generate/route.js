import { NextResponse } from 'next/server';
import { generateStandDesignConcepts, getStandDesignAiStatus } from '@/lib/standDesignAi';
import { createStandDesignMaintenanceResponse, getStandDesignMaintenanceStatus } from '@/lib/standDesignMaintenance';
import { createStandDesign, StandDesignStoreError } from '@/lib/standDesignStore';

export const runtime = 'nodejs';

export async function POST(request) {
    if (getStandDesignMaintenanceStatus().heavy_jobs_paused) {
        return createStandDesignMaintenanceResponse(NextResponse);
    }
    try {
        const body = await request.json();
        const draftId = body.id || `stand-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const generation = await generateStandDesignConcepts({
            designId: draftId,
            mode: body.mode,
            prompt: body.prompt,
            brief: body.brief,
            stylePreset: body.style_preset,
            angle: body.angle,
            refinementPrompt: body.refinement_prompt,
            referenceImagePath: body.reference_image_path,
        });

        const record = await createStandDesign({
            id: draftId,
            mode: body.mode,
            prompt: body.prompt,
            refinement_prompt: body.refinement_prompt,
            style_preset: body.style_preset,
            angle: body.angle,
            reference_image_path: body.reference_image_path,
            brief: body.brief,
            concepts: generation.concepts,
            provider: generation.provider,
            model: generation.model,
        });

        return NextResponse.json({
            item: record,
            ai: getStandDesignAiStatus(),
        }, { status: 201 });
    } catch (error) {
        if (error instanceof StandDesignStoreError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json({ error: error.message || 'Failed to generate stand design concepts' }, { status: 500 });
    }
}
