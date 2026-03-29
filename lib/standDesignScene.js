import {
    STAND_DESIGN_ALLOWED_ASSET_KEYS,
    STAND_DESIGN_ALLOWED_PRIMITIVE_TYPES,
    getStandDesignAsset,
    getStandDesignMaterialPreset,
    getStandDesignPrimitive,
} from '@/lib/standDesignAssetRegistry';
import { normalizeStandDesignBrief } from '@/lib/standDesignBrief';

export const STAND_DESIGN_SCENE_VERSION = '1.0';
export const STAND_DESIGN_SCENE_UNITS = 'meters';
export const STAND_DESIGN_SCENE_GENERATORS = ['gemini', 'heuristic', 'manual'];
export const STAND_DESIGN_SCENE_RENDER_PRESETS = [
    { id: 'perspective', label: 'Perspective Snapshot' },
    { id: 'front', label: 'Front Snapshot' },
    { id: 'top', label: 'Top Snapshot' },
];

function normalizeText(value) {
    return String(value || '').trim();
}

function clampNumber(value, fallback, min = -999, max = 999) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

function normalizeVector3(value, fallback = [0, 0, 0]) {
    const source = Array.isArray(value) ? value : fallback;
    return [
        clampNumber(source[0], fallback[0]),
        clampNumber(source[1], fallback[1]),
        clampNumber(source[2], fallback[2]),
    ];
}

function normalizeDimensions(value, fallback) {
    const source = value || fallback || {};
    return {
        width: clampNumber(source.width, fallback?.width || 1, 0.05, 50),
        height: clampNumber(source.height, fallback?.height || 1, 0.05, 20),
        depth: clampNumber(source.depth, fallback?.depth || 1, 0.05, 50),
    };
}

function normalizeMaterial(value, fallback = {}) {
    const presetId = normalizeText(value?.preset_id || value?.presetId || fallback?.preset_id || fallback?.presetId || '');
    const preset = presetId ? getStandDesignMaterialPreset(presetId) : null;
    return {
        preset_id: presetId || '',
        color: normalizeText(value?.color || fallback?.color || preset?.color || '#e9e2d2') || '#e9e2d2',
        metalness: clampNumber(value?.metalness, fallback?.metalness ?? preset?.metalness ?? 0.08, 0, 1),
        roughness: clampNumber(value?.roughness, fallback?.roughness ?? preset?.roughness ?? 0.72, 0, 1),
        emissive: normalizeText(value?.emissive || fallback?.emissive || preset?.emissive || ''),
        opacity: clampNumber(value?.opacity, fallback?.opacity ?? preset?.opacity ?? 1, 0.05, 1),
        double_sided: Boolean(value?.double_sided ?? value?.doubleSided ?? fallback?.double_sided ?? fallback?.doubleSided ?? preset?.doubleSided ?? false),
    };
}

function normalizeObjectParams(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        innerRadius: clampNumber(source.innerRadius, 0.8, 0.05, 30),
        thickness: clampNumber(source.thickness, 0.24, 0.02, 8),
        curvature: clampNumber(source.curvature, 0.5, 0, 1),
        roundedness: clampNumber(source.roundedness, 0.18, 0, 1),
    };
}

function parseStandSize(standSize = '') {
    const matches = normalizeText(standSize).match(/(\d+(?:\.\d+)?)/g) || [];
    const width = Number(matches[0]) || 6;
    const depth = Number(matches[1]) || width;
    return {
        width: clampNumber(width, 6, 2, 60),
        depth: clampNumber(depth, 6, 2, 60),
    };
}

function parseCountFromText(value, fallback = 0) {
    const clean = normalizeText(value);
    const matches = clean.match(/(\d+)/g);
    if (!matches?.length) return fallback;
    return Number(matches[0]) || fallback;
}

