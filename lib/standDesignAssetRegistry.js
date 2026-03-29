const MATERIAL_PRESET_REGISTRY = {
    'oak-parquet': {
        id: 'oak-parquet',
        label: 'Oak Parquet',
        color: '#bf9558',
        metalness: 0.04,
        roughness: 0.62,
        emissive: '',
        opacity: 1,
        doubleSided: false,
    },
    'brushed-gold': {
        id: 'brushed-gold',
        label: 'Brushed Gold',
        color: '#c8a24b',
        metalness: 0.42,
        roughness: 0.34,
        emissive: '#e5c66f',
        opacity: 1,
        doubleSided: false,
    },
    'anodized-aluminum': {
        id: 'anodized-aluminum',
        label: 'Anodized Aluminum',
        color: '#b7bec7',
        metalness: 0.56,
        roughness: 0.28,
        emissive: '',
        opacity: 1,
        doubleSided: false,
    },
    'red-velvet': {
        id: 'red-velvet',
        label: 'Red Velvet',
        color: '#8c2032',
        metalness: 0.02,
        roughness: 0.92,
        emissive: '',
        opacity: 1,
        doubleSided: false,
    },
    'polished-obsidian': {
        id: 'polished-obsidian',
        label: 'Polished Obsidian',
        color: '#171a21',
        metalness: 0.28,
        roughness: 0.12,
        emissive: '',
        opacity: 1,
        doubleSided: false,
    },
    'clear-glass': {
        id: 'clear-glass',
        label: 'Clear Glass',
        color: '#d9edf7',
        metalness: 0.04,
        roughness: 0.08,
        emissive: '',
        opacity: 0.28,
        doubleSided: true,
    },
    'gallery-white': {
        id: 'gallery-white',
        label: 'Gallery White',
        color: '#f2ede3',
        metalness: 0.03,
        roughness: 0.78,
        emissive: '',
        opacity: 1,
        doubleSided: false,
    },
};

const ASSET_REGISTRY = {
    'chair-modern': {
        key: 'chair-modern',
        label: 'Modern Chair',
        category: 'Seating',
        path: '/stand-design-kit/chair-modern.glb',
        thumbnail: '/products/chair.svg',
        type: 'chair',
        dimensions: { width: 0.58, height: 0.92, depth: 0.58 },
        defaultMaterial: { color: '#d7c6a0', metalness: 0.12, roughness: 0.72 },
    },
    'chair-slim': {
        key: 'chair-slim',
        label: 'Slim Chair',
        category: 'Seating',
        path: '/stand-design-kit/chair-modern.glb',
        thumbnail: '/products/chair.svg',
        type: 'chair',
        dimensions: { width: 0.5, height: 0.9, depth: 0.52 },
        defaultMaterial: { color: '#ddd6c9', metalness: 0.08, roughness: 0.76 },
    },
    'sofa-lounge': {
        key: 'sofa-lounge',
        label: 'Lounge Sofa',
        category: 'Seating',
        path: '/stand-design-kit/sofa-lounge.glb',
        thumbnail: '/products/sofa.svg',
        type: 'sofa',
        dimensions: { width: 1.9, height: 0.88, depth: 0.86 },
        defaultMaterial: { color: '#e7dcc2', metalness: 0.08, roughness: 0.78 },
    },
    'sofa-curved': {
        key: 'sofa-curved',
        label: 'Curved Sofa',
        category: 'Seating',
        path: '/stand-design-kit/sofa-lounge.glb',
        thumbnail: '/products/sofa.svg',
        type: 'sofa',
        dimensions: { width: 2.2, height: 0.9, depth: 1.0 },
        defaultMaterial: { color: '#efe5d4', metalness: 0.06, roughness: 0.8 },
    },
    'coffee-table': {
        key: 'coffee-table',
        label: 'Coffee Table',
        category: 'Tables',
        path: '/stand-design-kit/coffee-table.glb',
        thumbnail: '/products/table.svg',
        type: 'coffee-table',
        dimensions: { width: 0.9, height: 0.42, depth: 0.9 },
        defaultMaterial: { color: '#cab17d', metalness: 0.18, roughness: 0.58 },
    },
    'meeting-table-round': {
        key: 'meeting-table-round',
        label: 'Meeting Table',
        category: 'Tables',
        path: '/stand-design-kit/meeting-table-round.glb',
        thumbnail: '/products/table.svg',
        type: 'meeting-table',
        dimensions: { width: 0.95, height: 0.76, depth: 0.95 },
        defaultMaterial: { color: '#f0ede8', metalness: 0.1, roughness: 0.62 },
    },
    'reception-desk': {
        key: 'reception-desk',
        label: 'Reception Desk',
        category: 'Furniture',
        path: '/stand-design-kit/display-plinth.glb',
        thumbnail: '/products/table.svg',
        type: 'reception-desk',
        dimensions: { width: 2.25, height: 1.05, depth: 0.9 },
        defaultMaterial: { preset_id: 'anodized-aluminum', color: '#d8dbe1', metalness: 0.24, roughness: 0.42 },
    },
    'screen-kiosk': {
        key: 'screen-kiosk',
        label: 'Touch Kiosk',
        category: 'AV',
        path: '/stand-design-kit/screen-kiosk.glb',
        thumbnail: '/products/touch-screen.svg',
        type: 'screen-kiosk',
        dimensions: { width: 0.85, height: 1.9, depth: 0.4 },
        defaultMaterial: { color: '#d7dce4', metalness: 0.26, roughness: 0.5 },
    },
    'screen-wide': {
        key: 'screen-wide',
        label: 'Wide Presentation Screen',
        category: 'AV',
        path: '/stand-design-kit/screen-kiosk.glb',
        thumbnail: '/products/touch-screen.svg',
        type: 'screen-kiosk',
        dimensions: { width: 1.8, height: 1.35, depth: 0.24 },
        defaultMaterial: { color: '#cad3dd', metalness: 0.24, roughness: 0.46 },
    },
    'display-plinth': {
        key: 'display-plinth',
        label: 'Display Plinth',
        category: 'Display',
        path: '/stand-design-kit/display-plinth.glb',
        thumbnail: '/products/pedestal.svg',
        type: 'display-plinth',
        dimensions: { width: 0.7, height: 1.02, depth: 0.7 },
        defaultMaterial: { color: '#efe7d7', metalness: 0.08, roughness: 0.76 },
    },
    'display-plinth-low': {
        key: 'display-plinth-low',
        label: 'Low Display Podium',
        category: 'Display',
        path: '/stand-design-kit/display-plinth.glb',
        thumbnail: '/products/pedestal.svg',
        type: 'display-plinth',
        dimensions: { width: 1.0, height: 0.55, depth: 1.0 },
        defaultMaterial: { color: '#f3ede3', metalness: 0.06, roughness: 0.74 },
    },
    'planter-tall': {
        key: 'planter-tall',
        label: 'Planter',
        category: 'Decor',
        path: '/stand-design-kit/planter-tall.glb',
        thumbnail: '/products/flag.svg',
        type: 'planter',
        dimensions: { width: 0.52, height: 1.28, depth: 0.52 },
        defaultMaterial: { color: '#6b845d', metalness: 0.02, roughness: 0.86 },
    },
    'bar-stool': {
        key: 'bar-stool',
        label: 'Bar Stool',
        category: 'Seating',
        path: '/stand-design-kit/bar-stool.glb',
        thumbnail: '/products/chair.svg',
        type: 'stool',
        dimensions: { width: 0.48, height: 0.8, depth: 0.48 },
        defaultMaterial: { color: '#d9d0c4', metalness: 0.14, roughness: 0.68 },
    },
};

