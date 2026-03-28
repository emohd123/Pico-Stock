import { promises as fs } from 'fs';
import path from 'path';
import { GoogleGenAI, createPartFromBase64 } from '@google/genai';
import { getStandDesignStylePreset } from '@/lib/standDesignConfig';
import {
    buildStandDesignCoverageSummary,
    buildStandDesignStructuredPrompt,
    getConceptDirectionLabel,
    getConceptDirectionSummary,
    normalizeStandDesignBrief,
    summarizeStandDesignBrief,
} from '@/lib/standDesignBrief';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const GENERATED_DIR = path.join(UPLOADS_DIR, 'stand-design', 'generated');

function normalizeText(value) {
    return String(value || '').trim();
}

function isDataUrl(value) {
    return /^data:/i.test(normalizeText(value));
}

function toInlineDataUrl(mimeType, imageBytes) {
    return `data:${normalizeText(mimeType) || 'image/png'};base64,${String(imageBytes || '')}`;
}

function shouldInlineGeneratedAssets() {
    return process.env.VERCEL === '1' || /^true$/i.test(normalizeText(process.env.STAND_DESIGN_INLINE_IMAGES || ''));
}

function getGeminiApiKey() {
    return normalizeText(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '');
}

export function getStandDesignAiStatus() {
    return {
        configured: Boolean(getGeminiApiKey() && getStandDesignModel()),
        provider: 'google-genai',
        model: getStandDesignModel(),
        fallback_model: getStandDesignFallbackModel(),
    };
}

export function getStandDesignModel() {
    return normalizeText(process.env.GEMINI_IMAGE_MODEL || '');
}

export function getStandDesignFallbackModel() {
    const configured = normalizeText(process.env.GEMINI_FALLBACK_IMAGE_MODEL || '');
    if (configured) return configured;
    const primary = getStandDesignModel();
    if (/^gemini-3-pro-image-preview$/i.test(primary)) {
        return 'gemini-3.1-flash-image-preview';
    }
    return '';
}

function getStandDesignModelCandidates() {
    const primary = getStandDesignModel();
    const fallback = getStandDesignFallbackModel();
    return [primary, fallback].filter(Boolean).filter((value, index, array) => array.indexOf(value) === index);
}

function getAiClient() {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        throw new Error('Gemini API key is not configured. Set GEMINI_API_KEY on the server.');
    }
    return new GoogleGenAI({ apiKey });
}

function isGeminiPreviewImageModel(model) {
    return /^gemini-/i.test(normalizeText(model));
}

function buildPrompt({ prompt, stylePreset, angle, refinementPrompt, mode }) {
    const preset = getStandDesignStylePreset(stylePreset);
    const cleanedPrompt = normalizeText(prompt).replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    const parts = [
        'Generate a photorealistic architectural 3D render of a real exhibition stand, designed for professional client presentation.',
        'ACCURACY REQUIREMENT: Every functional zone, spatial element, and architectural constraint listed in the brief below MUST appear in the render. Do not simplify, omit, merge, or substitute any required element. Render fidelity to the brief is the primary success criterion.',
        `Style: ${preset.label}. ${preset.promptModifier}`,
        `Stand brief:\n${cleanedPrompt}`,
    ];

    if (angle) {
        parts.push(`Camera angle: ${angle}.`);
    }

    if (mode === 'edit') {
        parts.push('REFERENCE IMAGE: Use the attached image as the base stand. Preserve its layout, open sides, and spatial zones. Refine materials, lighting, brand accuracy, and detail quality — do not replace the concept or invent a different layout.');
    }

    if (normalizeText(refinementPrompt)) {
        parts.push(`Refinement instruction: ${normalizeText(refinementPrompt)}`);
    }

    parts.push('Output: One single client-ready architectural stand render. No text overlays, no collages, no multiple views in one frame, no moodboards.');
    return parts.join('\n\n');
}