function makeObject({
    id,
    kind,
    type,
    assetKey = '',
    label = '',
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = [1, 1, 1],
    dimensions = null,
    material = null,
    locked = false,
    visible = true,
    groupId = '',
    mirrorOf = '',
    params = null,
}) {
    const primitive = kind === 'primitive' ? getStandDesignPrimitive(type) : null;
    const asset = kind === 'asset' ? getStandDesignAsset(assetKey) : null;
    const dimensionFallback = dimensions || primitive?.dimensions || asset?.dimensions || { width: 1, height: 1, depth: 1 };
    const materialFallback = material || primitive?.defaultMaterial || asset?.defaultMaterial || {};

    return {
        id: normalizeText(id) || `obj-${Math.random().toString(36).slice(2, 8)}`,
        kind,
        type,
        asset_key: normalizeText(assetKey),
        label: normalizeText(label) || asset?.label || primitive?.label || type,
        position: normalizeVector3(position),
        rotation: normalizeVector3(rotation),
        scale: normalizeVector3(scale, [1, 1, 1]),
        dimensions: normalizeDimensions(dimensionFallback, dimensionFallback),
        material: normalizeMaterial(materialFallback, materialFallback),
        locked: Boolean(locked),
        visible: visible !== false,
        group_id: normalizeText(groupId),
        mirror_of: normalizeText(mirrorOf),
        params: normalizeObjectParams(params),
    };
}

export function createEmptyStandScene(brief = {}) {
    const normalizedBrief = normalizeStandDesignBrief(brief);
    const footprint = parseStandSize(normalizedBrief.stand_size);
    return {
        version: STAND_DESIGN_SCENE_VERSION,
        units: STAND_DESIGN_SCENE_UNITS,
        footprint: {
            width: footprint.width,
            depth: footprint.depth,
            height: 3.6,
        },
        camera: {
            preset: 'perspective',
            position: [footprint.width * 0.9, footprint.width * 0.7, footprint.depth * 0.9],
            target: [0, 1.2, 0],
        },
        lighting: {
            environment: 'studio',
            intensity: 1,
        },
        match_camera: {
            preset: 'match',
            position: [footprint.width * 0.9, footprint.width * 0.7, footprint.depth * 0.9],
            target: [0, 1.2, 0],
        },
        objects: [],
    };
}