const PRIMITIVE_REGISTRY = {
    floor: {
        key: 'floor',
        label: 'Floor',
        category: 'Structure',
        type: 'floor',
        dimensions: { width: 6, height: 0.12, depth: 6 },
        defaultMaterial: { preset_id: 'oak-parquet', color: '#c49f63', metalness: 0.06, roughness: 0.64 },
    },
    raised_floor: {
        key: 'raised_floor',
        label: 'Raised Floor',
        category: 'Structure',
        type: 'raised_floor',
        dimensions: { width: 6, height: 0.2, depth: 6 },
        defaultMaterial: { color: '#d6d2cb', metalness: 0.04, roughness: 0.68 },
    },
    wall: {
        key: 'wall',
        label: 'Wall Panel',
        category: 'Structure',
        type: 'wall',
        dimensions: { width: 3, height: 3.6, depth: 0.16 },
        defaultMaterial: { color: '#efece5', metalness: 0.04, roughness: 0.82 },
    },
    branded_wall: {
        key: 'branded_wall',
        label: 'Branded Feature Wall',
        category: 'Structure',
        type: 'branded_wall',
        dimensions: { width: 4, height: 3.8, depth: 0.18 },
        defaultMaterial: { color: '#f5f1e8', metalness: 0.04, roughness: 0.78 },
    },
    partition: {
        key: 'partition',
        label: 'Partition',
        category: 'Structure',
        type: 'partition',
        dimensions: { width: 2, height: 2.6, depth: 0.12 },
        defaultMaterial: { color: '#f5f3ef', metalness: 0.02, roughness: 0.88 },
    },
    plane: {
        key: 'plane',
        label: 'Plane',
        category: 'Structure',
        type: 'plane',
        dimensions: { width: 2.4, height: 2.6, depth: 0.03 },
        defaultMaterial: { preset_id: 'clear-glass', color: '#d9edf7', metalness: 0.04, roughness: 0.08, opacity: 0.28, doubleSided: true },
    },
    lounge_enclosure: {
        key: 'lounge_enclosure',
        label: 'Lounge Enclosure',
        category: 'Structure',
        type: 'lounge_enclosure',
        dimensions: { width: 2.6, height: 2.4, depth: 1.2 },
        defaultMaterial: { color: '#efe7d8', metalness: 0.05, roughness: 0.78 },
    },
    counter: {
        key: 'counter',
        label: 'Reception Counter',
        category: 'Furniture',
        type: 'counter',
        dimensions: { width: 2.2, height: 1.05, depth: 0.82 },
        defaultMaterial: { preset_id: 'anodized-aluminum', color: '#e4dbc9', metalness: 0.12, roughness: 0.66 },
    },
    storage_core: {
        key: 'storage_core',
        label: 'Storage Core',
        category: 'Structure',
        type: 'storage_core',
        dimensions: { width: 2.2, height: 2.8, depth: 2.2 },
        defaultMaterial: { color: '#ece7db', metalness: 0.05, roughness: 0.8 },
    },
    av_cabinet: {
        key: 'av_cabinet',
        label: 'AV Cabinet',
        category: 'AV',
        type: 'av_cabinet',
        dimensions: { width: 1.6, height: 2.1, depth: 0.8 },
        defaultMaterial: { color: '#ddd8cc', metalness: 0.08, roughness: 0.7 },
    },
    ramp: {
        key: 'ramp',
        label: 'Ramp',
        category: 'Access',
        type: 'ramp',
        dimensions: { width: 1.2, height: 0.18, depth: 1.5 },
        defaultMaterial: { color: '#d7d1c3', metalness: 0.04, roughness: 0.74 },
    },
    plinth: {
        key: 'plinth',
        label: 'Main Plinth',
        category: 'Display',
        type: 'plinth',
        dimensions: { width: 1.6, height: 0.95, depth: 1.6 },
        defaultMaterial: { color: '#f1ebe0', metalness: 0.06, roughness: 0.72 },
    },
    portal_leg: {
        key: 'portal_leg',
        label: 'Portal Leg',
        category: 'Structure',
        type: 'portal_leg',
        dimensions: { width: 1.0, height: 3.8, depth: 0.6 },
        defaultMaterial: { color: '#efe4d1', metalness: 0.04, roughness: 0.78 },
    },
    arch_band: {
        key: 'arch_band',
        label: 'Curved Canopy',
        category: 'Structure',
        type: 'arch_band',
        dimensions: { width: 4.8, height: 2.2, depth: 0.45 },
        defaultMaterial: { preset_id: 'brushed-gold', color: '#dac39a', metalness: 0.16, roughness: 0.42 },
    },
    fascia: {
        key: 'fascia',
        label: 'Logo Fascia',
        category: 'Branding',
        type: 'fascia',
        dimensions: { width: 2.8, height: 0.28, depth: 0.12 },
        defaultMaterial: { preset_id: 'brushed-gold', color: '#d1a64d', metalness: 0.18, roughness: 0.38 },
    },
    logo_beam: {
        key: 'logo_beam',
        label: 'Logo Beam',
        category: 'Branding',
        type: 'logo_beam',
        dimensions: { width: 3.6, height: 0.24, depth: 0.24 },
        defaultMaterial: { color: '#c59b47', metalness: 0.2, roughness: 0.34 },
    },
    screen: {
        key: 'screen',
        label: 'Wall Screen',
        category: 'AV',
        type: 'screen',
        dimensions: { width: 1.1, height: 1.9, depth: 0.12 },
        defaultMaterial: { color: '#1f2937', metalness: 0.26, roughness: 0.32 },
    },
    screen_cluster_wall: {
        key: 'screen_cluster_wall',
        label: 'Screen Cluster Wall',
        category: 'AV',
        type: 'screen_cluster_wall',
        dimensions: { width: 3.2, height: 2.6, depth: 0.18 },
        defaultMaterial: { preset_id: 'polished-obsidian', color: '#202b38', metalness: 0.18, roughness: 0.34 },
    },
};