function buildConceptVariantPrompt(basePrompt, variantIndex, brief = {}) {
    const variantNotes = variantIndex === 0
        ? 'DESIGN DIRECTION — Concept 1: polished, premium, gallery-led. Crisp spatial zoning, strong brand hierarchy, maximum client readability. Think refined luxury real estate show stand.'
        : 'DESIGN DIRECTION — Concept 2: architecturally bold and sculptural while remaining buildable and practical. Stronger spatial drama, more memorable visual impact, distinctive visitor journey.';
    const normalizedBrief = normalizeStandDesignBrief(brief);

    // Hard requirements — every non-empty field becomes a MUST
    const mustInclude = [
        normalizedBrief.stand_size
            ? `Stand footprint MUST be exactly ${normalizedBrief.stand_size} — do not scale up or down` : '',
        normalizedBrief.stand_type
            ? `Stand form MUST be ${normalizedBrief.stand_type}` : '',
        normalizedBrief.open_sides
            ? `Open sides MUST be visible: ${normalizedBrief.open_sides}` : '',
        normalizedBrief.partial_open_side_details
            ? `Semi-open wall MUST be shown: ${normalizedBrief.partial_open_side_details}` : '',
        normalizedBrief.screen_requirements
            ? `Screens MUST appear: ${normalizedBrief.screen_requirements}` : '',
        normalizedBrief.reception_requirements
            ? `Reception MUST appear: ${normalizedBrief.reception_requirements}` : '',
        normalizedBrief.model_display_requirements
            ? `Project models MUST appear: ${normalizedBrief.model_display_requirements}` : '',
        normalizedBrief.meeting_requirements
            ? `Discussion / meeting areas MUST appear: ${normalizedBrief.meeting_requirements}` : '',
        normalizedBrief.vip_requirements
            ? `VIP zone MUST appear: ${normalizedBrief.vip_requirements}` : '',
        normalizedBrief.flooring_requirements
            ? `Flooring MUST be: ${normalizedBrief.flooring_requirements}` : '',
        normalizedBrief.accessibility_requirements
            ? `Accessibility feature MUST be shown: ${normalizedBrief.accessibility_requirements}` : '',
    ].filter(Boolean);

    // Short-form DO NOT OMIT list — a final safety net
    const doNotOmit = [
        normalizedBrief.screen_requirements ? 'digital screens' : '',
        normalizedBrief.reception_requirements ? 'reception counter' : '',
        normalizedBrief.model_display_requirements ? 'project model display area' : '',
        normalizedBrief.vip_requirements ? 'VIP seating zone' : '',
        normalizedBrief.meeting_requirements ? 'discussion / meeting points' : '',
        normalizedBrief.accessibility_requirements ? 'accessibility ramp' : '',
    ].filter(Boolean);

    return [
        basePrompt,
        variantNotes,
        mustInclude.length
            ? `MUST-INCLUDE REQUIREMENTS — none of these may be skipped or omitted:\n${mustInclude.map((i) => `  • ${i}`).join('\n')}`
            : '',
        doNotOmit.length
            ? `DO NOT OMIT FROM THE RENDER: ${doNotOmit.join(', ')}`
            : '',
        'Prioritize: accurate spatial zones → buildable architecture → brand identity → premium materials → commercial realism. Style comes last.',
        normalizedBrief.avoid_notes ? `STRICTLY AVOID: ${normalizedBrief.avoid_notes}` : '',
        'Output: one single client-presentation render — no collage, no moodboard, no split frame, no text panels, no multiple variations in one image.',
    ].filter(Boolean).join('\n\n');
}

