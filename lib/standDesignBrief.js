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

function appendIfPresent(parts, label, value) {
    const text = normalizeText(value);
    if (text) {
        parts.push(`${label}: ${text}`);
    }
}

export function buildStandDesignStructuredPrompt(brief = {}) {
    const normalized = normalizeStandDesignBrief(brief);
    const lines = [];

    appendIfPresent(lines, 'Client', normalized.client_name);
    appendIfPresent(lines, 'Event', normalized.event_name);
    appendIfPresent(lines, 'Location', normalized.location);
    appendIfPresent(lines, 'Stand size', normalized.stand_size);
    appendIfPresent(lines, 'Stand type', normalized.stand_type);
    appendIfPresent(lines, 'Open sides / access', normalized.open_sides);
    appendIfPresent(lines, 'Semi-open wall details', normalized.partial_open_side_details);
    appendIfPresent(lines, 'Brand name', normalized.brand_name);
    appendIfPresent(lines, 'Brand colors', normalized.brand_colors);
    appendIfPresent(lines, 'Branding elements', normalized.branding_elements);
    appendIfPresent(lines, 'Screen requirements', normalized.screen_requirements);
    appendIfPresent(lines, 'Reception requirements', normalized.reception_requirements);
    appendIfPresent(lines, 'Project model display', normalized.model_display_requirements);
    appendIfPresent(lines, 'Flooring', normalized.flooring_requirements);
    appendIfPresent(lines, 'Accessibility', normalized.accessibility_requirements);
    appendIfPresent(lines, 'Discussion / meeting areas', normalized.meeting_requirements);
    appendIfPresent(lines, 'VIP area', normalized.vip_requirements);
    appendIfPresent(lines, 'Material direction', normalized.material_direction_notes);
    appendIfPresent(lines, 'Avoid', normalized.avoid_notes);
    appendIfPresent(lines, 'Extra notes', normalized.extra_notes);

    return lines.join('\n');
}

function classifyCoverage(value, mode = 'review') {
    if (!normalizeText(value)) return 'possibly-missing';
    if (mode === 'likely') return 'likely-included';
    return 'needs-review';
}

export function buildStandDesignCoverageSummary(brief = {}) {
    const normalized = normalizeStandDesignBrief(brief);
    return [
        {
            key: 'stand-format',
            label: 'Stand size / type',
            status: classifyCoverage(
                normalized.stand_size || normalized.stand_type,
                normalized.stand_size || normalized.stand_type ? 'likely' : 'review',
            ),
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