export const STAND_DESIGN_GLTF_LIBRARY = ASSET_REGISTRY;
export const STAND_DESIGN_MATERIAL_PRESET_REGISTRY = MATERIAL_PRESET_REGISTRY;
export const STAND_DESIGN_ASSET_REGISTRY = ASSET_REGISTRY;
export const STAND_DESIGN_PRIMITIVE_REGISTRY = PRIMITIVE_REGISTRY;
export const STAND_DESIGN_ALLOWED_ASSET_KEYS = Object.keys(ASSET_REGISTRY);
export const STAND_DESIGN_ALLOWED_PRIMITIVE_TYPES = Object.keys(PRIMITIVE_REGISTRY);
export const STAND_DESIGN_ALLOWED_OBJECT_TYPES = [
    ...STAND_DESIGN_ALLOWED_PRIMITIVE_TYPES,
    ...Object.values(ASSET_REGISTRY).map((item) => item.type),
];

export function getStandDesignAsset(key) {
    return ASSET_REGISTRY[key] || null;
}

export function getStandDesignMaterialPreset(key) {
    return MATERIAL_PRESET_REGISTRY[key] || null;
}

export function getStandDesignPrimitive(key) {
    return PRIMITIVE_REGISTRY[key] || null;
}

export function getStandDesignAssetPalette() {
    return Object.values(ASSET_REGISTRY);
}

export function getStandDesignPrimitivePalette() {
    return Object.values(PRIMITIVE_REGISTRY);
}

export function getStandDesignMaterialPalette() {
    return Object.values(MATERIAL_PRESET_REGISTRY);
}
