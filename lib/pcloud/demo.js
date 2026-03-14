/**
 * pCloud Demo Seed Data — realistic file records for development.
 * Used when the real P:\ drive is unavailable.
 */

import { v4 as uuidv4 } from 'uuid';

export function generateDemoData() {
    const now = new Date().toISOString();
    const files = [
        // High confidence — well-organized client files
        { filename: 'tamkeen_quote_march.pdf', relativePath: 'Clients/Tamkeen/Ramadan Activation/Quotations/tamkeen_quote_march.pdf', ext: 'pdf', size: 245000, type: 'quotation', client: 'Tamkeen', project: 'Ramadan Activation', conf: 0.85, level: 'content_understood' },
        { filename: 'final_signed_contract.docx', relativePath: 'Clients/Nestle/Contracts/final_signed_contract.docx', ext: 'docx', size: 180000, type: 'contract', client: 'Nestle', project: null, conf: 0.82, level: 'content_understood' },
        { filename: 'booth_design_v3_final.pptx', relativePath: 'Clients/Tamkeen/Booth Design/booth_design_v3_final.pptx', ext: 'pptx', size: 5200000, type: 'design', client: 'Tamkeen', project: 'Booth Design', conf: 0.78, level: 'content_understood' },
        { filename: 'event_budget_2025.xlsx', relativePath: 'Clients/Gulf Air/Events/2025/event_budget_2025.xlsx', ext: 'xlsx', size: 98000, type: 'budget', client: 'Gulf Air', project: 'Events', conf: 0.80, level: 'content_understood' },
        { filename: 'exhibitor_list_march.csv', relativePath: 'Projects/BIGS 2025/Exhibitors/exhibitor_list_march.csv', ext: 'csv', size: 45000, type: 'report', client: null, project: 'BIGS 2025', conf: 0.65, level: 'content_understood' },

        // Medium confidence — some context available
        { filename: 'render_final_v2.jpg', relativePath: 'Projects/Mall Event/Renders/render_final_v2.jpg', ext: 'jpg', size: 3400000, type: 'render', client: null, project: 'Mall Event', conf: 0.55, level: 'filename_path_inferred' },
        { filename: 'meeting_notes_jan.txt', relativePath: 'Internal/Marketing/Meetings/meeting_notes_jan.txt', ext: 'txt', size: 12000, type: 'meeting_notes', client: null, project: null, conf: 0.50, level: 'filename_path_inferred' },
        { filename: 'invoice_2024_089.pdf', relativePath: 'Finance/Invoices/2024/invoice_2024_089.pdf', ext: 'pdf', size: 156000, type: 'invoice', client: null, project: null, conf: 0.60, level: 'filename_path_inferred' },
        { filename: 'logo_concept_draft.png', relativePath: 'Clients/Zain/Branding/logo_concept_draft.png', ext: 'png', size: 2100000, type: 'logo', client: 'Zain', project: 'Branding', conf: 0.58, level: 'filename_path_inferred' },
        { filename: 'floorplan_hall_a.pdf', relativePath: 'Projects/BIGS 2025/Floorplans/floorplan_hall_a.pdf', ext: 'pdf', size: 890000, type: 'floorplan', client: null, project: 'BIGS 2025', conf: 0.72, level: 'content_understood' },

        // Low confidence — needs review
        { filename: 'scan_001.png', relativePath: 'Misc/scan_001.png', ext: 'png', size: 1500000, type: null, client: null, project: null, conf: 0.15, level: 'needs_review' },
        { filename: 'IMG_20240315.jpg', relativePath: 'Photos/IMG_20240315.jpg', ext: 'jpg', size: 4200000, type: 'photo', client: null, project: null, conf: 0.20, level: 'needs_review' },
        { filename: 'document (1).pdf', relativePath: 'Downloads/document (1).pdf', ext: 'pdf', size: 340000, type: null, client: null, project: null, conf: 0.10, level: 'needs_review' },
        { filename: 'client_brief_note.mp3', relativePath: 'Audio/Meetings/client_brief_note.mp3', ext: 'mp3', size: 8500000, type: 'meeting_notes', client: null, project: null, conf: 0.25, level: 'needs_review' },
        { filename: 'untitled.docx', relativePath: 'Misc/untitled.docx', ext: 'docx', size: 28000, type: null, client: null, project: null, conf: 0.08, level: 'needs_review' },

        // Media files
        { filename: 'event_highlights.mp4', relativePath: 'Projects/BIGS 2025/Video/event_highlights.mp4', ext: 'mp4', size: 125000000, type: 'video', client: null, project: 'BIGS 2025', conf: 0.45, level: 'filename_path_inferred' },
        { filename: 'booth_walkthrough.mov', relativePath: 'Clients/Tamkeen/Ramadan Activation/Video/booth_walkthrough.mov', ext: 'mov', size: 340000000, type: 'video', client: 'Tamkeen', project: 'Ramadan Activation', conf: 0.55, level: 'filename_path_inferred' },

        // Well-named but no folder structure
        { filename: 'tamkeen_presentation_final.pptx', relativePath: 'tamkeen_presentation_final.pptx', ext: 'pptx', size: 7800000, type: 'presentation', client: 'Tamkeen', project: null, conf: 0.45, level: 'filename_path_inferred' },
        { filename: 'nestle_signage_specs.pdf', relativePath: 'nestle_signage_specs.pdf', ext: 'pdf', size: 560000, type: 'signage', client: 'Nestle', project: null, conf: 0.40, level: 'filename_path_inferred' },

        // Design files
        { filename: 'booth_panel_artwork.psd', relativePath: 'Clients/Gulf Air/Artwork/booth_panel_artwork.psd', ext: 'psd', size: 45000000, type: 'artwork', client: 'Gulf Air', project: 'Artwork', conf: 0.65, level: 'filename_path_inferred' },
        { filename: 'backdrop_layout.ai', relativePath: 'Clients/Zain/Designs/backdrop_layout.ai', ext: 'ai', size: 12000000, type: 'design', client: 'Zain', project: 'Designs', conf: 0.60, level: 'filename_path_inferred' },
    ];

    return files.map(f => {
        const id = uuidv4();
        const parentPath = f.relativePath.split('/').slice(0, -1).join('/');

        return {
            fileRecord: {
                id,
                filename: f.filename,
                extension: f.ext,
                mimeType: getMime(f.ext),
                sizeBytes: f.size,
                checksum: null,
                absolutePath: null,
                relativePath: f.relativePath,
                parentPath,
                sourceType: 'demo',
                sourceStatus: 'active',
                indexedAt: now,
                createdAtSource: now,
                updatedAtSource: now,
                isActive: true,
            },
            understanding: {
                id: uuidv4(),
                fileRecordId: id,
                understandingLevel: f.level,
                detectedClient: f.client,
                detectedProject: f.project,
                detectedCampaign: null,
                detectedDepartment: null,
                detectedDocumentType: f.type,
                detectedDocumentSubtype: null,
                detectedYear: null,
                detectedMonth: null,
                detectedLocation: null,
                detectedMediaType: getCategory(f.ext),
                detectedVersion: null,
                detectedStatus: null,
                shortSummary: f.type ? `${f.type.replace(/_/g, ' ')}${f.client ? ` for ${f.client}` : ''}` : `${getCategory(f.ext)} file`,
                extractedTextPreview: null,
                confidenceScore: f.conf,
                confidenceReason: `Demo data — ${f.level.replace(/_/g, ' ')}`,
                classifierVersion: 'v1.0-demo',
                requiresReview: f.conf < 0.6,
            },
            reviewItem: f.conf < 0.6 ? {
                id: uuidv4(),
                fileRecordId: id,
                reviewReason: f.conf < 0.3 ? 'very_low_confidence' : 'low_confidence',
                suggestedLabels: { client: f.client, project: f.project, documentType: f.type },
                confidenceScore: f.conf,
                status: 'pending',
            } : null,
        };
    });
}

function getMime(ext) {
    const map = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', csv: 'text/csv', txt: 'text/plain', jpg: 'image/jpeg', png: 'image/png', mp3: 'audio/mpeg', mp4: 'video/mp4', mov: 'video/quicktime', psd: 'image/vnd.adobe.photoshop', ai: 'application/illustrator' };
    return map[ext] || 'application/octet-stream';
}

function getCategory(ext) {
    const map = { pdf: 'document', docx: 'document', xlsx: 'document', pptx: 'document', csv: 'document', txt: 'document', jpg: 'image', png: 'image', mp3: 'audio', mp4: 'video', mov: 'video', psd: 'design', ai: 'design' };
    return map[ext] || 'unknown';
}
