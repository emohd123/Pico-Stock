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
        'Create one professional exhibition stand concept render for client presentation.',
        `Style direction: ${preset.label}. ${preset.promptModifier}`,
        `Client brief:\n${cleanedPrompt}`,
    ];

    if (angle) {
        parts.push(`Preferred angle: ${angle}.`);
    }

    if (mode === 'edit') {
        parts.push('Use the reference image as the base and refine it instead of replacing it with an unrelated concept.');
    }

    if (normalizeText(refinementPrompt)) {
        parts.push(`Refinement request: ${normalizeText(refinementPrompt)}`);
    }

    parts.push('Return one commercially credible standalone concept image only.');
    return parts.join('\n\n');
}

function buildConceptVariantPrompt(basePrompt, variantIndex, brief = {}) {
    const variantNotes = variantIndex === 0
        ? 'Concept direction 1: polished, premium, highly client-facing, with very clear zoning and strong brand hierarchy.'
        : 'Concept direction 2: more design-forward but still practical, with stronger sculptural moments and a more memorable visitor journey.';
    const normalizedBrief = normalizeStandDesignBrief(brief);
    const layoutPriorities = [
        normalizedBrief.stand_size ? `Respect the stand footprint: ${normalizedBrief.stand_size}.` : '',
        normalizedBrief.stand_type ? `Respect the stand type: ${normalizedBrief.stand_type}.` : '',
        normalizedBrief.open_sides ? `Honor the access/open-sides requirement: ${normalizedBrief.open_sides}.` : '',
        normalizedBrief.partial_open_side_details ? `Honor the semi-open wall requirement: ${normalizedBrief.partial_open_side_details}.` : '',
        normalizedBrief.screen_requirements ? `Place the required digital screens accurately: ${normalizedBrief.screen_requirements}.` : '',
        normalizedBrief.reception_requirements ? `Include the reception zone accurately: ${normalizedBrief.reception_requirements}.` : '',
        normalizedBrief.model_display_requirements ? `Include the project model display logic: ${normalizedBrief.model_display_requirements}.` : '',
        normalizedBrief.meeting_requirements ? `Preserve meeting/discussion seating requirements: ${normalizedBrief.meeting_requirements}.` : '',
        normalizedBrief.vip_requirements ? `Preserve the VIP zone requirements: ${normalizedBrief.vip_requirements}.` : '',
        normalizedBrief.flooring_requirements ? `Use the requested flooring direction: ${normalizedBrief.flooring_requirements}.` : '',
        normalizedBrief.accessibility_requirements ? `Include accessibility requirements: ${normalizedBrief.accessibility_requirements}.` : '',
        normalizedBrief.avoid_notes ? `Avoid these elements: ${normalizedBrief.avoid_notes}.` : '',
    ].filter(Boolean).join('\n');

    return [
        basePrompt,
        variantNotes,
        'Prioritize buildable booth architecture, clear zoning, premium materials, disciplined branding, and commercial realism before dramatic styling.',
        layoutPriorities,
        'Do not return a collage, moodboard, split frame, text panel, or multiple variations in one image.',
    ].filter(Boolean).join('\n\n');
}

function buildConceptViewsPrompt({ prompt, brief, stylePreset, conceptTitle, angleLabel }) {
    const normalizedBrief = normalizeStandDesignBrief(brief);
    const basePrompt = buildPrompt({
        prompt,
        stylePreset,
        angle: angleLabel,
        refinementPrompt: '',
        mode: 'edit',
    });

    return [
        basePrompt,
        `Generate a consistent ${angleLabel.toLowerCase()} render of the same selected exhibition stand concept: ${normalizeText(conceptTitle) || 'Selected Concept'}.`,
        'Keep the same stand architecture, reception, screens, model display zones, VIP/discussion areas, materials, branding family, and overall design identity from the reference concept image.',
        'Do not invent a new concept or change the layout logic. This must be the same stand shown from a different accurate view.',
        normalizedBrief.stand_size ? `Preserve the same footprint: ${normalizedBrief.stand_size}.` : '',
        normalizedBrief.stand_type ? `Preserve the same stand type: ${normalizedBrief.stand_type}.` : '',
        normalizedBrief.open_sides ? `Preserve the same open-sides access logic: ${normalizedBrief.open_sides}.` : '',
        'Return one single professional client-facing render image only.',
    ].filter(Boolean).join('\n\n');
}

function resolvePublicFile(publicPath) {
    const cleanPath = normalizeText(publicPath);
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
    const absolutePath = resolvePublicFile(publicPath);
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
                    imageConfig: {
                        aspectRatio: '16:9',
                        imageSize: '1K',
                    },
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
            if (!isRetryableProviderError(error)) {
                throw error;
            }
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
    await fs.mkdir(GENERATED_DIR, { recursive: true });

    const concepts = [];
    for (let index = 0; index < generatedImages.length; index += 1) {
        const generated = generatedImages[index];
        const imageBytes = generated?.image?.imageBytes;
        if (!imageBytes) continue;
        const mimeType = normalizeText(generated?.image?.mimeType || 'image/png') || 'image/png';
        const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
        const filename = `${designId}-${Date.now()}-${index + 1}.${extension}`;
        const absolutePath = path.join(GENERATED_DIR, filename);
        await fs.writeFile(absolutePath, Buffer.from(imageBytes, 'base64'));
        const meta = metadata[index] || {};
        concepts.push({
            id: normalizeText(meta.id) || `concept-${index + 1}`,
            path: `/uploads/stand-design/generated/${filename}`,
            mimeType,
            title: normalizeText(meta.title) || `Concept ${index + 1}`,
            summary: normalizeText(meta.summary),
            refinement_prompt: normalizeText(meta.refinement_prompt),
            source_variant: normalizeText(meta.source_variant),
            prompt: normalizeText(meta.prompt),
            coverage: Array.isArray(meta.coverage) ? meta.coverage : [],
            created_at: new Date().toISOString(),
        });
    }

    return concepts;
}

async function persistGeneratedViews(designId, conceptId, generatedImages = [], metadata = []) {
    await fs.mkdir(GENERATED_DIR, { recursive: true });

    const views = [];
    for (let index = 0; index < generatedImages.length; index += 1) {
        const generated = generatedImages[index];
        const imageBytes = generated?.image?.imageBytes;
        if (!imageBytes) continue;
        const mimeType = normalizeText(generated?.image?.mimeType || 'image/png') || 'image/png';
        const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
        const meta = metadata[index] || {};
        const angle = normalizeText(meta.angle) || `view-${index + 1}`;
        const filename = `${designId}-${conceptId}-${angle}-${Date.now()}.${extension}`;
        const absolutePath = path.join(GENERATED_DIR, filename);
        await fs.writeFile(absolutePath, Buffer.from(imageBytes, 'base64'));
        views.push({
            id: normalizeText(meta.id) || `${conceptId}-${angle}`,
            label: normalizeText(meta.label) || `View ${index + 1}`,
            angle,
            path: `/uploads/stand-design/generated/${filename}`,
            mimeType,
            created_at: new Date().toISOString(),
        });
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
        { angle: 'front', label: 'Front View' },
        { angle: 'back', label: 'Back View' },
        { angle: 'side', label: 'Side View' },
        { angle: 'perspective', label: 'Perspective View' },
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