export function createHeuristicStandScene({ brief = {}, conceptIndex = 0 } = {}) {
    const normalizedBrief = normalizeStandDesignBrief(brief);
    const scene = createEmptyStandScene(normalizedBrief);
    const { width, depth } = scene.footprint;
    const wallThickness = 0.12;
    const floorHeight = 0.1;
    const trimHeight = 0.09;
    const mainColor = conceptIndex === 0 ? '#efe5d0' : '#d8c59c';
    const accentColor = conceptIndex === 0 ? '#caa24f' : '#ba8f3c';

    const objects = [
        makeObject({
            id: 'floor-main',
            kind: 'primitive',
            type: 'floor',
            label: 'Main Floor',
            dimensions: { width, height: floorHeight, depth },
            position: [0, -floorHeight / 2, 0],
            material: { preset_id: 'oak-parquet', color: '#c39a5a', metalness: 0.05, roughness: 0.58 },
            locked: true,
        }),
        makeObject({
            id: 'raised-presentation-floor',
            kind: 'primitive',
            type: 'raised_floor',
            label: 'Presentation Floor',
            dimensions: { width: width * 0.74, height: 0.16, depth: depth * 0.74 },
            position: [0, 0.08, 0.12],
            material: { preset_id: 'oak-parquet', color: '#d1ab72', metalness: 0.04, roughness: 0.58 },
            locked: true,
        }),
        makeObject({
            id: 'entry-threshold',
            kind: 'primitive',
            type: 'plinth',
            label: 'Entry Threshold',
            dimensions: { width: width * 0.48, height: 0.08, depth: 0.34 },
            position: [0, 0.04, (depth / 2) - 0.26],
            material: { preset_id: 'brushed-gold', color: accentColor, metalness: 0.12, roughness: 0.42, emissive: lightenHex(accentColor, 0.18) },
            locked: true,
        }),
        makeObject({
            id: 'floor-trim-front',
            kind: 'primitive',
            type: 'fascia',
            label: 'Front Floor Trim',
            dimensions: { width: width * 0.88, height: trimHeight, depth: 0.12 },
            position: [0, trimHeight / 2, (depth / 2) - 0.14],
            material: { preset_id: 'brushed-gold', color: accentColor, metalness: 0.18, roughness: 0.32, emissive: lightenHex(accentColor, 0.16) },
            locked: true,
        }),
        makeObject({
            id: 'floor-trim-left',
            kind: 'primitive',
            type: 'fascia',
            label: 'Left Floor Trim',
            dimensions: { width: depth * 0.76, height: trimHeight, depth: 0.12 },
            position: [-(width / 2) + 0.18, trimHeight / 2, 0.16],
            rotation: [0, Math.PI / 2, 0],
            material: { preset_id: 'brushed-gold', color: lightenHex(accentColor, 0.04), metalness: 0.18, roughness: 0.32, emissive: lightenHex(accentColor, 0.18) },
            locked: true,
        }),
        makeObject({
            id: 'floor-trim-right',
            kind: 'primitive',
            type: 'fascia',
            label: 'Right Floor Trim',
            dimensions: { width: depth * 0.76, height: trimHeight, depth: 0.12 },
            position: [(width / 2) - 0.18, trimHeight / 2, 0.16],
            rotation: [0, Math.PI / 2, 0],
            material: { preset_id: 'brushed-gold', color: lightenHex(accentColor, 0.04), metalness: 0.18, roughness: 0.32, emissive: lightenHex(accentColor, 0.18) },
            locked: true,
        }),
        makeObject({
            id: 'back-wall',
            kind: 'primitive',
            type: 'wall',
            label: 'Back Wall',
            dimensions: { width: width * 0.88, height: 3.6, depth: wallThickness },
            position: [0, 1.8, -(depth / 2) + (wallThickness / 2)],
            material: { color: mainColor, metalness: 0.03, roughness: 0.82 },
            locked: true,
        }),
        makeObject({
            id: 'rear-return-left',
            kind: 'primitive',
            type: 'wall',
            label: 'Rear Return Left',
            dimensions: { width: depth * 0.18, height: 3.1, depth: wallThickness },
            position: [-(width / 2) + 0.54, 1.55, -(depth / 2) + 0.6],
            rotation: [0, Math.PI / 2, 0],
            material: { preset_id: 'gallery-white', color: lightenHex(mainColor, 0.03), metalness: 0.03, roughness: 0.8 },
            locked: true,
        }),
        makeObject({
            id: 'rear-return-right',
            kind: 'primitive',
            type: 'wall',
            label: 'Rear Return Right',
            dimensions: { width: depth * 0.18, height: 3.1, depth: wallThickness },
            position: [(width / 2) - 0.54, 1.55, -(depth / 2) + 0.6],
            rotation: [0, Math.PI / 2, 0],
            material: { preset_id: 'gallery-white', color: lightenHex(mainColor, 0.03), metalness: 0.03, roughness: 0.8 },
            locked: true,
        }),
        makeObject({
            id: 'feature-wall',
            kind: 'primitive',
            type: 'branded_wall',
            label: 'Feature Wall',
            dimensions: { width: width * 0.42, height: 3.2, depth: 0.18 },
            position: [0, 1.6, -(depth / 2) + 0.22],
            material: { preset_id: 'gallery-white', color: mainColor, metalness: 0.04, roughness: 0.76, emissive: lightenHex(accentColor, 0.18) },
            locked: true,
        }),
        makeObject({
            id: 'logo-fascia',
            kind: 'primitive',
            type: 'fascia',
            label: 'Logo Fascia',
            dimensions: { width: Math.min(width * 0.45, 3.2), height: 0.28, depth: 0.12 },
            position: [0, 3.2, -(depth / 2) + 0.18],
            material: { preset_id: 'brushed-gold', color: accentColor, metalness: 0.2, roughness: 0.34 },
            locked: true,
        }),
        makeObject({
            id: 'logo-beam',
            kind: 'primitive',
            type: 'logo_beam',
            label: 'Logo Beam',
            dimensions: { width: width * 0.5, height: 0.24, depth: 0.24 },
            position: [0, 2.92, -(depth / 2) + 0.58],
            material: { preset_id: 'brushed-gold', color: accentColor, metalness: 0.24, roughness: 0.32, emissive: lightenHex(accentColor, 0.22) },
            locked: true,
        }),
        makeObject({
            id: 'portal-left',
            kind: 'primitive',
            type: 'portal_leg',
            label: 'Portal Left',
            dimensions: { width: 0.74, height: 3.24, depth: 0.52 },
            position: [-(width * 0.22), 1.62, -0.12],
            material: { preset_id: 'gallery-white', color: lightenHex(mainColor, 0.02), metalness: 0.05, roughness: 0.72 },
            locked: true,
        }),
        makeObject({
            id: 'portal-right',
            kind: 'primitive',
            type: 'portal_leg',
            label: 'Portal Right',
            dimensions: { width: 0.74, height: 3.24, depth: 0.52 },
            position: [width * 0.22, 1.62, -0.12],
            material: { preset_id: 'gallery-white', color: lightenHex(mainColor, 0.02), metalness: 0.05, roughness: 0.72 },
            locked: true,
        }),
        makeObject({
            id: 'arch-primary',
            kind: 'primitive',
            type: 'arch_band',
            label: 'Primary Arch',
            dimensions: { width: width * 0.48, height: 1.9, depth: 0.42 },
            position: [-(width * 0.11), 1.96, -0.18],
            material: { preset_id: 'brushed-gold', color: accentColor, metalness: 0.18, roughness: 0.38, emissive: lightenHex(accentColor, 0.16) },
            locked: true,
            params: { innerRadius: 1.12, thickness: 0.28, curvature: 0.7, roundedness: 0.2 },
        }),
        makeObject({
            id: 'arch-secondary',
            kind: 'primitive',
            type: 'arch_band',
            label: 'Secondary Arch',
            dimensions: { width: width * 0.44, height: 1.84, depth: 0.4 },
            position: [width * 0.22, 1.92, 0.08],
            material: { preset_id: 'brushed-gold', color: lightenHex(accentColor, 0.06), metalness: 0.18, roughness: 0.38, emissive: lightenHex(accentColor, 0.18) },
            locked: true,
            params: { innerRadius: 1.04, thickness: 0.24, curvature: 0.72, roundedness: 0.18 },
        }),
    ];

    if (normalizedBrief.partial_open_side_details || /semi-open|partial/i.test(normalizedBrief.stand_type)) {
        objects.push(
            makeObject({
                id: 'side-partition',
                kind: 'primitive',
                type: 'partition',
                label: 'Semi-open Partition',
                dimensions: { width: depth * 0.42, height: 2.8, depth: wallThickness },
                position: [(width / 2) - 0.45, 1.4, -0.2],
                rotation: [0, -Math.PI / 2, 0],
                material: { color: mainColor, metalness: 0.03, roughness: 0.86 },
                locked: true,
            }),
            makeObject({
                id: 'glass-fin',
                kind: 'primitive',
                type: 'plane',
                label: 'Glass Side Fin',
                dimensions: { width: 1.4, height: 2.4, depth: 0.03 },
                position: [(width / 2) - 1.12, 1.2, 0.66],
                rotation: [0, -Math.PI / 5, 0],
                material: { preset_id: 'clear-glass', color: '#dceef5', metalness: 0.04, roughness: 0.08, opacity: 0.3, double_sided: true },
                locked: true,
            }),
        );
    }

    objects.push(
        makeObject({
            id: 'reception-counter',
            kind: 'asset',
            type: 'reception-desk',
            assetKey: 'reception-desk',
            label: 'Reception Counter',
            dimensions: { width: Math.min(2.2, width * 0.34), height: 1.05, depth: 0.82 },
            position: [-(width / 2) + 1.4, 0.525, (depth / 2) - 0.95],
            material: { preset_id: 'anodized-aluminum', color: '#e5d8c1', metalness: 0.14, roughness: 0.6 },
        }),
        makeObject({
            id: 'access-ramp',
            kind: 'primitive',
            type: 'ramp',
            label: 'Accessibility Ramp',
            dimensions: { width: 1.2, height: 0.16, depth: 1.4 },
            position: [0, 0.08, (depth / 2) - 0.9],
            material: { color: '#d3cbbb', metalness: 0.04, roughness: 0.72 },
        }),
        makeObject({
            id: 'center-model',
            kind: 'primitive',
            type: 'plinth',
            label: 'Main Model Plinth',
            dimensions: { width: 1.9, height: 0.88, depth: 1.9 },
            position: [0, 0.44, 0],
            material: { color: '#f0ece3', metalness: 0.08, roughness: 0.72 },
        }),
        makeObject({
            id: 'coffee-sideboard',
            kind: 'primitive',
            type: 'av_cabinet',
            label: 'Coffee / Storage Cabinet',
            dimensions: { width: 1.15, height: 1.1, depth: 0.6 },
            position: [-(width / 2) + 1.12, 0.55, (depth / 2) - 2.1],
            material: { preset_id: 'anodized-aluminum', color: '#d9d3c9', metalness: 0.18, roughness: 0.42 },
        }),
    );

    const screenCount = Math.max(parseCountFromText(normalizedBrief.screen_requirements, 2), 2);
    for (let index = 0; index < Math.min(screenCount, 3); index += 1) {
        const offset = (index - ((Math.min(screenCount, 3) - 1) / 2)) * 1.45;
        objects.push(
            makeObject({
                id: `screen-${index + 1}`,
                kind: 'primitive',
                type: 'screen',
                label: `Screen ${index + 1}`,
            dimensions: { width: 1.1, height: 1.9, depth: 0.1 },
            position: [offset, 1.65, -(depth / 2) + 0.16],
            material: { preset_id: 'polished-obsidian', color: '#1f2937', metalness: 0.22, roughness: 0.28, emissive: '#0f172a' },
            }),
        );
    }

    objects.push(
        makeObject({
            id: 'glass-focal-fin',
            kind: 'primitive',
            type: 'plane',
            label: 'Glass Feature Plane',
            dimensions: { width: 1.4, height: 2.4, depth: 0.03 },
            position: [(width / 2) - 1.5, 1.2, 0.1],
            rotation: [0, -Math.PI / 8, 0],
            material: { preset_id: 'clear-glass', color: '#d9edf7', opacity: 0.32, double_sided: true, metalness: 0.04, roughness: 0.08 },
        }),
    );

    objects.push(
        makeObject({
            id: 'touch-kiosk',
            kind: 'asset',
            type: 'screen-kiosk',
            assetKey: 'screen-kiosk',
            label: 'Touch Kiosk',
            position: [(width / 2) - 1.1, 0, (depth / 2) - 1.25],
            rotation: [0, -Math.PI / 5, 0],
        }),
        makeObject({
            id: 'screen-cluster-wall',
            kind: 'primitive',
            type: 'screen_cluster_wall',
            label: 'Screen Cluster Wall',
            dimensions: { width: 2.3, height: 2.5, depth: 0.18 },
            position: [0, 1.25, -(depth / 2) + 0.24],
            material: { preset_id: 'polished-obsidian', color: '#232c36', metalness: 0.18, roughness: 0.28, emissive: '#5b8ad6' },
        }),
        makeObject({
            id: 'side-model-1',
            kind: 'asset',
            type: 'display-plinth',
            assetKey: 'display-plinth',
            label: 'Side Display 1',
            position: [-(width / 2) + 1.2, 0, -0.9],
        }),
        makeObject({
            id: 'side-model-2',
            kind: 'asset',
            type: 'display-plinth',
            assetKey: 'display-plinth',
            label: 'Side Display 2',
            position: [(width / 2) - 1.2, 0, -0.9],
        }),
        makeObject({
            id: 'display-low-1',
            kind: 'asset',
            type: 'display-plinth',
            assetKey: 'display-plinth-low',
            label: 'Display Podium 1',
            position: [-(width / 2) + 1.8, 0, -0.2],
        }),
        makeObject({
            id: 'display-low-2',
            kind: 'asset',
            type: 'display-plinth',
            assetKey: 'display-plinth-low',
            label: 'Display Podium 2',
            position: [(width / 2) - 1.8, 0, -0.2],
        }),
    );

    const discussionPoints = Math.min(Math.max(parseCountFromText(normalizedBrief.meeting_requirements, 4), 2), 8);
    const clusterCount = Math.max(2, Math.min(Math.ceil(discussionPoints / 2), 4));
    for (let index = 0; index < clusterCount; index += 1) {
        const x = -(width / 2) + 1.7 + (index % 2) * 2.0;
        const z = 0.9 + Math.floor(index / 2) * 1.6;
        objects.push(
            makeObject({
                id: `meeting-table-${index + 1}`,
                kind: 'asset',
                type: 'meeting-table',
                assetKey: 'meeting-table-round',
                label: `Meeting Table ${index + 1}`,
                position: [x, 0, z],
            }),
            makeObject({
                id: `meeting-chair-${index + 1}-a`,
                kind: 'asset',
                type: 'chair',
                assetKey: 'chair-modern',
                label: `Meeting Chair ${index + 1}A`,
                position: [x - 0.6, 0, z],
                rotation: [0, Math.PI / 2, 0],
            }),
            makeObject({
                id: `meeting-chair-${index + 1}-b`,
                kind: 'asset',
                type: 'chair',
                assetKey: 'chair-modern',
                label: `Meeting Chair ${index + 1}B`,
                position: [x + 0.6, 0, z],
                rotation: [0, -Math.PI / 2, 0],
            }),
        );
    }

    objects.push(
        makeObject({
            id: 'vip-sofa',
            kind: 'asset',
            type: 'sofa',
            assetKey: 'sofa-lounge',
            label: 'VIP Sofa',
            position: [(width / 2) - 1.55, 0, 1.2],
            rotation: [0, -Math.PI / 2, 0],
        }),
        makeObject({
            id: 'vip-enclosure',
            kind: 'primitive',
            type: 'lounge_enclosure',
            label: 'VIP Enclosure',
            dimensions: { width: 2.6, height: 2.1, depth: 1.1 },
            position: [(width / 2) - 1.45, 1.05, 1.2],
            material: { preset_id: 'gallery-white', color: lightenHex(mainColor, 0.08), metalness: 0.03, roughness: 0.82 },
        }),
        makeObject({
            id: 'vip-coffee-table',
            kind: 'asset',
            type: 'coffee-table',
            assetKey: 'coffee-table',
            label: 'VIP Coffee Table',
            position: [(width / 2) - 1.0, 0, 1.2],
        }),
        makeObject({
            id: 'vip-planter',
            kind: 'asset',
            type: 'planter',
            assetKey: 'planter-tall',
            label: 'VIP Planter',
            position: [(width / 2) - 0.5, 0, 2.0],
        }),
    );

    scene.objects = objects;
    return scene;
}

