export const STAND_DESIGN_STYLE_PRESETS = [
    {
        id: 'bold',
        label: 'Bold / Experimental',
        summary: 'High-impact, concept-forward stand ideas with dramatic form and visual theater.',
        promptModifier: 'Prioritize bold architecture, experimental form language, dramatic lighting, and strong visual impact while keeping the booth commercially believable for a client presentation.',
        guidanceScale: 13,
    },
    {
        id: 'crisp',
        label: 'Crisp / Branding Focused',
        summary: 'Clean, detailed, brand-ready concepts with sharp lines and disciplined presentation value.',
        promptModifier: 'Prioritize a polished exhibition-stand rendering with crisp detailing, strong branding surfaces, clear circulation, and presentation-ready composition.',
        guidanceScale: 15,
    },
    {
        id: 'fast',
        label: 'Fast / Stable',
        summary: 'Balanced, reliable outputs for everyday ideation and brainstorming sessions.',
        promptModifier: 'Prioritize a stable, practical exhibition-stand concept with balanced composition, clear communication, and reliable everyday ideation quality.',
        guidanceScale: 10,
    },
];

export const STAND_DESIGN_ANGLE_OPTIONS = [
    { id: '', label: 'Top-level notes only' },
    { id: 'front', label: 'Front' },
    { id: 'side', label: 'Side' },
    { id: 'perspective', label: 'Perspective' },
];

export const STAND_DESIGN_MODES = [
    { id: 'generate', label: 'Generate New Concept' },
    { id: 'edit', label: 'Edit & Enhance Existing Design' },
];

export function getStandDesignStylePreset(id) {
    return STAND_DESIGN_STYLE_PRESETS.find((preset) => preset.id === id) || STAND_DESIGN_STYLE_PRESETS[1];
}

export function isValidStandDesignStylePreset(id) {
    return STAND_DESIGN_STYLE_PRESETS.some((preset) => preset.id === id);
}

export function isValidStandDesignAngle(id) {
    return STAND_DESIGN_ANGLE_OPTIONS.some((option) => option.id === id);
}

export function isValidStandDesignMode(id) {
    return STAND_DESIGN_MODES.some((mode) => mode.id === id);
}