function buildConceptViewsPrompt({ prompt, brief, stylePreset, conceptTitle, angleLabel, cameraInstruction }) {
    const normalizedBrief = normalizeStandDesignBrief(brief);
    const preset = getStandDesignStylePreset(stylePreset);

    // Build a per-angle "do not fake" guard so the model cannot silently substitute a nicer angle
    const angleGuard = (() => {
        if (angleLabel === 'Back View') {
            return 'CRITICAL ANGLE ACCURACY — BACK VIEW: Do NOT render the front or a diagonal view. Do NOT show the main entrance or reception face. You must render the stand from directly behind (6 o\'clock position). If you cannot determine the rear wall from the reference, render the opposite side from the main entrance. This must be a genuine rear elevation, not a prettier substitute angle.';
        }
        if (angleLabel === 'Side View') {
            return 'CRITICAL ANGLE ACCURACY — SIDE VIEW: Do NOT render the front face or a front-diagonal. The camera is at 9 o\'clock (left side), perpendicular to the stand. The main entrance is 90° to the right and is NOT visible. Render the left side profile as a genuine side elevation.';
        }
        if (angleLabel === 'Front View') {
            return 'CRITICAL ANGLE ACCURACY — FRONT VIEW: Do NOT render from a raised aerial angle or a diagonal. Camera is at 12 o\'clock, perfectly head-on at eye level. This must be a genuine front elevation, flat and centered on the entrance.';
        }
        return '';
    })();

    return [
        // ── 1. CAMERA POSITION (first — highest model weight) ────────────────
        `CAMERA ANGLE (${angleLabel}): ${cameraInstruction}`,
        'This image must show the exhibition stand STRICTLY from the camera position described above. Do NOT substitute a more visually appealing angle. Do NOT default to a front or perspective view. The specified angle is mandatory.',

        // ── 2. Per-angle accuracy guard ──────────────────────────────────────
        angleGuard,

        // ── 3. Identity preservation (same stand, viewpoint changes only) ────
        `Render the exact same exhibition stand concept from the reference image: "${normalizeText(conceptTitle) || 'Selected Concept'}".`,
        'CRITICAL: Preserve every design detail — stand architecture, structural forms, reception area, signage, screens, model display, meeting areas, VIP zones, materials, brand colors, and layout identity. ONLY the camera viewpoint changes. Do not redesign, simplify, or invent new elements.',

        // ── 4. Style consistency ─────────────────────────────────────────────
        `Rendering style: ${preset.label}. ${preset.promptModifier}`,

        // ── 5. Brief structural constraints ──────────────────────────────────
        normalizedBrief.stand_size ? `Stand footprint must remain: ${normalizedBrief.stand_size}.` : '',
        normalizedBrief.stand_type ? `Stand type must remain: ${normalizedBrief.stand_type}.` : '',
        normalizedBrief.open_sides ? `Open-side access must remain: ${normalizedBrief.open_sides}.` : '',
        normalizedBrief.brand_colors ? `Brand colors must remain: ${normalizedBrief.brand_colors}.` : '',

        // ── 6. Output format ─────────────────────────────────────────────────
        'Output one single professional architectural render. No collages, no split frames, no text overlays, no side-by-side comparisons.',
    ].filter(Boolean).join('\n\n');
}

