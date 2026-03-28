import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// All extractable brief fields with human descriptions fed to the AI
const BRIEF_FIELDS = {
    client_name: 'Company or client name',
    event_name: 'Exhibition, trade show, or event name',
    location: 'City, country, or venue name',
    stand_size: 'Stand footprint dimensions (e.g. 9×6m, 54 sqm)',
    stand_type: 'Stand type (island, corner, inline, peninsula, double-deck, etc.)',
    open_sides: 'Number of open sides and which directions (e.g. 3 open sides: front, left, right)',
    partial_open_side_details: 'Semi-open wall or partial open side details',
    brand_name: 'Brand name if different from client name',
    brand_colors: 'Brand colors (e.g. navy blue, gold, white)',
    branding_elements: 'Logo, signage, graphic panel, and branding element notes',
    material_direction_notes: 'Material or finish preferences (wood, metal, fabric, glass, etc.)',
    avoid_notes: 'Design elements, styles, or features to avoid',
    screen_requirements: 'Digital screens, LED walls, AV, and display technology needs',
    reception_requirements: 'Reception counter, storage, coffee bar, or hospitality zone',
    model_display_requirements: 'Physical architectural or product model display areas',
    flooring_requirements: 'Flooring type, pattern, or direction preferences',
    accessibility_requirements: 'Wheelchair access, ramps, or accessibility needs',
    meeting_requirements: 'Meeting rooms, discussion pods, or seating areas',
    vip_requirements: 'VIP lounge, private zone, or exclusive area',
    extra_notes: 'Any other relevant requirements or preferences',
};

function getApiKey() {
    return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
}

function getTextModel() {
    return String(process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash').trim();
}

function buildExtractionPrompt(userPrompt) {
    const fieldList = Object.entries(BRIEF_FIELDS)
        .map(([key, desc]) => `  "${key}": "${desc}"`)
        .join(',\n');

    return `You are an expert exhibition stand design consultant. Extract structured brief information from the following client brief.

The brief may be a free-text description, a structured document with numbered sections and bullet points, or a mix of both. Extract every piece of information you can find regardless of format.

Extraction rules:
- "stand_size": Look for dimensions like "6m × 6m", "36 sqm", "9x6", "54 square meters" etc.
- "stand_type": Look for "island", "corner", "inline", "peninsula", "double-deck", "semi-open" etc.
- "open_sides": Look for "3 open sides", "open from 3 sides", "4th side semi-open" etc.
- "partial_open_side_details": Any mention of a semi-open wall, partial wall, or partially closed side.
- "screen_requirements": Extract ALL screen/display info — sizes (65"), quantities, orientation (vertical/horizontal), positions, touch screens, LED walls.
- "reception_requirements": Reception counter, hidden storage, coffee bar, snack section, hospitality zone.
- "model_display_requirements": Physical scale models, model tables, spotlights for models, number of models.
- "flooring_requirements": Flooring material (parquet, carpet, tiles), patterns, direction, ramp.
- "accessibility_requirements": Wheelchair ramp, accessibility features, disabled access.
- "meeting_requirements": Discussion areas, meeting points, tables, chairs, seating configurations.
- "vip_requirements": VIP zone, VIP seating, sofas, private area, investor seating, coffee machines.
- "brand_colors": Color names or hex values mentioned as brand/primary colors.
- "branding_elements": Logos, signage text, graphic panels, fascia, branding assets.

Return ONLY a valid JSON object using these exact keys. Include only keys where the information is clearly present in the brief.
Keep each value concise — one or two sentences capturing the key facts. Do not truncate important details.
Do NOT include any explanation, markdown, or code fences — only the raw JSON object.

Available keys:
{
${fieldList}
}

Brief to analyze:
"""
${userPrompt.trim()}
"""`;
}

export async function POST(request) {
    try {
        const body = await request.json();
        const prompt = String(body?.prompt || '').trim();

        if (!prompt) {
            return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
        }

        const apiKey = getApiKey();
        if (!apiKey) {
            return NextResponse.json({ error: 'Gemini API key is not configured on the server.' }, { status: 503 });
        }

        const ai = new GoogleGenAI({ apiKey });
        const model = getTextModel();

        const response = await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: buildExtractionPrompt(prompt) }] }],
        });

        const rawText = String(response?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

        // Strip markdown code fences if the model adds them despite the instruction
        const cleaned = rawText
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/```\s*$/i, '')
            .trim();

        let extracted = {};
        try {
            extracted = JSON.parse(cleaned);
        } catch {
            return NextResponse.json(
                { error: 'AI response could not be parsed as JSON. Try a more descriptive prompt.' },
                { status: 422 },
            );
        }

        // Whitelist — only return known brief keys with non-empty string values
        const brief = {};
        for (const key of Object.keys(BRIEF_FIELDS)) {
            const value = String(extracted[key] || '').trim();
            if (value) brief[key] = value;
        }

        return NextResponse.json({ brief, count: Object.keys(brief).length });
    } catch (error) {
        return NextResponse.json(
            { error: error?.message || 'Failed to parse prompt into brief fields' },
            { status: 500 },
        );
    }
}