export function enrichStandDesignSceneAssemblies(scene = {}, { brief = {}, conceptIndex = 0 } = {}) {
    const normalizedScene = normalizeStandDesignScene(scene, brief);
    const heuristicScene = createHeuristicStandScene({ brief, conceptIndex });
    const nextObjects = Array.isArray(normalizedScene.objects) ? [...normalizedScene.objects] : [];
    const existingIds = new Set(nextObjects.map((item) => item.id));
    const existingTypeCounts = nextObjects.reduce((acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
    }, {});
    const criticalAssemblyItems = heuristicScene.objects.filter((item) => (
        [
            'raised_floor',
            'branded_wall',
            'fascia',
            'logo_beam',
            'portal_leg',
            'arch_band',
            'screen_cluster_wall',
            'lounge_enclosure',
            'plinth',
            'reception-desk',
            'wall',
        ].includes(item.type)
    ));
    const criticalAssemblyIds = new Set([
        'entry-threshold',
        'floor-trim-front',
        'floor-trim-left',
        'floor-trim-right',
        'rear-return-left',
        'rear-return-right',
    ]);

    criticalAssemblyItems.forEach((item) => {
        const targetCount = criticalAssemblyIds.has(item.id)
            ? 1
            : item.type === 'portal_leg' || item.type === 'arch_band'
                ? 2
                : item.type === 'wall'
                    ? 3
                    : item.type === 'fascia'
                        ? 3
                        : 1;
        const currentCount = existingTypeCounts[item.type] || 0;
        if (!criticalAssemblyIds.has(item.id) && currentCount >= targetCount) return;
        if (criticalAssemblyIds.has(item.id) && existingIds.has(item.id)) return;
        const clone = makeObject({
            ...item,
            id: existingIds.has(item.id) ? `${item.id}-assembly` : item.id,
            groupId: item.group_id || inferAssemblyGroup(item.type),
            locked: true,
        });
        nextObjects.push(clone);
        existingIds.add(clone.id);
        existingTypeCounts[item.type] = (existingTypeCounts[item.type] || 0) + 1;
    });

    return {
        ...normalizedScene,
        objects: nextObjects,
    };
}