function resolvePublicFile(publicPath) {
    const cleanPath = normalizeText(publicPath);
    if (isDataUrl(cleanPath)) {
        return cleanPath;
    }
    if (!cleanPath.startsWith('/uploads/')) {
        throw new Error('Reference image path is invalid');
    }

    const normalizedRelative = cleanPath.replace(/^\/+/, '').replace(/\//g, path.sep);
    const absolutePath = path.join(PUBLIC_DIR, normalizedRelative);
    const safePrefix = `${UPLOADS_DIR}${path.sep}`;
    if (!absolutePath.startsWith(safePrefix) && absolutePath !== UPLOADS_DIR) {
        throw new Error('Reference image path is not allowed');
    }
    return absolutePath;
}

async function loadReferenceImage(publicPath) {
    const cleanPath = normalizeText(publicPath);
    if (isDataUrl(cleanPath)) {
        const match = cleanPath.match(/^data:([^;,]+)?;base64,(.+)$/i);
        if (!match) {
            throw new Error('Reference image data is invalid');
        }
        return {
            mimeType: normalizeText(match[1]) || 'image/png',
            imageBytes: match[2],
        };
    }

    const absolutePath = resolvePublicFile(cleanPath);
    const fileBuffer = await fs.readFile(absolutePath);
    const extension = path.extname(absolutePath).toLowerCase();
    const mimeType = extension === '.webp' ? 'image/webp' : extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'image/png';
    return {
        imageBytes: fileBuffer.toString('base64'),
        mimeType,
    };
}

async function loadOptionalInlinePart(publicPath) {
    const cleanPath = normalizeText(publicPath);
    if (!cleanPath) return null;
    const file = await loadReferenceImage(cleanPath);
    return createPartFromBase64(file.imageBytes, file.mimeType);
}

function extractGeminiInlineImages(response) {
    const images = [];
    for (const candidate of Array.isArray(response?.candidates) ? response.candidates : []) {
        for (const part of Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []) {
            if (part?.inlineData?.data) {
                images.push({
                    image: {
                        imageBytes: part.inlineData.data,
                        mimeType: normalizeText(part.inlineData.mimeType || 'image/jpeg') || 'image/jpeg',
                    },
                });
            }
        }
    }
    return images;
}

function isRetryableProviderError(error) {
    const message = normalizeText(error?.message || '');
    return /"status":"INTERNAL"|Internal error encountered|currently experiencing high demand|"status":"UNAVAILABLE"/i.test(message);
}

function formatProviderError(error) {
    const message = normalizeText(error?.message || '');
    if (/"status":"UNAVAILABLE"|currently experiencing high demand/i.test(message)) {
        return 'Gemini image generation is temporarily busy. Please retry in a moment.';
    }
    if (/"status":"INTERNAL"|Internal error encountered/i.test(message)) {
        return 'Gemini image generation failed on the provider side. Please simplify the brief slightly or try again.';
    }
    return message || 'Gemini image generation failed. Please try again.';
}

async function generateGeminiPreviewImage({ ai, model, userParts }) {
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
            const response = await ai.models.generateContent({
                model,
                contents: [{ role: 'user', parts: userParts }],
                config: {
                    responseModalities: ['IMAGE', 'TEXT'],
                },
            });

            const generatedImages = extractGeminiInlineImages(response);
            if (!generatedImages.length) {
                throw new Error('Gemini did not return an image concept. Please refine the prompt and try again.');
            }

            return generatedImages[0];
        } catch (error) {
            lastError = error;
            if (!isRetryableProviderError(error) || attempt === 2) {
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
        }
    }
    throw lastError;
}

async function generateGeminiPreviewWithFallback({ ai, userParts }) {
    const modelCandidates = getStandDesignModelCandidates();
    if (!modelCandidates.length) {
        throw new Error('Gemini image model is not configured. Set GEMINI_IMAGE_MODEL on the server.');
    }

    let lastError;
    for (const model of modelCandidates) {
        try {
            const image = await generateGeminiPreviewImage({ ai, model, userParts });
            return { image, model };
        } catch (error) {
            lastError = error;
            // Always try remaining candidates — even non-retryable errors may be model-specific
        }
    }

    throw new Error(formatProviderError(lastError));
}

