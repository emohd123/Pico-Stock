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

    return [
        // Camera instruction is the #1 directive — placed first so the model weights it highest
        `CAMERA ANGLE: ${cameraInstruction}`,
        `This image must show the exhibition stand strictly from this camera position. Do not change the viewing angle or deviate from the specified direction.`,

        // Identity preservation — same stand, only viewpoint changes
        `Render the exact same exhibition stand concept shown in the reference image: "${normalizeText(conceptTitle) || 'Selected Concept'}".`,
        'CRITICAL: Preserve every design detail from the reference — the same stand architecture, zoning, structural forms, reception area, signage, screens, model display, meeting areas, VIP zones, materials, brand colors, and overall layout identity. Only the camera viewpoint changes. Do not redesign, simplify, or invent new elements.',

        // Style consistency
        `Maintain the same rendering style: ${preset.label}. ${preset.promptModifier}`,

        // Brief constraints (keep structural fidelity)
        normalizedBrief.stand_size ? `Footprint must remain: ${normalizedBrief.stand_size}.` : '',
        normalizedBrief.stand_type ? `Stand type must remain: ${normalizedBrief.stand_type}.` : '',
        normalizedBrief.open_sides ? `Open-sides access logic must remain: ${normalizedBrief.open_sides}.` : '',
        normalizedBrief.brand_colors ? `Brand color palette must remain: ${normalizedBrief.brand_colors}.` : '',

        // Output format
        'Output one single professional client-presentation-quality architectural render. No collages, no split frames, no text overlays, no side-by-side comparisons.',
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
            cameraInstruction: 'Camera placed directly in front of the stand, centered on the main entrance facade, at human eye level (approx. 1.6m). The camera faces the front wall head-on — no diagonal, no rotation, no tilt. This is a flat architectural front-elevation view showing the full width of the entrance, main signage, and reception face-on.',
        },
        {
            angle: 'back',
            label: 'Back View',
            cameraInstruction: 'Camera placed directly behind the stand, centered on the rear facade, at human eye level (approx. 1.6m). The camera faces the back wall head-on — no diagonal, no rotation. This is a flat rear-elevation view showing the full width of the back wall, rear service areas, and any back-of-stand features.',
        },
        {
            angle: 'side',
            label: 'Side View',
            cameraInstruction: 'Camera placed 90 degrees to the left side of the stand, centered on the left side wall, at human eye level (approx. 1.6m). The camera is perpendicular to the front facade, facing the side profile directly — no diagonal, no tilt. This is a flat side-elevation view showing the stand depth, side wall height, and side-facing features.',
        },
        {
            angle: 'perspective',
            label: 'Perspective View',
            cameraInstruction: 'Camera placed at a 45-degree corner angle from the front-right corner of the stand, slightly elevated above eye level (approx. 2.5m), looking diagonally inward toward the stand. This is the hero 3/4 perspective view simultaneously showing the front facade and the right side wall — the most dramatic and commercially compelling presentation angle.',
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