function inferAssemblyGroup(type = '') {
    if (/screen|kiosk|av/.test(type)) return 'av';
    if (/fascia|logo|brand/.test(type)) return 'branding';
    if (/plinth|display/.test(type)) return 'display';
    if (/counter|reception|ramp/.test(type)) return 'entry';
    if (/lounge/.test(type)) return 'vip';
    return 'core';
}

export function buildStandDesignSceneJsonSchema() {
    return {
        type: 'object',
        additionalProperties: false,
        required: ['version', 'units', 'footprint', 'camera', 'lighting', 'match_camera', 'objects'],
        properties: {
            version: { type: 'string' },
            units: { type: 'string' },
            footprint: {
                type: 'object',
                additionalProperties: false,
                required: ['width', 'depth', 'height'],
                properties: {
                    width: { type: 'number' },
                    depth: { type: 'number' },
                    height: { type: 'number' },
                },
            },
            camera: {
                type: 'object',
                additionalProperties: false,
                required: ['preset', 'position', 'target'],
                properties: {
                    preset: { type: 'string' },
                    position: {
                        type: 'array',
                        minItems: 3,
                        maxItems: 3,
                        items: { type: 'number' },
                    },
                    target: {
                        type: 'array',
                        minItems: 3,
                        maxItems: 3,
                        items: { type: 'number' },
                    },
                },
            },
            lighting: {
                type: 'object',
                additionalProperties: false,
                required: ['environment', 'intensity'],
                properties: {
                    environment: { type: 'string' },
                    intensity: { type: 'number' },
                },
            },
            match_camera: {
                type: 'object',
                additionalProperties: false,
                required: ['preset', 'position', 'target'],
                properties: {
                    preset: { type: 'string' },
                    position: {
                        type: 'array',
                        minItems: 3,
                        maxItems: 3,
                        items: { type: 'number' },
                    },
                    target: {
                        type: 'array',
                        minItems: 3,
                        maxItems: 3,
                        items: { type: 'number' },
                    },
                },
            },
            objects: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['id', 'kind', 'type', 'position', 'rotation', 'scale', 'dimensions', 'material', 'label', 'locked', 'visible', 'params'],
                    properties: {
                        id: { type: 'string' },
                        kind: { type: 'string', enum: ['primitive', 'asset'] },
                        type: { type: 'string' },
                        asset_key: { type: 'string' },
                        position: {
                            type: 'array',
                            minItems: 3,
                            maxItems: 3,
                            items: { type: 'number' },
                        },
                        rotation: {
                            type: 'array',
                            minItems: 3,
                            maxItems: 3,
                            items: { type: 'number' },
                        },
                        scale: {
                            type: 'array',
                            minItems: 3,
                            maxItems: 3,
                            items: { type: 'number' },
                        },
                        dimensions: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['width', 'height', 'depth'],
                            properties: {
                                width: { type: 'number' },
                                height: { type: 'number' },
                                depth: { type: 'number' },
                            },
                        },
                        material: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['color', 'metalness', 'roughness'],
                            properties: {
                                preset_id: { type: 'string' },
                                color: { type: 'string' },
                                metalness: { type: 'number' },
                                roughness: { type: 'number' },
                                emissive: { type: 'string' },
                                opacity: { type: 'number' },
                                double_sided: { type: 'boolean' },
                            },
                        },
                        label: { type: 'string' },
                        locked: { type: 'boolean' },
                        visible: { type: 'boolean' },
                        group_id: { type: 'string' },
                        mirror_of: { type: 'string' },
                        params: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                innerRadius: { type: 'number' },
                                thickness: { type: 'number' },
                                curvature: { type: 'number' },
                                roundedness: { type: 'number' },
                            },
                        },
                    },
                },
            },
        },
    };
}

