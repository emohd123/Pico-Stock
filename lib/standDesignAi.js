import { promises as fs } from 'fs';
import path from 'path';
import { GoogleGenAI, createPartFromBase64 } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { getStandDesignStylePreset } from '@/lib/standDesignConfig';
import {
    buildStandDesignCoverageSummary,
    buildStandDesignStructuredPrompt,
    getConceptDirectionLabel,
    getConceptDirectionSummary,
    normalizeStandDesignBrief,
    summarizeStandDesignBrief,
} from '@/lib/standDesignBrief';
import { getStandDesignAssetPalette, getStandDesignMaterialPalette, getStandDesignPrimitivePalette } from '@/lib/standDesignAssetRegistry';
import {
    buildStandDesignSceneJsonSchema,
    createHeuristicStandScene,
    enrichStandDesignSceneAssemblies,
    validateStandDesignScene,
} from '@/lib/standDesignScene';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const GENERATED_DIR = path.join(UPLOADS_DIR, 'stand-design', 'generated');
const SUPABASE_STORAGE_BUCKET = normalizeText(process.env.STAND_DESIGN_STORAGE_BUCKET || 'stand-design-assets');
const SUPABASE_STORAGE_ENABLED = Boolean(
    normalizeText(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    normalizeText(process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
);
const GEMINI_PREVIEW_TIMEOUT_MS = Number(process.env.STAND_DESIGN_GEMINI_TIMEOUT_MS || 45000);

// Module-level cache: observation results keyed by image URL (in-process, per server instance)
const _observationCache = new Map();
let supabaseStorageClient = null;

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
    if (SUPABASE_STORAGE_ENABLED) {
        return false;
    }
    return process.env.VERCEL === '1' || /^true$/i.test(normalizeText(process.env.STAND_DESIGN_INLINE_IMAGES || ''));
}

function shouldFallbackToLocalGeneratedAssets() {
    return process.env.VERCEL !== '1';
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

function getSupabaseStorageClient() {
    if (!SUPABASE_STORAGE_ENABLED) return null;
    if (!supabaseStorageClient) {
        supabaseStorageClient = createClient(
            normalizeText(process.env.NEXT_PUBLIC_SUPABASE_URL),
            normalizeText(process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
            { auth: { persistSession: false, autoRefreshToken: false } },
        );
    }
    return supabaseStorageClient;
}

async function ensureStandDesignStorageBucket() {
    return SUPABASE_STORAGE_ENABLED;
}

function buildSupabaseAssetPath(...parts) {
    return parts
        .map((part) => normalizeText(part))
        .filter(Boolean)
        .join('/')
        .replace(/\/{2,}/g, '/');
}

async function uploadGeneratedAssetToStorage({ storagePath, mimeType, imageBytes, cacheControl = '3600' }) {
    const supabase = getSupabaseStorageClient();
    const binary = Buffer.from(imageBytes, 'base64');
    const { error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).upload(storagePath, binary, {
        contentType: mimeType,
        upsert: true,
        cacheControl,
    });
    if (error) {
        const message = normalizeText(error.message);
        if (/not found|bucket/i.test(message)) {
            throw new Error(`Supabase storage bucket "${SUPABASE_STORAGE_BUCKET}" is missing. Create it in Supabase Storage and redeploy.`);
        }
        throw new Error(`Supabase storage upload failed: ${message || 'Unknown error'}`);
    }
    const { data } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(storagePath);
    return normalizeText(data?.publicUrl);
}

async function persistAssetToLocalFile({ designId, conceptId = '', suffix = '', mimeType, imageBytes }) {
    await fs.mkdir(GENERATED_DIR, { recursive: true });
    const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
    const filename = [designId, conceptId, suffix || Date.now(), `${Date.now()}.${extension}`]
        .filter(Boolean)
        .join('-')
        .replace(/-+/g, '-');
    const absolutePath = path.join(GENERATED_DIR, filename);
    await fs.writeFile(absolutePath, Buffer.from(imageBytes, 'base64'));
    return `/uploads/stand-design/generated/${filename}`;
}

function extractSupabaseStorageObjectPath(publicUrl) {
    const cleanUrl = normalizeText(publicUrl);
    if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) return '';
    try {
        const parsed = new URL(cleanUrl);
        const marker = `/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/`;
        const index = parsed.pathname.indexOf(marker);
        if (index === -1) return '';
        return decodeURIComponent(parsed.pathname.slice(index + marker.length));
    } catch {
        return '';
    }
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

function buildBrandMaterialGuidance(brief = {}) {
    const normalizedBrief = normalizeStandDesignBrief(brief);
    const p = normalizeText(normalizedBrief.brand_primary || normalizedBrief.brand_colors || '');
    const s = normalizeText(normalizedBrief.brand_secondary || '');
    if (!p && !s) return '';
    const lines = ['BRAND COLOR REQUIREMENTS (mandatory — must be reflected in material colors):'];
    if (p) lines.push(`  • Primary brand color: "${p}" — use for branded_wall, fascia, logo_beam, arch_band, portal_leg accent surfaces`);
    if (s) lines.push(`  • Secondary brand color: "${s}" — use for counter, plinth accent surfaces, planter`);
    lines.push('  • Neutral/background objects may use gallery-white (#f2ede3) or anodized-aluminum.');
    lines.push('  • Every branded_wall, fascia, and logo_beam MUST set material.color to the primary brand color or a close tint/shade of it.');
    return lines.join('\n');
}

function buildSceneGenerationPrompt({ brief = {}, conceptTitle = '', conceptSummary = '', conceptIndex = 0 }) {
    const normalizedBrief = normalizeStandDesignBrief(brief);
    // Machine-readable registry — exact keys/types the validator accepts
    const primitiveLines = getStandDesignPrimitivePalette()
        .map((item) => `  primitive | type="${item.type}" | label="${item.label}" | w=${item.dimensions.width} h=${item.dimensions.height} d=${item.dimensions.depth}`)
        .join('\n');
    const assetLines = getStandDesignAssetPalette()
        .map((item) => `  asset | asset_key="${item.key}" | type="${item.type}" | label="${item.label}" | w=${item.dimensions.width} h=${item.dimensions.height} d=${item.dimensions.depth}`)
        .join('\n');
    const materialPalette = getStandDesignMaterialPalette()
        .map((item) => `${item.id} (${item.label})`)
        .join(', ');
    const brandGuidance = buildBrandMaterialGuidance(normalizedBrief);

    return [
        'You are an exhibition-stand 3D planning assistant. Convert the selected stand concept into a precise scene JSON for a Three.js editor.',
        'Return JSON only. No markdown, no commentary, no trailing text.',
        'Use layout accuracy first: respect the stand footprint, zoning, circulation, open sides, VIP area, reception area, screen placement, project models, meeting tables, and ramp when present in the brief.',
        `Selected concept: ${normalizeText(conceptTitle) || `Concept ${Number(conceptIndex) + 1}`}. ${normalizeText(conceptSummary)}`,
        `Structured brief:\n${buildStandDesignStructuredPrompt(normalizedBrief)}`,
        brandGuidance,
        `AVAILABLE OBJECTS — use ONLY these exact type/asset_key values (no others are valid):\nPRIMITIVES (kind="primitive", do NOT set asset_key):\n${primitiveLines}`,
        `ASSETS (kind="asset", must set asset_key exactly as shown):\n${assetLines}`,
        `Allowed material preset IDs (for material.preset_id): ${materialPalette}.`,
        'Rules:',
        '- Generate a dense architectural scene with 10 to 20 meaningful structural/layout objects whenever the stand complexity allows it.',
        '- Always include a dedicated floor/base object and essential structural walls, beams, partitions, or enclosures so the stand has a real architectural foundation.',
        '- Use kind "primitive" only with a type from the PRIMITIVES list above.',
        '- Use kind "asset" only with an asset_key from the ASSETS list above — no other values are valid.',
        '- Use the plane primitive for thin partitions, glass panels, branding fins, slim feature walls, or flooring overlays.',
        '- Use material.preset_id whenever possible, and keep material color/metalness/roughness/opacity aligned with the selected image concept.',
        '- Use meter-like units.',
        '- Keep rotations in radians as [x, y, z].',
        '- Keep the scene centered around 0,0,0.',
        '- Lock major architecture objects like floor and main walls.',
        '- Do not output any unknown keys or unsupported object types.',
        '- Create a clean, editable scene with sensible object ids and labels.',
    ].filter(Boolean).join('\n\n');
}

function buildStandDesignReferenceObservationSchema() {
    return {
        type: 'object',
        additionalProperties: false,
        required: [
            'layout_summary',
            'major_structures',
            'zoned_elements',
            'anchor_objects',
            'open_edges',
            'materials_and_colors',
            'matching_notes',
            'match_camera',
            'scene_priorities',
            'estimated_visible_object_count',
        ],
        properties: {
            layout_summary: { type: 'string' },
            major_structures: {
                type: 'array',
                items: { type: 'string' },
            },
            zoned_elements: {
                type: 'array',
                items: { type: 'string' },
            },
            anchor_objects: {
                type: 'array',
                items: { type: 'string' },
            },
            open_edges: {
                type: 'array',
                items: { type: 'string' },
            },
            materials_and_colors: {
                type: 'array',
                items: { type: 'string' },
            },
            matching_notes: {
                type: 'array',
                items: { type: 'string' },
            },
            scene_priorities: {
                type: 'array',
                items: { type: 'string' },
            },
            estimated_visible_object_count: { type: 'number' },
            match_camera: {
                type: 'object',
                additionalProperties: false,
                required: ['preset', 'position', 'target'],
                properties: {
                    preset: { type: 'string' },
                    position: {
                        type: 'array',
                        items: { type: 'number' },
                        minItems: 3,
                        maxItems: 3,
                    },
                    target: {
                        type: 'array',
                        items: { type: 'number' },
                        minItems: 3,
                        maxItems: 3,
                    },
                },
            },
        },
    };
}

function normalizeReferenceObservations(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
        layout_summary: normalizeText(source.layout_summary),
        major_structures: Array.isArray(source.major_structures)
            ? source.major_structures.map((item) => normalizeText(item)).filter(Boolean)
            : [],
        zoned_elements: Array.isArray(source.zoned_elements)
            ? source.zoned_elements.map((item) => normalizeText(item)).filter(Boolean)
            : [],
        anchor_objects: Array.isArray(source.anchor_objects)
            ? source.anchor_objects.map((item) => normalizeText(item)).filter(Boolean)
            : [],
        open_edges: Array.isArray(source.open_edges)
            ? source.open_edges.map((item) => normalizeText(item)).filter(Boolean)
            : [],
        materials_and_colors: Array.isArray(source.materials_and_colors)
            ? source.materials_and_colors.map((item) => normalizeText(item)).filter(Boolean)
            : [],
        matching_notes: Array.isArray(source.matching_notes)
            ? source.matching_notes.map((item) => normalizeText(item)).filter(Boolean)
            : [],
        scene_priorities: Array.isArray(source.scene_priorities)
            ? source.scene_priorities.map((item) => normalizeText(item)).filter(Boolean)
            : [],
        estimated_visible_object_count: Number.isFinite(Number(source.estimated_visible_object_count))
            ? Math.max(0, Number(source.estimated_visible_object_count))
            : 0,
        match_camera: {
            preset: normalizeText(source.match_camera?.preset) || 'match',
            position: Array.isArray(source.match_camera?.position) ? source.match_camera.position.slice(0, 3) : [5.5, 4.2, 6.6],
            target: Array.isArray(source.match_camera?.target) ? source.match_camera.target.slice(0, 3) : [0, 1.5, 0],
        },
    };
}

function buildReconstructionStatus(score) {
    if (score >= 88) return 'ready';
    if (score >= 68) return 'needs-manual-correction';
    return 'exact-reconstruction-unavailable';
}

function scoreSceneAgainstReference(scene, referenceObservations, normalizedBrief, conceptViews = []) {
    const observation = normalizeReferenceObservations(referenceObservations);
    const objects = Array.isArray(scene?.objects) ? scene.objects : [];
    const objectLabels = objects.map((item) => normalizeText(`${item.label} ${item.type}`)).filter(Boolean).join(' ').toLowerCase();
    const notes = [];
    let score = 48;

    const visibleTarget = observation.estimated_visible_object_count;
    if (visibleTarget > 0) {
        const ratio = objects.length / visibleTarget;
        if (ratio >= 0.72 && ratio <= 1.45) {
            score += 12;
            notes.push(`Visible object density is close to the reference concept (${objects.length} scene objects vs ~${visibleTarget} visible reference elements).`);
        } else {
            notes.push(`Object density still needs manual review (${objects.length} scene objects vs ~${visibleTarget} visible reference elements).`);
        }
    }

    const structureHits = observation.major_structures.filter((item) => {
        const token = normalizeText(item).toLowerCase();
        return token && objectLabels.includes(token.split(/\s+/).slice(0, 2).join(' '));
    }).length;
    if (observation.major_structures.length) {
        const ratio = structureHits / observation.major_structures.length;
        score += Math.round(ratio * 18);
        if (ratio < 0.55) {
            notes.push('Major architectural forms still need manual correction to better match the reference silhouette.');
        } else {
            notes.push('Major architectural forms are reflected in the reconstruction.');
        }
    }

    const zoneSource = [
        normalizedBrief.screen_requirements && 'screen',
        normalizedBrief.reception_requirements && 'reception',
        normalizedBrief.model_display_requirements && 'model',
        normalizedBrief.vip_requirements && 'vip',
        normalizedBrief.meeting_requirements && 'meeting',
    ].filter(Boolean);
    const matchedZones = zoneSource.filter((zone) => objectLabels.includes(zone)).length;
    if (zoneSource.length) {
        const zoneRatio = matchedZones / zoneSource.length;
        score += Math.round(zoneRatio * 14);
        if (zoneRatio < 0.8) {
            notes.push('Some required functional zones are still approximate and should be checked manually.');
        } else {
            notes.push('Core functional zones from the brief are present in the scene.');
        }
    }

    if (Array.isArray(conceptViews) && conceptViews.length > 0) {
        score += 6;
        notes.push(`Reconstruction used ${conceptViews.length} auxiliary reference view${conceptViews.length > 1 ? 's' : ''} for better spatial consistency.`);
    } else {
        notes.push('Only the main concept render was available; side/back geometry may still need manual correction.');
    }

    const noteCount = observation.matching_notes.length;
    if (noteCount > 0) {
        score += Math.min(10, noteCount * 2);
    }

    // Structural completeness sub-score
    const structuralBonus = scoreStructuralCompleteness(objects);
    score += structuralBonus;
    if (structuralBonus < 15) {
        notes.push('Scene is missing some structural primitives (floor, walls, or branding elements).');
    }

    // Brand color fidelity sub-score
    const colorBonus = scoreBrandColorFidelity(objects, normalizedBrief);
    score += colorBonus;
    if (colorBonus === 0 && normalizedBrief) {
        notes.push('Branded objects do not appear to use the brief\'s primary brand color.');
    } else if (colorBonus >= 10) {
        notes.push('Brand color is well-reflected in branded architectural elements.');
    }

    // Object density sub-score
    const densityBonus = scoreObjectDensity(objects, scene?.footprint || {});
    score += densityBonus;
    if (densityBonus === 0) {
        notes.push('Object count seems low or high relative to the stand footprint size.');
    }

    return {
        score: Math.max(0, Math.min(99, score)),
        notes,
    };
}

function buildReferenceMatchedScenePrompt({
    brief = {},
    conceptTitle = '',
    conceptSummary = '',
    conceptIndex = 0,
    referenceObservations = null,
    referenceViewLabels = [],
}) {
    const basePrompt = buildSceneGenerationPrompt({
        brief,
        conceptTitle,
        conceptSummary,
        conceptIndex,
    });
    const observation = normalizeReferenceObservations(referenceObservations);
    const brandGuidance = buildBrandMaterialGuidance(brief);
    const sections = [
        basePrompt,
        brandGuidance,
        'IMAGE-FIRST MATCHING MODE: The attached concept render is the primary source of truth. Recreate the same stand architecture, zoning, circulation, and object placement as closely as possible in editable 3D scene form.',
        'If the brief and the image conflict, follow the image for visible architecture and use the brief only to fill hidden or ambiguous details.',
    ].filter(Boolean);

    if (referenceViewLabels.length) {
        sections.push(
            `Additional reference views are attached for the same stand: ${referenceViewLabels.join(', ')}. Reconcile all views into one consistent 3D scene. Do not average them into a generic layout.`,
        );
    }

    if (observation.layout_summary) {
        sections.push(`Observed layout summary:\n- ${observation.layout_summary}`);
    }
    if (observation.major_structures.length) {
        sections.push(`Observed major structures that must be matched:\n${observation.major_structures.map((item) => `- ${item}`).join('\n')}`);
    }
    if (observation.zoned_elements.length) {
        sections.push(`Observed zones and program elements that must be preserved:\n${observation.zoned_elements.map((item) => `- ${item}`).join('\n')}`);
    }
    if (observation.anchor_objects.length) {
        sections.push(`Visual anchor objects to place accurately:\n${observation.anchor_objects.map((item) => `- ${item}`).join('\n')}`);
    }
    if (observation.open_edges.length) {
        sections.push(`Open-edge / access observations:\n${observation.open_edges.map((item) => `- ${item}`).join('\n')}`);
    }
    if (observation.materials_and_colors.length) {
        sections.push(`Material and color cues to mirror in 3D:\n${observation.materials_and_colors.map((item) => `- ${item}`).join('\n')}`);
    }
    if (observation.matching_notes.length) {
        sections.push(`Exact-match notes:\n${observation.matching_notes.map((item) => `- ${item}`).join('\n')}`);
    }

    sections.push(
        'Exactness rules:',
        '- Preserve the observed stand silhouette and major architectural forms.',
        '- Preserve the relative left/center/right and front/back placement of visible zones.',
        '- Preserve the count and type of visible screens, counters, plinths, partitions, lounge pieces, and meeting furniture whenever they are clear in the reference image.',
        '- Prefer a richer object graph over a simplified generic booth.',
        '- Use between 10 and 20 structural/layout objects if needed to capture the architecture faithfully instead of collapsing large areas into a few boxes.',
        '- Treat the stand as assemblies, not isolated blocks: create a layered portal/canopy system, a branded rear wall/screen system, a reception assembly, and a central display island when they are visible in the concept.',
        '- Use explicit labels that describe the observed reference concept, not generic placeholders.',
        '- Assign meaningful group_id values to objects so the editor can organize them by zone, such as entry, branding, av, display, meeting, vip, perimeter, or core.',
        '- Encode material treatment intentionally: warm timber/parquet floors, premium light wall finishes, metallic gold accents, illuminated fascia strips, polished obsidian AV housings, anodized aluminum frames, red velvet focal touches when the reference indicates them, and branded feature faces whenever the reference indicates them.',
        '- Use branded_wall, fascia, logo_beam, arch_band, portal_leg, screen_cluster_wall, counter, plinth, lounge_enclosure, wall, and plane primitives when they visually match the reference better than generic wall or box objects.',
        '- Architectural digital twin rule: the same colors, material families, and zoning visible in the concept render must be reflected in the scene JSON.',
    );

    return sections.filter(Boolean).join('\n\n');
}

function buildReferenceObservationPrompt({
    brief = {},
    conceptTitle = '',
    conceptSummary = '',
    referenceViewLabels = [],
}) {
    const normalizedBrief = normalizeStandDesignBrief(brief);
    const sections = [
        'Analyze the attached stand concept image(s) and extract the visible layout truth for a later 3D reconstruction.',
        'Return JSON only. No markdown, no commentary.',
        `Selected concept: ${normalizeText(conceptTitle) || 'Stand concept'}. ${normalizeText(conceptSummary)}`,
        `Structured brief:\n${buildStandDesignStructuredPrompt(normalizedBrief)}`,
        'Focus on what is actually visible in the image(s): architecture, zoning, open sides, counters, screens, plinths, lounge areas, meeting furniture, partitions, ramps, canopies, signage, and material cues.',
        'Also estimate a match camera that would reproduce the same reference view inside a 3D editor. Return camera position and target in meter-like coordinates relative to the stand center.',
        'When multiple images are attached, treat them as different views of the same stand.',
    ];

    if (referenceViewLabels.length) {
        sections.push(`Auxiliary views attached: ${referenceViewLabels.join(', ')}.`);
    }

    return sections.join('\n\n');
}

function buildArchitecturalReasoning({ brief = {}, conceptTitle = '', conceptSummary = '', scene = null, referenceObservations = null }) {
    const normalizedBrief = normalizeStandDesignBrief(brief);
    const observation = normalizeReferenceObservations(referenceObservations);
    const objects = Array.isArray(scene?.objects) ? scene.objects : [];
    const countBy = (matcher) => objects.filter((item) => matcher(normalizeText(`${item.label} ${item.type} ${item.group_id}`).toLowerCase())).length;
    const majorZoneCount = new Set(objects.map((item) => normalizeText(item.group_id).toLowerCase()).filter(Boolean)).size;
    const screenCount = countBy((text) => /screen|kiosk|av/.test(text));
    const meetingCount = countBy((text) => /meeting|discussion|chair|table/.test(text));
    const vipCount = countBy((text) => /vip|lounge|sofa/.test(text));
    const displayCount = countBy((text) => /display|plinth|model/.test(text));
    const materialSummary = observation.materials_and_colors.slice(0, 4).join(', ') || normalizeText(normalizedBrief.material_direction_notes || normalizedBrief.brand_colors);
    const focalSummary = observation.anchor_objects.slice(0, 3).join(', ') || normalizeText(conceptSummary);

    return [
        `${normalizeText(conceptTitle) || 'This concept'} is planned as a digitally reconstructed exhibition stand with ${objects.length} mapped scene objects across ${Math.max(majorZoneCount, 1)} primary spatial groups.`,
        `Spatial logic: ${observation.layout_summary || summarizeStandDesignBrief(normalizedBrief) || 'The stand uses a clear entry-led circulation pattern with visible brand, display, and meeting zones.'}`,
        `Visitor flow: the entry/reception edge leads visitors toward ${displayCount > 0 ? 'display plinths and focal project models' : 'the main branded focal point'}, while ${meetingCount > 0 ? `${meetingCount} meeting-oriented furniture objects` : 'discussion points'} and ${vipCount > 0 ? 'a dedicated VIP/lounge zone' : 'support seating'} provide layered interaction depth.`,
        `Architectural emphasis: ${observation.major_structures.slice(0, 4).join(', ') || 'perimeter walls, fascia elements, and feature frames'} define the silhouette, while ${screenCount > 0 ? `${screenCount} AV/screen elements` : 'integrated digital display positions'} reinforce client communication.`,
        `Material logic: ${materialSummary || 'premium light finishes, metallic accents, and controlled brand colors'} are used to keep the digital twin aligned with the concept render and brand language.`,
        `Focal points: ${focalSummary || 'the central branded composition and visitor-facing architectural features'} anchor the stand visually and support the intended premium presentation.`,
    ].filter(Boolean).join(' ');
}

function buildBlueprintMetadata({ brief = {}, scene = null, conceptTitle = '', referenceObservations = null }) {
    const normalizedBrief = normalizeStandDesignBrief(brief);
    const footprint = scene?.footprint || {};
    const objects = Array.isArray(scene?.objects) ? scene.objects : [];
    const materialScheduleMap = new Map();
    objects.forEach((item) => {
        const material = item?.material || {};
        const key = normalizeText(material.preset_id || material.color || 'default');
        if (!key || materialScheduleMap.has(key)) return;
        materialScheduleMap.set(key, {
            key,
            label: normalizeText(material.preset_id || material.color || 'Default finish'),
            color: normalizeText(material.color || '#e9e2d2'),
            opacity: Number.isFinite(Number(material.opacity)) ? Number(material.opacity) : 1,
        });
    });
    return {
        mode: 'overview',
        scale_label: footprint?.width && footprint?.depth ? '1:100' : 'NTS',
        viewport: {
            width: Number(footprint?.width || 0),
            depth: Number(footprint?.depth || 0),
        },
        project_name: normalizeText(conceptTitle) || normalizeText(normalizedBrief.client_name) || 'Stand Design',
        venue: normalizeText(normalizedBrief.location || normalizedBrief.event_name || ''),
        material_schedule: [...materialScheduleMap.values()].slice(0, 12),
        object_count: objects.length,
        note: normalizeReferenceObservations(referenceObservations).layout_summary || summarizeStandDesignBrief(normalizedBrief),
    };
}

function colorDistance(hexA, hexB) {
    const parse = (hex) => {
        const clean = normalizeText(hex).replace('#', '').padEnd(6, '0').slice(0, 6);
        const v = Number.parseInt(clean, 16) || 0;
        return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
    };
    const a = parse(hexA);
    const b = parse(hexB);
    return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function scoreStructuralCompleteness(objects = []) {
    const types = new Set(objects.map((o) => normalizeText(o.type)));
    let score = 0;
    if (types.has('floor') || types.has('raised_floor')) score += 5;
    if (types.has('wall') || types.has('branded_wall')) score += 5;
    if (types.has('fascia') || types.has('logo_beam') || types.has('arch_band')) score += 5;
    return score;
}

function scoreBrandColorFidelity(objects = [], brief = {}) {
    const normalizedBrief = normalizeStandDesignBrief(brief);
    const primary = normalizeText(normalizedBrief.brand_primary || normalizedBrief.brand_colors || '').split(/[,\s]+/)[0];
    if (!primary || !/^#[0-9a-f]{6}$/i.test(primary)) return 10; // no hex primary → neutral score
    const brandedTypes = new Set(['branded_wall', 'fascia', 'logo_beam', 'arch_band', 'portal_leg']);
    const brandedObjects = objects.filter((o) => brandedTypes.has(normalizeText(o.type)));
    if (brandedObjects.length === 0) return 0;
    const matches = brandedObjects.filter((o) => {
        const c = normalizeText(o.material?.color || '');
        return c && colorDistance(c, primary) < 60;
    });
    return Math.round((matches.length / brandedObjects.length) * 15);
}

function scoreObjectDensity(objects = [], footprint = {}) {
    const area = (footprint.width || 6) * (footprint.depth || 6);
    const expectedMin = Math.max(6, Math.floor(area / 6));
    const expectedMax = Math.min(24, Math.ceil(area / 2));
    const count = objects.length;
    if (count >= expectedMin && count <= expectedMax) return 10;
    if (count >= expectedMin * 0.7 && count <= expectedMax * 1.3) return 5;
    return 0;
}

function buildScoreRetryFeedback(scene, referenceObservations, brief, score) {
    const objects = Array.isArray(scene?.objects) ? scene.objects : [];
    const types = new Set(objects.map((o) => normalizeText(o.type)));
    const normalizedBrief = normalizeStandDesignBrief(brief);
    const primary = normalizeText(normalizedBrief.brand_primary || normalizedBrief.brand_colors || '').split(/[,\s]+/)[0];
    const issues = [];

    if (!types.has('floor') && !types.has('raised_floor')) issues.push('Missing floor primitive — add a floor or raised_floor object.');
    if (!types.has('branded_wall') && !types.has('wall')) issues.push('Missing wall/branded_wall — add at least one wall primitive as the rear feature wall.');
    if (!types.has('fascia') && !types.has('logo_beam')) issues.push('Missing branding elements — add a fascia or logo_beam with the brand color.');
    if (primary && /^#[0-9a-f]{6}$/i.test(primary)) {
        const brandedTypes = new Set(['branded_wall', 'fascia', 'logo_beam', 'arch_band']);
        const wrongColor = objects.filter((o) => brandedTypes.has(normalizeText(o.type))).filter((o) => {
            const c = normalizeText(o.material?.color || '');
            return !c || colorDistance(c, primary) >= 60;
        });
        if (wrongColor.length > 0) {
            issues.push(`Branded objects (${wrongColor.map((o) => o.type).join(', ')}) do not use the brand primary color "${primary}". Set their material.color to "${primary}".`);
        }
    }
    if (objects.length < 6) issues.push(`Scene has only ${objects.length} objects — add more structural primitives and assets to reach at least 10.`);
    const observation = normalizeReferenceObservations(referenceObservations);
    if (observation.major_structures.length && !issues.length) {
        issues.push(`Score was ${score}/99. Improve match to observed structures: ${observation.major_structures.slice(0, 3).join(', ')}.`);
    }
    return issues.length ? issues.join(' ') : `Score was ${score}/99. Add more architectural detail to better match the reference image.`;
}

function deriveMatchCamera(observation = {}, footprint = {}) {
    const pos = Array.isArray(observation.match_camera?.position) ? observation.match_camera.position : [];
    const tgt = Array.isArray(observation.match_camera?.target) ? observation.match_camera.target : [];
    const w = footprint.width || 6;
    const d = footprint.depth || 6;
    // Accept the observation camera if it looks geometrically reasonable
    if (pos.length === 3 && pos.some((v) => Math.abs(v) > 0.5)) {
        const dist = Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2);
        if (dist > 2 && dist < 40) {
            return { preset: observation.match_camera?.preset || 'match', position: pos, target: tgt.length === 3 ? tgt : [0, 1.2, 0] };
        }
    }
    // Fallback: derive from stand footprint
    const camDist = Math.max(w, d) * 1.4;
    return {
        preset: 'match',
        position: [camDist * 0.7, camDist * 0.5, camDist * 0.7],
        target: [0, 1.2, 0],
    };
}

async function appendReferenceImageParts(userParts, referenceImages = []) {
    for (const reference of referenceImages) {
        const label = normalizeText(reference?.label);
        const imagePath = normalizeText(reference?.path);
        if (!imagePath) continue;
        const image = await loadReferenceImage(imagePath);
        if (label) {
            userParts.push({ text: `Reference image: ${label}` });
        }
        userParts.push(createPartFromBase64(image.imageBytes, image.mimeType));
    }
}

function resolvePublicFile(publicPath) {
    const cleanPath = normalizeText(publicPath);
    if (isDataUrl(cleanPath)) {
        return cleanPath;
    }
    if (/^https?:\/\//i.test(cleanPath)) {
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

    if (/^https?:\/\//i.test(cleanPath)) {
        const response = await fetch(cleanPath);
        if (!response.ok) {
            throw new Error('Reference image could not be loaded');
        }
        const mimeType = normalizeText(response.headers.get('content-type') || 'image/png') || 'image/png';
        const buffer = Buffer.from(await response.arrayBuffer());
        return {
            mimeType,
            imageBytes: buffer.toString('base64'),
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

function extractGeminiText(response) {
    if (normalizeText(response?.text)) {
        return normalizeText(response.text);
    }
    for (const candidate of Array.isArray(response?.candidates) ? response.candidates : []) {
        for (const part of Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []) {
            if (normalizeText(part?.text)) {
                return normalizeText(part.text);
            }
        }
    }
    return '';
}

function parseSceneJsonResponse(response) {
    const rawText = extractGeminiText(response);
    if (!rawText) {
        throw new Error('Gemini did not return scene JSON.');
    }
    try {
        return JSON.parse(rawText);
    } catch {
        const match = rawText.match(/\{[\s\S]*\}/);
        if (!match) {
            throw new Error('Gemini scene JSON could not be parsed.');
        }
        return JSON.parse(match[0]);
    }
}

function isRetryableProviderError(error) {
    const message = normalizeText(error?.message || '');
    return /"status":"INTERNAL"|Internal error encountered|currently experiencing high demand|"status":"UNAVAILABLE"/i.test(message);
}

function formatProviderError(error) {
    const message = normalizeText(error?.message || '');
    if (/timed out after \d+ms/i.test(message)) {
        return 'Gemini image generation timed out. Please retry in a moment or simplify the brief slightly.';
    }
    if (/"status":"UNAVAILABLE"|currently experiencing high demand/i.test(message)) {
        return 'Gemini image generation is temporarily busy. Please retry in a moment.';
    }
    if (/"status":"INTERNAL"|Internal error encountered/i.test(message)) {
        return 'Gemini image generation failed on the provider side. Please simplify the brief slightly or try again.';
    }
    return message || 'Gemini image generation failed. Please try again.';
}

async function withTimeout(promise, timeoutMs, label) {
    let timer = null;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    reject(new Error(`${label} timed out after ${timeoutMs}ms`));
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

async function generateGeminiPreviewImage({ ai, model, userParts }) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const response = await withTimeout(
                ai.models.generateContent({
                    model,
                    contents: [{ role: 'user', parts: userParts }],
                    config: {
                        responseModalities: ['IMAGE', 'TEXT'],
                    },
                }),
                GEMINI_PREVIEW_TIMEOUT_MS,
                `Gemini model ${model}`,
            );

            const generatedImages = extractGeminiInlineImages(response);
            if (!generatedImages.length) {
                throw new Error('Gemini did not return an image concept. Please refine the prompt and try again.');
            }

            return generatedImages[0];
        } catch (error) {
            lastError = error;
            if (!isRetryableProviderError(error) || attempt === 3) {
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
    const storageMode = SUPABASE_STORAGE_ENABLED;
    if (!inlineMode && !storageMode) {
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

        if (storageMode) {
            try {
                const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
                const storagePath = buildSupabaseAssetPath('generated', designId, `${Date.now()}-${index + 1}.${extension}`);
                concept.path = await uploadGeneratedAssetToStorage({ storagePath, mimeType, imageBytes });
            } catch (error) {
                if (!shouldFallbackToLocalGeneratedAssets()) throw error;
                concept.path = await persistAssetToLocalFile({ designId, conceptId: concept.id, suffix: `concept-${index + 1}`, mimeType, imageBytes });
            }
        } else if (!inlineMode) {
            concept.path = await persistAssetToLocalFile({ designId, conceptId: concept.id, suffix: `concept-${index + 1}`, mimeType, imageBytes });
        }

        concepts.push(concept);
    }

    return concepts;
}

async function persistGeneratedViews(designId, conceptId, generatedImages = [], metadata = []) {
    const inlineMode = shouldInlineGeneratedAssets();
    const storageMode = SUPABASE_STORAGE_ENABLED;
    if (!inlineMode && !storageMode) {
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

        if (storageMode) {
            try {
                const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
                const storagePath = buildSupabaseAssetPath('generated', designId, conceptId, `${angle}-${Date.now()}.${extension}`);
                view.path = await uploadGeneratedAssetToStorage({ storagePath, mimeType, imageBytes });
            } catch (error) {
                if (!shouldFallbackToLocalGeneratedAssets()) throw error;
                view.path = await persistAssetToLocalFile({ designId, conceptId, suffix: angle, mimeType, imageBytes });
            }
        } else if (!inlineMode) {
            view.path = await persistAssetToLocalFile({ designId, conceptId, suffix: angle, mimeType, imageBytes });
        }

        views.push(view);
    }

    return views;
}

async function persistSceneRenderImage({ designId, conceptId, imageDataUrl, label = '' }) {
    const cleanDataUrl = normalizeText(imageDataUrl);
    if (!cleanDataUrl) {
        throw new Error('Scene render image is required.');
    }

    const match = cleanDataUrl.match(/^data:([^;,]+)?;base64,(.+)$/i);
    if (!match) {
        throw new Error('Scene render image data is invalid.');
    }

    const mimeType = normalizeText(match[1]) || 'image/png';
    const imageBytes = match[2];
    if (SUPABASE_STORAGE_ENABLED) {
        try {
            const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
            const storagePath = buildSupabaseAssetPath('renders', designId, conceptId, `${Date.now()}.${extension}`);
            return {
                id: `${conceptId}-render-${Date.now()}`,
                label: normalizeText(label) || 'Scene Render',
                path: await uploadGeneratedAssetToStorage({ storagePath, mimeType, imageBytes, cacheControl: '600' }),
                mimeType,
                created_at: new Date().toISOString(),
            };
        } catch (error) {
            if (!shouldFallbackToLocalGeneratedAssets()) throw error;
            return {
                id: `${conceptId}-render-${Date.now()}`,
                label: normalizeText(label) || 'Scene Render',
                path: await persistAssetToLocalFile({ designId, conceptId, suffix: 'scene', mimeType, imageBytes }),
                mimeType,
                created_at: new Date().toISOString(),
            };
        }
    }
    if (shouldInlineGeneratedAssets()) {
        return {
            id: `${conceptId}-render-${Date.now()}`,
            label: normalizeText(label) || 'Scene Render',
            path: cleanDataUrl,
            mimeType,
            created_at: new Date().toISOString(),
        };
    }

    return {
        id: `${conceptId}-render-${Date.now()}`,
        label: normalizeText(label) || 'Scene Render',
        path: await persistAssetToLocalFile({ designId, conceptId, suffix: 'scene', mimeType, imageBytes }),
        mimeType,
        created_at: new Date().toISOString(),
    };
}

export async function removeStandDesignAssets(record) {
    const conceptPaths = Array.isArray(record?.concepts)
        ? record.concepts.flatMap((concept) => {
            const mainPath = normalizeText(concept?.path);
            const viewPaths = Array.isArray(concept?.views)
                ? concept.views.map((view) => normalizeText(view?.path)).filter(Boolean)
                : [];
            const sceneRenderPaths = Array.isArray(concept?.scene_renders)
                ? concept.scene_renders.map((render) => normalizeText(render?.path)).filter(Boolean)
                : [];
            return [mainPath, ...viewPaths, ...sceneRenderPaths].filter(Boolean);
        })
        : [];
    await Promise.all(conceptPaths.map(async (publicPath) => {
        try {
            if (isDataUrl(publicPath)) {
                return;
            }
            const storageObjectPath = extractSupabaseStorageObjectPath(publicPath);
            if (storageObjectPath && SUPABASE_STORAGE_ENABLED) {
                const supabase = getSupabaseStorageClient();
                await supabase.storage.from(SUPABASE_STORAGE_BUCKET).remove([storageObjectPath]);
                return;
            }
            const absolutePath = resolvePublicFile(publicPath);
            await fs.unlink(absolutePath);
        } catch {}
    }));
}

export async function generateStandDesignScene({
    brief = {},
    conceptTitle = '',
    conceptSummary = '',
    conceptIndex = 0,
    conceptPath = '',
    conceptViews = [],
}) {
    const normalizedBrief = normalizeStandDesignBrief(brief);
    const fallbackScene = createHeuristicStandScene({ brief: normalizedBrief, conceptIndex });
    const fallbackViewLabels = (Array.isArray(conceptViews) ? conceptViews : [])
        .slice(0, 4)
        .map((view, index) => normalizeText(view?.label) || `Reference View ${index + 1}`)
        .filter(Boolean);
    const sceneModel = getStandDesignSceneModel();
    if (!sceneModel || !getGeminiApiKey()) {
        const scoredFallback = scoreSceneAgainstReference(fallbackScene, null, normalizedBrief, conceptViews);
        const normalizedFallbackScene = validateStandDesignScene(fallbackScene, normalizedBrief);
        return {
            scene: normalizedFallbackScene,
            generated_by: 'heuristic',
            model: '',
            reference_analysis: null,
            scene_match_camera: normalizedFallbackScene.match_camera,
            scene_match_score: scoredFallback.score,
            scene_match_notes: scoredFallback.notes,
            scene_reference_views_used: fallbackViewLabels,
            scene_reconstruction_status: 'exact-reconstruction-unavailable',
            architectural_reasoning: buildArchitecturalReasoning({
                brief: normalizedBrief,
                conceptTitle,
                conceptSummary,
                scene: normalizedFallbackScene,
                referenceObservations: null,
            }),
            blueprint: buildBlueprintMetadata({
                brief: normalizedBrief,
                scene: normalizedFallbackScene,
                conceptTitle,
                referenceObservations: null,
            }),
        };
    }

    try {
        const ai = getAiClient();
        const referenceImages = [
            normalizeText(conceptPath)
                ? {
                    label: normalizeText(conceptTitle) || `Concept ${conceptIndex + 1}`,
                    path: conceptPath,
                }
                : null,
            ...((Array.isArray(conceptViews) ? conceptViews : [])
                .slice(0, 4)
                .map((view, index) => ({
                    label: normalizeText(view?.label) || `Reference View ${index + 1}`,
                    path: normalizeText(view?.path),
                }))
                .filter((view) => view.path)),
        ].filter(Boolean);
        const referenceViewLabels = referenceImages.slice(1).map((view) => view.label).filter(Boolean);
        const observationParts = [
            {
                text: buildReferenceObservationPrompt({
                    brief: normalizedBrief,
                    conceptTitle,
                    conceptSummary,
                    referenceViewLabels,
                }),
            },
        ];
        await appendReferenceImageParts(observationParts, referenceImages);

        let referenceObservations = null;
        const cacheKey = referenceImages.map((img) => img.path).join('|');
        const cachedObservation = cacheKey ? _observationCache.get(cacheKey) : undefined;
        if (cachedObservation !== undefined) {
            referenceObservations = cachedObservation;
        } else {
            try {
                const observationResponse = await ai.models.generateContent({
                    model: sceneModel,
                    contents: [{ role: 'user', parts: observationParts }],
                    config: {
                        responseMimeType: 'application/json',
                        responseJsonSchema: buildStandDesignReferenceObservationSchema(),
                    },
                });
                referenceObservations = normalizeReferenceObservations(parseSceneJsonResponse(observationResponse));
                if (cacheKey && referenceObservations) {
                    _observationCache.set(cacheKey, referenceObservations);
                }
            } catch {}
        }

        const baseScenePrompt = buildReferenceMatchedScenePrompt({
            brief: normalizedBrief,
            conceptTitle,
            conceptSummary,
            conceptIndex,
            referenceObservations,
            referenceViewLabels,
        });

        const logoPart = await loadOptionalInlinePart(normalizedBrief.logo_image_path);
        const brandReferencePart = await loadOptionalInlinePart(normalizedBrief.brand_reference_image_path);

        // Retry loop: up to 2 extra attempts if score is too low
        let scene = null;
        let scoring = { score: 0, notes: [] };
        let retryFeedback = '';

        for (let attempt = 1; attempt <= 3; attempt += 1) {
            const promptText = retryFeedback
                ? `${baseScenePrompt}\n\nPREVIOUS ATTEMPT FEEDBACK (fix all issues listed below):\n${retryFeedback}`
                : baseScenePrompt;
            const userParts = [{ text: promptText }];
            await appendReferenceImageParts(userParts, referenceImages);
            if (logoPart) userParts.push(logoPart);
            if (brandReferencePart) userParts.push(brandReferencePart);

            const response = await ai.models.generateContent({
                model: sceneModel,
                contents: [{ role: 'user', parts: userParts }],
                config: {
                    responseMimeType: 'application/json',
                    responseJsonSchema: buildStandDesignSceneJsonSchema(),
                },
            });

            const rawScene = parseSceneJsonResponse(response);
            const candidate = enrichStandDesignSceneAssemblies(
                validateStandDesignScene(rawScene, normalizedBrief),
                { brief: normalizedBrief, conceptIndex },
            );
            // Derive camera from the validated footprint so dimensions are accurate
            candidate.match_camera = deriveMatchCamera(referenceObservations || {}, candidate.footprint || {});
            const candidateScoring = scoreSceneAgainstReference(candidate, referenceObservations, normalizedBrief, conceptViews);

            // Accept if score improved or we're on the final attempt
            if (!scene || candidateScoring.score >= scoring.score || attempt === 3) {
                scene = candidate;
                scoring = candidateScoring;
            }
            if (candidateScoring.score >= 60 || attempt === 3) break;
            retryFeedback = buildScoreRetryFeedback(candidate, referenceObservations, normalizedBrief, candidateScoring.score);
        }
        const architecturalReasoning = buildArchitecturalReasoning({
            brief: normalizedBrief,
            conceptTitle,
            conceptSummary,
            scene,
            referenceObservations,
        });
        const blueprint = buildBlueprintMetadata({
            brief: normalizedBrief,
            scene,
            conceptTitle,
            referenceObservations,
        });
        return {
            scene,
            generated_by: 'gemini',
            model: sceneModel,
            reference_analysis: referenceObservations,
            scene_match_camera: scene.match_camera || referenceObservations?.match_camera || null,
            scene_match_score: scoring.score,
            scene_match_notes: scoring.notes,
            scene_reference_views_used: referenceImages.map((item) => item.label).filter(Boolean),
            scene_reconstruction_status: buildReconstructionStatus(scoring.score),
            architectural_reasoning: architecturalReasoning,
            blueprint,
        };
    } catch {
        const scoredFallback = scoreSceneAgainstReference(fallbackScene, null, normalizedBrief, conceptViews);
        const normalizedFallbackScene = validateStandDesignScene(fallbackScene, normalizedBrief);
        return {
            scene: enrichStandDesignSceneAssemblies(normalizedFallbackScene, { brief: normalizedBrief, conceptIndex }),
            generated_by: 'heuristic',
            model: sceneModel,
            reference_analysis: null,
            scene_match_camera: normalizedFallbackScene.match_camera,
            scene_match_score: scoredFallback.score,
            scene_match_notes: scoredFallback.notes,
            scene_reference_views_used: fallbackViewLabels,
            scene_reconstruction_status: 'exact-reconstruction-unavailable',
            architectural_reasoning: buildArchitecturalReasoning({
                brief: normalizedBrief,
                conceptTitle,
                conceptSummary,
            scene: enrichStandDesignSceneAssemblies(normalizedFallbackScene, { brief: normalizedBrief, conceptIndex }),
                referenceObservations: null,
            }),
            blueprint: buildBlueprintMetadata({
                brief: normalizedBrief,
                scene: normalizedFallbackScene,
                conceptTitle,
                referenceObservations: null,
            }),
        };
    }
}

export async function analyzeStandDesignReference({
    brief = {},
    conceptTitle = '',
    conceptSummary = '',
    conceptIndex = 0,
    conceptPath = '',
    conceptViews = [],
}) {
    const normalizedBrief = normalizeStandDesignBrief(brief);
    const sceneModel = getStandDesignSceneModel();
    if (!sceneModel || !getGeminiApiKey() || !normalizeText(conceptPath)) {
        return {
            reference_analysis: null,
            scene_match_camera: null,
            scene_reference_views_used: [],
            scene_reconstruction_status: 'exact-reconstruction-unavailable',
        };
    }

    const ai = getAiClient();
    const referenceImages = [
        {
            label: normalizeText(conceptTitle) || `Concept ${conceptIndex + 1}`,
            path: conceptPath,
        },
        ...((Array.isArray(conceptViews) ? conceptViews : [])
            .slice(0, 4)
            .map((view, index) => ({
                label: normalizeText(view?.label) || `Reference View ${index + 1}`,
                path: normalizeText(view?.path),
            }))
            .filter((view) => view.path)),
    ];
    const referenceViewLabels = referenceImages.slice(1).map((view) => view.label).filter(Boolean);
    const analyzeObservationCacheKey = referenceImages.map((img) => img.path).join('|');
    if (analyzeObservationCacheKey && _observationCache.has(analyzeObservationCacheKey)) {
        const cached = _observationCache.get(analyzeObservationCacheKey);
        return {
            reference_analysis: cached,
            scene_match_camera: cached.match_camera,
            scene_reference_views_used: referenceImages.map((item) => item.label).filter(Boolean),
            scene_reconstruction_status: 'needs-manual-correction',
        };
    }

    const observationParts = [
        {
            text: buildReferenceObservationPrompt({
                brief: normalizedBrief,
                conceptTitle,
                conceptSummary,
                referenceViewLabels,
            }),
        },
    ];
    await appendReferenceImageParts(observationParts, referenceImages);

    try {
        const observationResponse = await ai.models.generateContent({
            model: sceneModel,
            contents: [{ role: 'user', parts: observationParts }],
            config: {
                responseMimeType: 'application/json',
                responseJsonSchema: buildStandDesignReferenceObservationSchema(),
            },
        });
        const referenceAnalysis = normalizeReferenceObservations(parseSceneJsonResponse(observationResponse));
        if (analyzeObservationCacheKey && referenceAnalysis) {
            _observationCache.set(analyzeObservationCacheKey, referenceAnalysis);
        }
        return {
            reference_analysis: referenceAnalysis,
            scene_match_camera: referenceAnalysis.match_camera,
            scene_reference_views_used: referenceImages.map((item) => item.label).filter(Boolean),
            scene_reconstruction_status: 'analyzed',
        };
    } catch {
        return {
            reference_analysis: null,
            scene_match_camera: null,
            scene_reference_views_used: referenceImages.map((item) => item.label).filter(Boolean),
            scene_reconstruction_status: 'exact-reconstruction-unavailable',
        };
    }
}

export async function storeStandDesignSceneRender({ designId, conceptId, imageDataUrl, label }) {
    return persistSceneRenderImage({ designId, conceptId, imageDataUrl, label });
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
        const concepts = [];
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
            concepts.push(concept);
        }
        resolvedModel = concepts.find((concept) => concept?.model)?.model || resolvedModel;
        generatedImages = concepts.map((concept) => concept.image).filter(Boolean);
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