async function generateGeminiPreviewConcept({
    ai,
    prompt,
    brief,
    stylePreset,
    angle,
    refinementPrompt,
    mode,
    referenceImagePath,
    variantIndex,
}) {
    const conceptPrompt = buildConceptVariantPrompt(buildPrompt({
        prompt,
        stylePreset,
        angle,
        refinementPrompt,
        mode,
    }), variantIndex, brief);

    const userParts = [{ text: conceptPrompt }];
    if (mode === 'edit') {
        const referenceImage = await loadReferenceImage(referenceImagePath);
        userParts.push(createPartFromBase64(referenceImage.imageBytes, referenceImage.mimeType));
    }
    const normalizedBrief = normalizeStandDesignBrief(brief);
    const brandLogoPart = await loadOptionalInlinePart(normalizedBrief.logo_image_path);
    const brandReferencePart = await loadOptionalInlinePart(normalizedBrief.brand_reference_image_path);
    if (brandLogoPart) {
        userParts.push(brandLogoPart);
    }
    if (brandReferencePart) {
        userParts.push(brandReferencePart);
    }

    return generateGeminiPreviewWithFallback({ ai, userParts });
}

async function persistGeneratedConcepts(designId, generatedImages = [], metadata = []) {
    const inlineMode = shouldInlineGeneratedAssets();
    if (!inlineMode) {
        await fs.mkdir(GENERATED_DIR, { recursive: true });
    }

    const concepts = [];
    for (let index = 0; index < generatedImages.length; index += 1) {
        const generated = generatedImages[index];
        const imageBytes = generated?.image?.imageBytes;
        if (!imageBytes) continue;
        const mimeType = normalizeText(generated?.image?.mimeType || 'image/png') || 'image/png';
        const meta = metadata[index] || {};
        const concept = {
            id: normalizeText(meta.id) || `concept-${index + 1}`,
            path: inlineMode ? toInlineDataUrl(mimeType, imageBytes) : '',
            mimeType,
            title: normalizeText(meta.title) || `Concept ${index + 1}`,
            summary: normalizeText(meta.summary),
            refinement_prompt: normalizeText(meta.refinement_prompt),
            source_variant: normalizeText(meta.source_variant),
            prompt: normalizeText(meta.prompt),
            coverage: Array.isArray(meta.coverage) ? meta.coverage : [],
            created_at: new Date().toISOString(),
        };

        if (!inlineMode) {
            const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
            const filename = `${designId}-${Date.now()}-${index + 1}.${extension}`;
            const absolutePath = path.join(GENERATED_DIR, filename);
            await fs.writeFile(absolutePath, Buffer.from(imageBytes, 'base64'));
            concept.path = `/uploads/stand-design/generated/${filename}`;
        }

        concepts.push(concept);
    }

    return concepts;
}

async function persistGeneratedViews(designId, conceptId, generatedImages = [], metadata = []) {
    const inlineMode = shouldInlineGeneratedAssets();
    if (!inlineMode) {
        await fs.mkdir(GENERATED_DIR, { recursive: true });
    }

    const views = [];
    for (let index = 0; index < generatedImages.length; index += 1) {
        const generated = generatedImages[index];
        const imageBytes = generated?.image?.imageBytes;
        if (!imageBytes) continue;
        const mimeType = normalizeText(generated?.image?.mimeType || 'image/png') || 'image/png';
        const meta = metadata[index] || {};
        const angle = normalizeText(meta.angle) || `view-${index + 1}`;
        const view = {
            id: normalizeText(meta.id) || `${conceptId}-${angle}`,
            label: normalizeText(meta.label) || `View ${index + 1}`,
            angle,
            path: inlineMode ? toInlineDataUrl(mimeType, imageBytes) : '',
            mimeType,
            created_at: new Date().toISOString(),
        };

        if (!inlineMode) {
            const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
            const filename = `${designId}-${conceptId}-${angle}-${Date.now()}.${extension}`;
            const absolutePath = path.join(GENERATED_DIR, filename);
            await fs.writeFile(absolutePath, Buffer.from(imageBytes, 'base64'));
            view.path = `/uploads/stand-design/generated/${filename}`;
        }

        views.push(view);
    }

    return views;
}