export function normalizeStandDesignSceneObject(raw = {}, index = 0) {
    const kind = normalizeText(raw.kind) === 'asset' ? 'asset' : 'primitive';
    const primitive = kind === 'primitive' ? getStandDesignPrimitive(normalizeText(raw.type)) : null;
    const assetKey = kind === 'asset' ? normalizeText(raw.asset_key || raw.assetKey) : '';
    const asset = kind === 'asset' ? getStandDesignAsset(assetKey) : null;

    if (kind === 'primitive' && !primitive) {
        throw new Error(`Unknown primitive type "${normalizeText(raw.type)}"`);
    }

    if (kind === 'asset') {
        if (!assetKey || !STAND_DESIGN_ALLOWED_ASSET_KEYS.includes(assetKey) || !asset) {
            throw new Error(`Unknown asset key "${assetKey || normalizeText(raw.asset_key)}"`);
        }
    }

    return makeObject({
        id: raw.id || `obj-${index + 1}`,
        kind,
        type: kind === 'primitive' ? primitive.type : asset.type,
        assetKey,
        label: raw.label,
        position: raw.position,
        rotation: raw.rotation,
        scale: raw.scale,
        dimensions: raw.dimensions || primitive?.dimensions || asset?.dimensions,
        material: raw.material || primitive?.defaultMaterial || asset?.defaultMaterial,
        locked: raw.locked,
        visible: raw.visible,
        groupId: raw.group_id || raw.groupId,
        mirrorOf: raw.mirror_of || raw.mirrorOf,
        params: raw.params,
    });
}

