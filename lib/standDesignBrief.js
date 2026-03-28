function normalizeText(value) {
    return String(value || '').trim();
}

export function createDefaultStandDesignBrief() {
    return {
        client_name: '',
        event_name: '',
        location: '',
        stand_size: '',
        stand_type: '',
        open_sides: '',
        partial_open_side_details: '',
        brand_name: '',
        brand_colors: '',
        branding_elements: '',
        logo_image_path: '',
        brand_reference_image_path: '',
        screen_requirements: '',
        reception_requirements: '',
        model_display_requirements: '',
        flooring_requirements: '',
        accessibility_requirements: '',
        meeting_requirements: '',
        vip_requirements: '',
        material_direction_notes: '',
        avoid_notes: '',
        extra_notes: '',
    };
}

export function normalizeStandDesignBrief(raw = {}) {
    const defaults = createDefaultStandDesignBrief();
    const next = { ...defaults };
    for (const [key] of Object.entries(defaults)) {
        next[key] = normalizeText(raw?.[key]);
    }
    return next;
}

export function getStandDesignBriefSections() {
    return [
        {
            id: 'project',
            title: 'Project Brief',
            fields: [
                ['client_name', 'Client Name'],
                ['event_name', 'Event Name'],
                ['location', 'Location'],
                ['stand_size', 'Stand Size'],
                ['stand_type', 'Stand Type'],
                ['open_sides', 'Open Sides / Access'],
                ['partial_open_side_details', 'Semi-open Wall / Partial Open Details'],
            ],
        },
        {
            id: 'branding',
            title: 'Branding & Style',
            fields: [
                ['brand_name', 'Brand Name'],
                ['brand_colors', 'Brand Colors'],
                ['branding_elements', 'Branding Elements'],
                ['material_direction_notes', 'Material Direction Notes'],
                ['avoid_notes', 'Avoid / Prohibited Elements'],
            ],
        },
        {
            id: 'functional',
            title: 'Functional Requirements',
            fields: [
                ['screen_requirements', 'Screen Requirements'],
                ['reception_requirements', 'Reception Requirements'],
                ['model_display_requirements', 'Project Model Display'],
                ['flooring_requirements', 'Flooring'],
                ['accessibility_requirements', 'Accessibility'],
                ['meeting_requirements', 'Discussion / Meeting Areas'],
                ['vip_requirements', 'VIP Area'],
                ['extra_notes', 'Extra Notes'],
            ],
        },
    ];
}

export function summarizeStandDesignBrief(brief = {}) {
    const normalized = normalizeStandDesignBrief(brief);
    const summary = [];

    if (normalized.client_name) summary.push(normalized.client_name);
    if (normalized.event_name) summary.push(normalized.event_name);
    if (normalized.stand_size || normalized.stand_type) {
        summary.push([normalized.stand_size, normalized.stand_type].filter(Boolean).join(' · '));
    }
    if (normalized.location) summary.push(normalized.location);
    return summary.filter(Boolean).join(' | ');
}

