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

    // Per-angle hard DO NOT block — prevents the model from anchoring to the reference image's angle
    const angleDoNotBlock = (() => {
        if (angleLabel === 'Front View') {
            return [
                'DO NOT for Front View:',
                '• Do NOT elevate the camera above eye level or look downward — this is NOT an aerial or bird\'s-eye shot.',
                '• Do NOT rotate the camera diagonally — the camera faces the entrance perfectly straight.',
                '• Do NOT show a side wall in this frame — if a side wall is visible, you have the wrong angle.',
                '• Do NOT copy the camera angle from the reference image — the reference angle is irrelevant.',
                'CORRECT: Flat, straight-on, eye-level architectural front elevation. Camera at 12 o\'clock, horizontal axis, looking at the entrance face only.',
            ].join('\n');
        }
        if (angleLabel === 'Back View') {
            return [
                'DO NOT for Back View:',
                '• Do NOT show the main entrance, the reception counter face, or any front-facing signage.',
                '• Do NOT render a front view or a diagonal view — the main entrance must NOT be visible.',
                '• Do NOT copy the camera angle from the reference image — the reference angle is irrelevant.',
                'CORRECT: Flat, straight-on, eye-level view of the rear wall from directly behind the stand (6 o\'clock). Camera faces the back wall only.',
            ].join('\n');
        }
        if (angleLabel === 'Side View') {
            return [
                'DO NOT for Side View:',
                '• Do NOT show the front entrance face — the entrance wall is 90° to the right and is NOT visible.',
                '• Do NOT elevate the camera above eye level — this is NOT an aerial shot.',
                '• Do NOT rotate the camera toward the front or back — the camera axis points directly at the left side wall.',
                '• Do NOT copy the camera angle from the reference image — the reference angle is irrelevant.',
                'CORRECT: Flat side profile, eye-level. Camera at 9 o\'clock position, perpendicular to the left side wall, showing the stand depth from front to back as a flat elevation.',
            ].join('\n');
        }
        if (angleLabel === 'Perspective View') {
            return [
                'DO NOT for Perspective View:',
                '• Do NOT show only the side wall from a flat angle — this is NOT a side elevation.',
                '• Do NOT position the camera directly in front (that is the Front View).',
                '• Do NOT copy the camera angle from the reference image — the reference angle is irrelevant.',
                'CORRECT: Camera at the front-RIGHT corner (1-2 o\'clock), elevated to 2.5m, looking diagonally inward at 45°. Both the front entrance face AND the right side wall are simultaneously visible in a dramatic hero composition.',
            ].join('\n');
        }
        return '';
    })();

    return [
        // ── 1. MANDATORY CAMERA POSITION ────────────────────────────────────
        `TARGET CAMERA ANGLE — ${angleLabel}:\n${cameraInstruction}`,
        'RULE: Render the stand from EXACTLY the camera position described above. The reference image\'s camera angle is IRRELEVANT and must be completely DISCARDED. Do not copy or inherit the viewpoint from the reference image in any way.',

        // ── 2. Hard DO NOT block per angle ───────────────────────────────────
        angleDoNotBlock,

        // ── 3. Design identity from reference (architecture only, not angle) ─
        `DESIGN SOURCE: Use the reference image for "${normalizeText(conceptTitle) || 'the concept'}" to reproduce the stand's architectural design, structural forms, materials, brand colors, signage style, and spatial zones — but render all of this from the new camera position above.`,
        'Preserve: stand structure, reception area, signage, screens, model display tables, meeting areas, VIP zones, flooring, materials, and brand color palette. Do not redesign or simplify any element.',

        // ── 4. Style ─────────────────────────────────────────────────────────
        `Rendering style: ${preset.label}. ${preset.promptModifier}`,

        // ── 5. Brief constraints ─────────────────────────────────────────────
        normalizedBrief.stand_size ? `Stand footprint: ${normalizedBrief.stand_size}.` : '',
        normalizedBrief.stand_type ? `Stand type: ${normalizedBrief.stand_type}.` : '',
        normalizedBrief.open_sides ? `Open sides: ${normalizedBrief.open_sides}.` : '',
        normalizedBrief.brand_colors ? `Brand colors: ${normalizedBrief.brand_colors}.` : '',

        // ── 6. Output ─────────────────────────────────────────────────────────
        'Output: one single professional client-presentation-quality architectural render. No collages, no split frames, no text overlays, no side-by-side comparisons.',
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
                'Position: 12 o\'clock — standing directly in front of the stand on the exhibition hall floor.',
                'Height: Camera at human eye level, 1.6 m. Camera axis is perfectly horizontal — NOT angled downward.',
                'Direction: Camera points straight at the main entrance facade, perpendicular. Zero diagonal. Zero side rotation.',
                'Frame content: The entrance face fills the frame edge-to-edge. Main brand signage faces you. Reception counter faces you. Any front-facing screens face you.',
                'What is NOT in frame: Side walls. If you can see a side wall, the angle is wrong. Rear wall. Overhead ceiling.',
                'This is a flat architectural front-elevation — like an architect\'s technical elevation drawing rendered in 3D.',
            ].join(' '),
        },
        {
            angle: 'back',
            label: 'Back View',
            cameraInstruction: [
                'Position: 6 o\'clock — standing directly BEHIND the stand, on the OPPOSITE side from the main entrance.',
                'Height: Camera at human eye level, 1.6 m. Camera axis is perfectly horizontal.',
                'Direction: Camera points straight at the rear wall of the stand. The main entrance is 180° behind you and completely out of frame.',
                'Frame content: Rear wall surface fills the frame. Back panels, rear columns, back of any signage towers or fascia structures visible from behind.',
                'What is NOT in frame: Main entrance, reception counter, front-facing screens. Those face the opposite direction and are not visible from behind.',
                'This is a flat architectural rear-elevation — photographing the back of the stand as if it were the back of a building.',
            ].join(' '),
        },
        {
            angle: 'side',
            label: 'Side View',
            cameraInstruction: [
                'Position: 9 o\'clock — standing directly to the LEFT side of the stand, on the exhibition hall floor.',
                'Height: Camera at human eye level, 1.6 m. Camera axis is perfectly horizontal — NOT angled downward.',
                'Direction: Camera points straight at the left side wall, perpendicular. The stand\'s depth extends away from the camera (front-to-back runs left-to-right in frame). Zero rotation toward the front or back. Zero diagonal.',
                'Frame content: Left side wall fills the frame. Stand depth (front-edge to rear-edge) is visible as a flat profile. Stand full height visible. Left-side columns or panels.',
                'What is NOT in frame: The main entrance face (that is 90° to the right — NOT visible). The rear wall (90° to the left — NOT visible).',
                'This is a flat architectural side-elevation — a true 90° side profile as seen in technical drawings.',
            ].join(' '),
        },
        {
            angle: 'perspective',
            label: 'Perspective View',
            cameraInstruction: [
                'Position: 1-2 o\'clock — front-RIGHT corner, diagonally between the front face and the right side wall.',
                'Height: Camera elevated to approximately 2.5 m, angled slightly downward toward the stand interior.',
                'Direction: Camera points diagonally inward at 45° toward the center of the stand. Both the front entrance face (left side of frame) and the right side wall (right side of frame) are simultaneously visible.',
                'Frame content: Main entrance and branding on the left, right side wall on the right, full interior depth visible — reception, screens, model tables, meeting area, VIP zone, flooring, ceiling height, spatial volume.',
                'This is the hero presentation shot — premium, dramatic, showing maximum stand detail in one compelling frame.',
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