export function normalizeStandDesignScene(raw = {}, brief = {}) {
    const empty = createEmptyStandScene(brief);
    const scene = {
        version: normalizeText(raw.version) || STAND_DESIGN_SCENE_VERSION,
        units: normalizeText(raw.units) || STAND_DESIGN_SCENE_UNITS,
        footprint: normalizeDimensions(raw.footprint, empty.footprint),
        camera: {
            preset: normalizeText(raw.camera?.preset) || empty.camera.preset,
            position: normalizeVector3(raw.camera?.position, empty.camera.position),
            target: normalizeVector3(raw.camera?.target, empty.camera.target),
        },
        lighting: {
            environment: normalizeText(raw.lighting?.environment) || 'studio',
            intensity: clampNumber(raw.lighting?.intensity, 1, 0.2, 4),
        },
        match_camera: {
            preset: normalizeText(raw.match_camera?.preset) || empty.match_camera.preset,
            position: normalizeVector3(raw.match_camera?.position, empty.match_camera.position),
            target: normalizeVector3(raw.match_camera?.target, empty.match_camera.target),
        },
        objects: Array.isArray(raw.objects)
            ? raw.objects.map((item, index) => normalizeStandDesignSceneObject(item, index))
            : [],
    };

    return scene;
}

export function validateStandDesignScene(raw = {}, brief = {}) {
    const scene = normalizeStandDesignScene(raw, brief);
    if (!Array.isArray(scene.objects)) {
        throw new Error('Scene objects are required');
    }
    return scene;
}

export function createSceneObjectFromPalette({
    primitiveType = '',
    assetKey = '',
    label = '',
}) {
    if (primitiveType && STAND_DESIGN_ALLOWED_PRIMITIVE_TYPES.includes(primitiveType)) {
        const primitive = getStandDesignPrimitive(primitiveType);
        return makeObject({
            kind: 'primitive',
            type: primitiveType,
            label: label || primitive.label,
            dimensions: primitive.dimensions,
            material: primitive.defaultMaterial,
        });
    }

    if (assetKey && STAND_DESIGN_ALLOWED_ASSET_KEYS.includes(assetKey)) {
        const asset = getStandDesignAsset(assetKey);
        return makeObject({
            kind: 'asset',
            type: asset.type,
            assetKey,
            label: label || asset.label,
            dimensions: asset.dimensions,
            material: asset.defaultMaterial,
        });
    }

    throw new Error('Unknown palette item');
}