export function buildStandDesignStructuredPrompt(brief = {}) {
    const normalized = normalizeStandDesignBrief(brief);
    const sections = [];

    // ── STAND ARCHITECTURE ── (structural truth — rendered first so the model anchors on it)
    const arch = [];
    if (normalized.stand_size) arch.push(`Footprint: ${normalized.stand_size}`);
    if (normalized.stand_type) arch.push(`Stand type / form: ${normalized.stand_type}`);
    if (normalized.open_sides) arch.push(`Open sides: ${normalized.open_sides}`);
    if (normalized.partial_open_side_details) arch.push(`Semi-open wall: ${normalized.partial_open_side_details}`);
    if (arch.length) {
        sections.push(
            'STAND ARCHITECTURE (must be structurally accurate):\n' +
            arch.map((l) => `  • ${l}`).join('\n'),
        );
    }

    // ── BRAND IDENTITY ──
    const brand = [];
    if (normalized.client_name) brand.push(`Client / exhibitor: ${normalized.client_name}`);
    if (normalized.brand_name && normalized.brand_name !== normalized.client_name) brand.push(`Brand: ${normalized.brand_name}`);
    if (normalized.brand_colors) brand.push(`Brand colors (use consistently throughout): ${normalized.brand_colors}`);
    if (normalized.branding_elements) brand.push(`Branding elements: ${normalized.branding_elements}`);
    if (normalized.material_direction_notes) brand.push(`Material / finish direction: ${normalized.material_direction_notes}`);
    if (brand.length) {
        sections.push(
            'BRAND IDENTITY:\n' +
            brand.map((l) => `  • ${l}`).join('\n'),
        );
    }

    // ── EVENT CONTEXT ──
    const ctx = [];
    if (normalized.event_name) ctx.push(`Event: ${normalized.event_name}`);
    if (normalized.location) ctx.push(`Venue / location: ${normalized.location}`);
    if (ctx.length) {
        sections.push(
            'EVENT CONTEXT:\n' +
            ctx.map((l) => `  • ${l}`).join('\n'),
        );
    }

    // ── REQUIRED SPATIAL ZONES ── (every zone must appear in the render)
    const zones = [];
    if (normalized.reception_requirements) zones.push(`ENTRANCE / RECEPTION ZONE — ${normalized.reception_requirements}`);
    if (normalized.screen_requirements) zones.push(`SCREEN / AV ZONE — ${normalized.screen_requirements}`);
    if (normalized.model_display_requirements) zones.push(`PROJECT MODEL DISPLAY ZONE — ${normalized.model_display_requirements}`);
    if (normalized.meeting_requirements) zones.push(`DISCUSSION / MEETING ZONE — ${normalized.meeting_requirements}`);
    if (normalized.vip_requirements) zones.push(`VIP ZONE — ${normalized.vip_requirements}`);
    if (zones.length) {
        sections.push(
            'REQUIRED SPATIAL ZONES — ALL must appear in the render. Do not omit, merge, or simplify any zone:\n' +
            zones.map((l) => `  • ${l}`).join('\n'),
        );
    }

    // ── FLOOR & ACCESSIBILITY ──
    const floor = [];
    if (normalized.flooring_requirements) floor.push(`Flooring: ${normalized.flooring_requirements}`);
    if (normalized.accessibility_requirements) floor.push(`Accessibility: ${normalized.accessibility_requirements}`);
    if (floor.length) {
        sections.push(
            'FLOOR & ACCESSIBILITY:\n' +
            floor.map((l) => `  • ${l}`).join('\n'),
        );
    }

    // ── CONSTRAINTS ──
    if (normalized.avoid_notes) {
        sections.push(`DO NOT INCLUDE: ${normalized.avoid_notes}`);
    }
    if (normalized.extra_notes) {
        sections.push(`Additional requirements: ${normalized.extra_notes}`);
    }

    return sections.join('\n\n');
}

function classifyCoverage(value) {
    // Any non-empty value means the requirement is captured — show as likely-included (green ✓)
    // Only missing values show as possibly-missing (amber ⚠)
    return normalizeText(value) ? 'likely-included' : 'possibly-missing';
}

export function buildStandDesignCoverageSummary(brief = {}) {
    const normalized = normalizeStandDesignBrief(brief);
    return [
        {
            key: 'stand-format',
            label: 'Stand size / type',
            status: classifyCoverage(normalized.stand_size || normalized.stand_type),
            source: [normalized.stand_size, normalized.stand_type].filter(Boolean).join(' · '),
        },
        {
            key: 'open-sides',
            label: 'Sides open / semi-open wall',
            status: classifyCoverage(normalized.open_sides || normalized.partial_open_side_details),
            source: [normalized.open_sides, normalized.partial_open_side_details].filter(Boolean).join(' · '),
        },
        {
            key: 'screens',
            label: 'Screen count / orientation',
            status: classifyCoverage(normalized.screen_requirements),
            source: normalized.screen_requirements,
        },
        {
            key: 'reception',
            label: 'Reception counter / hidden storage / snacks',
            status: classifyCoverage(normalized.reception_requirements),
            source: normalized.reception_requirements,
        },
        {
            key: 'models',
            label: 'Project models / spotlighted main model',
            status: classifyCoverage(normalized.model_display_requirements),
            source: normalized.model_display_requirements,
        },
        {
            key: 'flooring',
            label: 'Flooring',
            status: classifyCoverage(normalized.flooring_requirements),
            source: normalized.flooring_requirements,
        },
        {
            key: 'accessibility',
            label: 'Accessibility ramp',
            status: classifyCoverage(normalized.accessibility_requirements),
            source: normalized.accessibility_requirements,
        },
        {
            key: 'meeting',
            label: 'Discussion / meeting points',
            status: classifyCoverage(normalized.meeting_requirements),
            source: normalized.meeting_requirements,
        },
        {
            key: 'vip',
            label: 'VIP area',
            status: classifyCoverage(normalized.vip_requirements),
            source: normalized.vip_requirements,
        },
    ];
}

export function getConceptDirectionLabel(index) {
    return index === 0 ? 'Concept 1' : 'Concept 2';
}

export function getConceptDirectionSummary(index) {
    return index === 0
        ? 'Premium gallery-led direction with clear zoning and high client readability.'
        : 'More sculptural direction with stronger visual impact and a memorable visitor journey.';
}