export async function removeStandDesignAssets(record) {
    const conceptPaths = Array.isArray(record?.concepts)
        ? record.concepts.flatMap((concept) => {
            const mainPath = normalizeText(concept?.path);
            const viewPaths = Array.isArray(concept?.views)
                ? concept.views.map((view) => normalizeText(view?.path)).filter(Boolean)
                : [];
            return [mainPath, ...viewPaths].filter(Boolean);
        })
        : [];
    await Promise.all(conceptPaths.map(async (publicPath) => {
        try {
            if (isDataUrl(publicPath)) {
                return;
            }
            const absolutePath = resolvePublicFile(publicPath);
            await fs.unlink(absolutePath);
        } catch {}
    }));
}

export async function generateStandDesignConcepts({
    designId,
    mode,
    prompt,
    brief = {},
    stylePreset,
    angle = '',
    refinementPrompt = '',
    referenceImagePath = '',
    conceptIndexes = [0, 1],
}) {
    const configuredModel = getStandDesignModel();
    if (!configuredModel) {
        throw new Error('Gemini image model is not configured. Set GEMINI_IMAGE_MODEL on the server.');
    }

    const ai = getAiClient();
    const preset = getStandDesignStylePreset(stylePreset);
    const normalizedBrief = normalizeStandDesignBrief(brief);
    const briefPrompt = buildStandDesignStructuredPrompt(normalizedBrief);
    const combinedPrompt = [briefPrompt, normalizeText(prompt)].filter(Boolean).join('\n\n');
    const normalizedIndexes = Array.isArray(conceptIndexes) && conceptIndexes.length > 0 ? conceptIndexes : [0, 1];

    let response;
    let generatedImages;
    let resolvedModel = configuredModel;
    if (isGeminiPreviewImageModel(configuredModel)) {
        generatedImages = [];
        for (const index of normalizedIndexes) {
            const concept = await generateGeminiPreviewConcept({
                ai,
                prompt: combinedPrompt,
                brief: normalizedBrief,
                stylePreset,
                angle,
                refinementPrompt,
                mode,
                referenceImagePath,
                variantIndex: Number(index) || 0,
            });
            resolvedModel = concept.model || resolvedModel;
            generatedImages.push(concept.image);
        }
    } else {
        const normalizedPrompt = buildPrompt({
            prompt: combinedPrompt,
            stylePreset,
            angle,
            refinementPrompt,
            mode,
        });
        if (mode === 'edit') {
            const referenceImage = await loadReferenceImage(referenceImagePath);
            response = await ai.models.editImage({
                model: configuredModel,
                prompt: normalizedPrompt,
                referenceImages: [{ referenceImage }],
                config: {
                    numberOfImages: normalizedIndexes.length,
                    aspectRatio: '16:9',
                    outputMimeType: 'image/png',
                    guidanceScale: preset.guidanceScale,
                },
            });
        } else {
            response = await ai.models.generateImages({
                model: configuredModel,
                prompt: normalizedPrompt,
                config: {
                    numberOfImages: normalizedIndexes.length,
                    aspectRatio: '16:9',
                    outputMimeType: 'image/png',
                    guidanceScale: preset.guidanceScale,
                },
            });
        }
        generatedImages = Array.isArray(response?.generatedImages) ? response.generatedImages.filter((item) => item?.image?.imageBytes) : [];
    }

    if (generatedImages.length !== normalizedIndexes.length) {
        throw new Error('Gemini did not return the expected concept images. Please refine the prompt and try again.');
    }

    const conceptMetadata = normalizedIndexes.map((conceptIndex) => ({
        id: `concept-${Number(conceptIndex) + 1}`,
        title: getConceptDirectionLabel(Number(conceptIndex)),
        summary: getConceptDirectionSummary(Number(conceptIndex)),
        refinement_prompt: refinementPrompt,
        source_variant: Number(conceptIndex) === 0 ? 'premium-gallery' : 'sculpted-journey',
        prompt: combinedPrompt,
        coverage: buildStandDesignCoverageSummary(normalizedBrief),
    }));
    const concepts = await persistGeneratedConcepts(designId, generatedImages, conceptMetadata);
    if (concepts.length !== normalizedIndexes.length) {
        throw new Error('Failed to store generated concept images');
    }

    return {
        concepts,
        provider: 'google-genai',
        model: resolvedModel,
        prompt: combinedPrompt,
        brief_summary: summarizeStandDesignBrief(normalizedBrief),
    };
}

export async function generateStandDesignConceptViews({
    designId,
    conceptId,
    conceptTitle = '',
    prompt,
    brief = {},
    stylePreset,
    conceptPath,
}) {
    const configuredModel = getStandDesignModel();
    if (!configuredModel) {
        throw new Error('Gemini image model is not configured. Set GEMINI_IMAGE_MODEL on the server.');
    }

    const referenceImagePath = normalizeText(conceptPath);
    if (!referenceImagePath) {
        throw new Error('Selected concept image is required to generate all views.');
    }

    const ai = getAiClient();
    const normalizedBrief = normalizeStandDesignBrief(brief);
    const briefPrompt = buildStandDesignStructuredPrompt(normalizedBrief);
    const combinedPrompt = [briefPrompt, normalizeText(prompt)].filter(Boolean).join('\n\n');
    const viewsConfig = [
        {
            angle: 'front',
            label: 'Front View',
            cameraInstruction: [
                'CLOCK POSITION: 12 o\'clock — directly in front of the stand.',
                'ELEVATION: Human eye level, 1.6 m above the floor.',
                'DIRECTION: Camera faces the main entrance head-on. Zero diagonal. Zero rotation. Perfectly perpendicular to the entrance facade.',
                'VISIBLE in this frame: Main entrance face, primary brand fascia / signage panel facing forward, reception counter front face, any entrance arch or columns, front-facing screens, and the full entrance width from edge to edge.',
                'NOT VISIBLE: Side walls, rear wall, interior ceiling, or any overhead aerial angle. This is a flat architectural front-elevation, not a perspective render.',
                'Think of it as a professional architectural elevation photograph taken from directly in front — the kind used in technical drawings.',
            ].join(' '),
        },
        {
            angle: 'back',
            label: 'Back View',
            cameraInstruction: [
                'CLOCK POSITION: 6 o\'clock — directly BEHIND the stand, on the opposite side from the main entrance.',
                'ELEVATION: Human eye level, 1.6 m above the floor.',
                'DIRECTION: You have walked all the way around to the back of the stand. The main entrance is 180 degrees behind you — it is facing the opposite direction and is NOT in this shot.',
                'Camera faces the REAR WALL of the stand head-on. Zero diagonal. Zero rotation.',
                'VISIBLE in this frame: Rear exterior wall surface, back panels, back side of any raised signage towers or fascia structures, rear columns, any service hatches or back-wall branding elements, and the full rear width from edge to edge.',
                'NOT VISIBLE and must NOT appear: The reception counter face, the main entrance opening, front-facing screens, or any front-side features. Those face the opposite direction.',
                'Think of it as photographing the BACK of a building — you see the rear facade, not the front.',
            ].join(' '),
        },
        {
            angle: 'side',
            label: 'Side View',
            cameraInstruction: [
                'CLOCK POSITION: 9 o\'clock — directly to the LEFT side of the stand.',
                'ELEVATION: Human eye level, 1.6 m above the floor.',
                'DIRECTION: Camera faces the left side wall squarely — perfectly perpendicular to the stand\'s side profile. Zero rotation toward the front or back. Zero diagonal.',
                'VISIBLE in this frame: Full left side wall from front edge to rear edge, the depth of the stand, stand height profile, left side columns or wall panels, any side-facing features (screens, graphics, or openings on the left side), and the floor-to-ceiling elevation of the stand in profile.',
                'NOT VISIBLE: The main entrance face (it faces 90° to the right of this camera), the rear wall (it faces 90° to the left of this camera). Only the side profile is visible.',
                'Think of it as a flat architectural side-elevation — like a profile drawing that shows stand depth and height.',
            ].join(' '),
        },
        {
            angle: 'perspective',
            label: 'Perspective View',
            cameraInstruction: [
                'CLOCK POSITION: 1–2 o\'clock — front-right corner of the stand at a 45-degree diagonal.',
                'ELEVATION: Slightly above eye level, approximately 2.5 m high, looking diagonally downward and inward toward the center of the stand.',
                'DIRECTION: Camera points toward the interior of the stand from the front-right corner, capturing both the main entrance face AND the right side wall simultaneously in one wide hero composition.',
                'VISIBLE in this frame: Main entrance face (left portion of frame), right side wall (right portion of frame), interior spatial depth, stand height, reception zone, screens, model display tables, meeting areas, VIP zone, flooring, ceiling elements, and brand identity across both visible faces.',
                'This is the premium client-presentation hero angle — the most commercially compelling and spatially informative view of the stand.',
            ].join(' '),
        },
    ];

    const generatedImages = [];
    let resolvedModel = configuredModel;
    if (isGeminiPreviewImageModel(configuredModel)) {
        for (const view of viewsConfig) {
            const userParts = [{
                text: buildConceptViewsPrompt({
                    prompt: combinedPrompt,
                    brief: normalizedBrief,
                    stylePreset,
                    conceptTitle,
                    angleLabel: view.label,
                    cameraInstruction: view.cameraInstruction,
                }),
            }];
            const referenceImage = await loadReferenceImage(referenceImagePath);
            userParts.push(createPartFromBase64(referenceImage.imageBytes, referenceImage.mimeType));
            const brandLogoPart = await loadOptionalInlinePart(normalizedBrief.logo_image_path);
            const brandReferencePart = await loadOptionalInlinePart(normalizedBrief.brand_reference_image_path);
            if (brandLogoPart) userParts.push(brandLogoPart);
            if (brandReferencePart) userParts.push(brandReferencePart);

            const result = await generateGeminiPreviewWithFallback({ ai, userParts });
            resolvedModel = result.model || resolvedModel;
            const image = result.image;
            if (!image) {
                throw new Error(`Gemini did not return the ${view.label.toLowerCase()} image.`);
            }
            generatedImages.push(image);
        }
    } else {
        const preset = getStandDesignStylePreset(stylePreset);
        const referenceImage = await loadReferenceImage(referenceImagePath);
        for (const view of viewsConfig) {
            const response = await ai.models.editImage({
                model: configuredModel,
                prompt: buildConceptViewsPrompt({
                    prompt: combinedPrompt,
                    brief: normalizedBrief,
                    stylePreset,
                    conceptTitle,
                    angleLabel: view.label,
                    cameraInstruction: view.cameraInstruction,
                }),
                referenceImages: [{ referenceImage }],
                config: {
                    numberOfImages: 1,
                    aspectRatio: '16:9',
                    outputMimeType: 'image/png',
                    guidanceScale: preset.guidanceScale,
                },
            });
            const image = Array.isArray(response?.generatedImages) ? response.generatedImages.find((item) => item?.image?.imageBytes) : null;
            if (!image) {
                throw new Error(`Gemini did not return the ${view.label.toLowerCase()} image.`);
            }
            generatedImages.push(image);
        }
    }

    const views = await persistGeneratedViews(
        designId,
        conceptId,
        generatedImages,
        viewsConfig.map((view) => ({
            id: `${conceptId}-${view.angle}`,
            label: view.label,
            angle: view.angle,
        })),
    );

    if (views.length !== viewsConfig.length) {
        throw new Error('Failed to store generated concept views');
    }

    return {
        views,
        provider: 'google-genai',
        model: resolvedModel,
        prompt: combinedPrompt,
    };
}
