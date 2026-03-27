'use client';

import { useEffect, useMemo, useState } from 'react';
import { STAND_DESIGN_ANGLE_OPTIONS, STAND_DESIGN_MODES, STAND_DESIGN_STYLE_PRESETS } from '@/lib/standDesignConfig';
import { createDefaultStandDesignBrief, getStandDesignBriefSections, summarizeStandDesignBrief } from '@/lib/standDesignBrief';

function createDraft() {
    return {
        id: null,
        mode: 'generate',
        prompt: '',
        refinement_prompt: '',
        style_preset: 'crisp',
        angle: '',
        reference_image_path: '',
        brief: createDefaultStandDesignBrief(),
        concepts: [],
        provider: '',
        model: '',
    };
}

function buildUploadAccept() {
    return 'image/png,image/jpeg,image/webp';
}

function toLocalDate(value) {
    if (!value) return '';
    try {
        return new Date(value).toLocaleString();
    } catch {
        return '';
    }
}

function normalizeConcept(concept = {}, index = 0) {
    return {
        id: concept.id || `concept-${index + 1}`,
        path: concept.path || '',
        mimeType: concept.mimeType || 'image/png',
        title: concept.title || `Concept ${index + 1}`,
        summary: concept.summary || '',
        refinement_prompt: concept.refinement_prompt || '',
        source_variant: concept.source_variant || '',
        prompt: concept.prompt || '',
        coverage: Array.isArray(concept.coverage) ? concept.coverage : [],
        views: Array.isArray(concept.views) ? concept.views : [],
        created_at: concept.created_at || '',
    };
}

function normalizeDesignRecord(raw = {}) {
    return {
        ...createDraft(),
        ...raw,
        brief: { ...createDefaultStandDesignBrief(), ...(raw?.brief || {}) },
        concepts: Array.isArray(raw?.concepts) ? raw.concepts.map(normalizeConcept) : [],
    };
}

function getCoverageTone(status) {
    if (status === 'likely-included') return 'is-good';
    if (status === 'possibly-missing') return 'is-warning';
    return 'is-neutral';
}

function getCoverageLabel(status) {
    if (status === 'likely-included') return 'Likely included';
    if (status === 'possibly-missing') return 'Possibly missing';
    return 'Needs review';
}

export default function StandDesignStudio() {
    const [records, setRecords] = useState([]);
    const [form, setForm] = useState(createDraft());
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [viewGenerationIndex, setViewGenerationIndex] = useState(null);
    const [uploadingField, setUploadingField] = useState('');
    const [message, setMessage] = useState({ type: '', text: '' });
    const [aiStatus, setAiStatus] = useState({ configured: false, model: '' });

    const selectedRecord = useMemo(() => records.find((item) => String(item.id) === String(form.id)) || null, [records, form.id]);
    const briefSummary = useMemo(() => summarizeStandDesignBrief(form.brief), [form.brief]);

    async function loadStandDesigns() {
        setLoading(true);
        try {
            const response = await fetch('/api/stand-design', { cache: 'no-store' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to load stand design studio');
            const items = Array.isArray(data.items) ? data.items.map(normalizeDesignRecord) : [];
            setRecords(items);
            setAiStatus(data.ai || { configured: false, model: '' });
            if (items[0] && !form.id) setForm(items[0]);
        } catch (error) {
            setMessage({ type: 'error', text: error.message || 'Failed to load stand design studio' });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadStandDesigns();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function flash(type, text) {
        setMessage({ type, text });
    }

    function setField(field, value) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    function setBriefField(field, value) {
        setForm((current) => ({ ...current, brief: { ...current.brief, [field]: value } }));
    }

    function setConceptField(index, field, value) {
        setForm((current) => {
            const nextConcepts = [...current.concepts];
            nextConcepts[index] = { ...normalizeConcept(nextConcepts[index], index), [field]: value };
            return { ...current, concepts: nextConcepts };
        });
    }

    async function uploadImageToField(file, field, options = {}) {
        if (!file) return;
        setUploadingField(field);
        try {
            const body = new FormData();
            body.append('files', file);
            const response = await fetch('/api/upload', { method: 'POST', body });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to upload image');
            const uploaded = Array.isArray(data.files) ? data.files[0] : null;
            if (!uploaded?.path) throw new Error('Upload did not return an image path');
            if (options.scope === 'brief') setBriefField(field, uploaded.path);
            else setField(field, uploaded.path);
            if (options.forceEditMode) setField('mode', 'edit');
            flash('success', 'Image uploaded');
        } catch (error) {
            flash('error', error.message || 'Failed to upload image');
        } finally {
            setUploadingField('');
        }
    }

    async function submitGeneration({ regenerate = false, conceptIndex = null, payloadOverride = null } = {}) {
        setBusy(true);
        flash('', '');
        try {
            const endpoint = regenerate && (payloadOverride?.id || form.id) ? `/api/stand-design/${payloadOverride?.id || form.id}/regenerate` : '/api/stand-design/generate';
            const payload = normalizeDesignRecord(payloadOverride || form);
            const body = conceptIndex === null ? payload : { ...payload, concept_index: conceptIndex };
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to generate stand design concepts');
            const nextItem = normalizeDesignRecord(data.item);
            setForm(nextItem);
            setAiStatus(data.ai || aiStatus);
            setRecords((current) => [nextItem, ...current.filter((item) => String(item.id) !== String(nextItem.id))]);
            flash('success', conceptIndex === null ? (regenerate ? 'Stand design regenerated' : '2 concepts generated') : `Concept ${conceptIndex + 1} regenerated`);
        } catch (error) {
            flash('error', error.message || 'Failed to generate stand design concepts');
        } finally {
            setBusy(false);
        }
    }

    async function deleteRecord(recordId) {
        if (!window.confirm('Delete this stand design record?')) return;
        setBusy(true);
        try {
            const response = await fetch(`/api/stand-design/${recordId}`, { method: 'DELETE' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to delete stand design');
            const nextRecords = records.filter((item) => String(item.id) !== String(recordId));
            setRecords(nextRecords);
            if (String(form.id) === String(recordId)) setForm(nextRecords[0] || createDraft());
            flash('success', 'Stand design deleted');
        } catch (error) {
            flash('error', error.message || 'Failed to delete stand design');
        } finally {
            setBusy(false);
        }
    }

    function resetDraft() {
        setForm(createDraft());
        flash('', '');
    }

    function applyConceptAsReference(conceptPath) {
        setForm((current) => ({ ...current, mode: 'edit', reference_image_path: conceptPath }));
        flash('success', 'Concept moved into edit mode as the new reference');
    }

    async function refineConcept(index) {
        const concept = form.concepts[index];
        if (!concept?.path) return;
        const payload = { ...form, mode: 'edit', reference_image_path: concept.path, refinement_prompt: concept.refinement_prompt || form.refinement_prompt };
        await submitGeneration({ regenerate: Boolean(form.id), conceptIndex: index, payloadOverride: payload });
    }

    async function generateConceptViews(index) {
        const concept = form.concepts[index];
        if (!form.id || !concept?.path) return;
        setBusy(true);
        setViewGenerationIndex(index);
        flash('success', `Generating all views for ${concept.title || `Concept ${index + 1}`}... this can take a few minutes.`);
        try {
            const response = await fetch(`/api/stand-design/${form.id}/views`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    concept_index: index,
                    prompt: form.prompt,
                    brief: form.brief,
                    style_preset: form.style_preset,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to generate all views');
            const nextItem = normalizeDesignRecord(data.item);
            setForm(nextItem);
            setAiStatus(data.ai || aiStatus);
            setRecords((current) => [nextItem, ...current.filter((item) => String(item.id) !== String(nextItem.id))]);
            flash('success', `Generated all views for ${concept.title || `Concept ${index + 1}`}`);
        } catch (error) {
            flash('error', error.message || 'Failed to generate all views');
        } finally {
            setBusy(false);
            setViewGenerationIndex(null);
        }
    }

    return (
        <div className="stand-design-page">
            <div className="stand-design-shell">
                <div className="stand-design-hero">
                    <div>
                        <div className="quotation-dashboard-kicker">Pico Bahrain</div>
                        <h1>Stand Design</h1>
                        <p>Generate 2 different Pico-style stand concepts with stronger layout accuracy, richer brand control, and clearer comparison for client-facing reviews.</p>
                    </div>
                    <div className="stand-design-hero-status">
                        <span className={`stand-design-status-pill ${aiStatus.configured ? 'is-live' : 'is-warning'}`}>{aiStatus.configured ? 'Gemini Ready' : 'Gemini Not Configured'}</span>
                        <span className="stand-design-status-meta">{aiStatus.model ? `Model: ${aiStatus.model}` : 'Set GEMINI_API_KEY and GEMINI_IMAGE_MODEL on the server'}</span>
                    </div>
                </div>

                {message.text ? <div className={`stand-design-alert ${message.type === 'error' ? 'is-error' : 'is-success'}`}>{message.text}</div> : null}

                <div className="stand-design-grid">
                    <aside className="stand-design-panel stand-design-controls">
                        <div className="stand-design-section">
                            <div className="stand-design-section-label">Mode</div>
                            <div className="stand-design-mode-row">
                                {STAND_DESIGN_MODES.map((mode) => (
                                    <button key={mode.id} type="button" className={`stand-design-chip ${form.mode === mode.id ? 'is-active' : ''}`} onClick={() => setField('mode', mode.id)}>{mode.label}</button>
                                ))}
                            </div>
                        </div>

                        <div className="stand-design-brief-card">
                            <div className="stand-design-card-header">
                                <div><h3>Structured Stand Brief</h3><p>Layout-first inputs are treated as the main truth for generation.</p></div>
                                {briefSummary ? <span className="stand-design-mini-pill">{briefSummary}</span> : null}
                            </div>
                            {getStandDesignBriefSections().map((section) => (
                                <div key={section.id} className="stand-design-brief-section">
                                    <h4>{section.title}</h4>
                                    <div className="stand-design-brief-grid">
                                        {section.fields.map(([field, label]) => (
                                            <label key={field} className="stand-design-field">
                                                <span>{label}</span>
                                                <textarea
                                                    className="stand-design-textarea stand-design-textarea-small"
                                                    rows={field.includes('notes') || field.includes('requirements') || field.includes('details') ? 3 : 2}
                                                    value={form.brief[field] || ''}
                                                    onChange={(event) => setBriefField(field, event.target.value)}
                                                    placeholder={label}
                                                />
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            <div className="stand-design-upload-grid">
                                <label className={`stand-design-upload ${uploadingField === 'logo_image_path' ? 'is-busy' : ''}`}>
                                    <input type="file" accept={buildUploadAccept()} onChange={(event) => uploadImageToField(event.target.files?.[0], 'logo_image_path', { scope: 'brief' })} hidden />
                                    <strong>{uploadingField === 'logo_image_path' ? 'Uploading...' : 'Upload Logo / Branding Asset'}</strong>
                                    <span>Use the real logo or brand graphic as a control asset for more disciplined branding.</span>
                                </label>
                                <label className={`stand-design-upload ${uploadingField === 'brand_reference_image_path' ? 'is-busy' : ''}`}>
                                    <input type="file" accept={buildUploadAccept()} onChange={(event) => uploadImageToField(event.target.files?.[0], 'brand_reference_image_path', { scope: 'brief' })} hidden />
                                    <strong>{uploadingField === 'brand_reference_image_path' ? 'Uploading...' : 'Upload Brand Reference'}</strong>
                                    <span>Optional inspiration reference for mood, finishes, or brand language.</span>
                                </label>
                            </div>
                        </div>

                        <div className="stand-design-section">
                            <label className="stand-design-section-label" htmlFor="stand-design-prompt">Design Prompt</label>
                            <textarea id="stand-design-prompt" className="stand-design-textarea" rows={6} value={form.prompt} onChange={(event) => setField('prompt', event.target.value)} placeholder="Add extra direction, client preferences, creative emphasis, or anything not already captured in the structured brief." />
                        </div>

                        <div className="stand-design-section">
                            <div className="stand-design-section-label">Style Direction</div>
                            <div className="stand-design-style-grid">
                                {STAND_DESIGN_STYLE_PRESETS.map((preset) => (
                                    <button key={preset.id} type="button" className={`stand-design-style-card ${form.style_preset === preset.id ? 'is-active' : ''}`} onClick={() => setField('style_preset', preset.id)}>
                                        <strong>{preset.label}</strong><span>{preset.summary}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="stand-design-section">
                            <div className="stand-design-section-label">Reference Image</div>
                            <label className={`stand-design-upload ${uploadingField === 'reference_image_path' ? 'is-busy' : ''}`}>
                                <input type="file" accept={buildUploadAccept()} onChange={(event) => uploadImageToField(event.target.files?.[0], 'reference_image_path', { forceEditMode: true })} hidden />
                                <strong>{uploadingField === 'reference_image_path' ? 'Uploading...' : 'Upload and refine design'}</strong>
                                <span>Use this for edits, angle changes, layout refinement, logo cleanup, or targeted visual adjustments.</span>
                            </label>
                            {form.reference_image_path ? (
                                <div className="stand-design-reference-preview">
                                    <img src={form.reference_image_path} alt="Reference stand design" />
                                    <div className="stand-design-reference-actions">
                                        <span>{form.reference_image_path.split('/').pop()}</span>
                                        <button type="button" className="stand-design-inline-link" onClick={() => setField('reference_image_path', '')}>Clear</button>
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        {form.mode === 'edit' ? (
                            <div className="stand-design-edit-tools">
                                <div className="stand-design-section">
                                    <label className="stand-design-section-label" htmlFor="stand-design-refinement">Follow-up Refinement</label>
                                    <textarea id="stand-design-refinement" className="stand-design-textarea stand-design-textarea-small" rows={4} value={form.refinement_prompt} onChange={(event) => setField('refinement_prompt', event.target.value)} placeholder="Make it more premium, open the layout, increase branding, refine materials, move VIP area..." />
                                </div>
                                <div className="stand-design-section">
                                    <label className="stand-design-section-label" htmlFor="stand-design-angle">Angle Focus</label>
                                    <select id="stand-design-angle" className="stand-design-select" value={form.angle} onChange={(event) => setField('angle', event.target.value)}>
                                        {STAND_DESIGN_ANGLE_OPTIONS.map((option) => <option key={option.id || 'none'} value={option.id}>{option.label}</option>)}
                                    </select>
                                </div>
                            </div>
                        ) : null}

                        <div className="stand-design-actions">
                            <button type="button" className="stand-design-primary-btn" disabled={busy} onClick={() => submitGeneration({ regenerate: Boolean(form.id) })}>{busy ? 'Generating...' : (form.id ? 'Regenerate 2 Concepts' : 'Generate 2 Concepts')}</button>
                            <button type="button" className="stand-design-secondary-btn" onClick={resetDraft} disabled={busy}>Start Fresh</button>
                        </div>
                    </aside>

                    <section className="stand-design-panel stand-design-results">
                        <div className="stand-design-results-header">
                            <div><h2>{selectedRecord ? 'Saved Stand Design' : 'Concept Comparison'}</h2><p>Compare the 2 concept directions, refine one concept without losing the other, and keep the brief visible while reviewing client options.</p></div>
                            {selectedRecord ? <div className="stand-design-result-meta"><span>{selectedRecord.mode === 'edit' ? 'Edit & Enhance' : 'Generate New'}</span><span>{toLocalDate(selectedRecord.updated_at)}</span></div> : null}
                        </div>

                        <div className="stand-design-record-meta">
                            <div><span className="stand-design-meta-label">Structured Brief</span><p>{briefSummary || 'No structured brief yet'}</p></div>
                            <div><span className="stand-design-meta-label">Prompt</span><p>{form.prompt || 'No extra prompt yet'}</p></div>
                            <div><span className="stand-design-meta-label">Style</span><p>{STAND_DESIGN_STYLE_PRESETS.find((preset) => preset.id === form.style_preset)?.label || 'Crisp / Branding Focused'}</p></div>
                        </div>

                        <div className="stand-design-results-grid stand-design-results-grid-wide">
                            {(form.concepts || []).length > 0 ? form.concepts.map((concept, index) => (
                                <article key={concept.id || index} className="stand-design-result-card stand-design-result-card-xl">
                                    <div className="stand-design-result-header">
                                        <div><div className="stand-design-result-label">{concept.title || `Concept ${index + 1}`}</div><p className="stand-design-result-summary">{concept.summary || 'Pico-style concept direction'}</p></div>
                                        <span className="stand-design-mini-pill">{concept.source_variant || `concept-${index + 1}`}</span>
                                    </div>
                                    <img src={concept.path} alt={`Stand concept ${index + 1}`} className="stand-design-result-image stand-design-result-image-xl" />
                                    <div className="stand-design-result-actions">
                                        <a className="stand-design-inline-link" href={concept.path} target="_blank" rel="noreferrer">Preview</a>
                                        <a className="stand-design-inline-link" href={concept.path} download>Download</a>
                                        <button type="button" className="stand-design-inline-link" onClick={() => applyConceptAsReference(concept.path)}>Use as next reference</button>
                                        <button type="button" className="stand-design-inline-link" disabled={busy} onClick={() => submitGeneration({ regenerate: Boolean(form.id), conceptIndex: index, payloadOverride: { ...form, mode: 'edit', reference_image_path: concept.path, refinement_prompt: concept.refinement_prompt || form.refinement_prompt } })}>Regenerate this concept only</button>
                                        <button type="button" className="stand-design-inline-link" disabled={busy || !form.id} onClick={() => generateConceptViews(index)}>
                                            {viewGenerationIndex === index ? 'Generating views...' : 'Generate all views'}
                                        </button>
                                    </div>
                                    <div className="stand-design-concept-refine">
                                        <label className="stand-design-field">
                                            <span>Refine this concept</span>
                                            <textarea className="stand-design-textarea stand-design-textarea-small" rows={3} value={concept.refinement_prompt || ''} onChange={(event) => setConceptField(index, 'refinement_prompt', event.target.value)} placeholder="Make it more premium, open the stand more, increase branding, move VIP area..." />
                                        </label>
                                        <button type="button" className="stand-design-secondary-btn" disabled={busy} onClick={() => refineConcept(index)}>Refine This Concept</button>
                                    </div>
                                    {Array.isArray(concept.views) && concept.views.length > 0 ? (
                                        <div className="stand-design-views">
                                            <div className="stand-design-coverage-header">
                                                <strong>Same Stand - All Views</strong>
                                                <span>{viewGenerationIndex === index ? 'Generating front, back, side, and perspective views...' : 'Generated from the selected concept image'}</span>
                                            </div>
                                            <div className="stand-design-view-grid">
                                                {concept.views.map((view) => (
                                                    <article key={view.id || view.path} className="stand-design-view-card">
                                                        <img src={view.path} alt={view.label || 'Stand view'} className="stand-design-view-image" />
                                                        <div className="stand-design-view-meta">
                                                            <strong>{view.label || 'View'}</strong>
                                                            <span>{view.angle || ''}</span>
                                                        </div>
                                                        <div className="stand-design-view-actions">
                                                            <a className="stand-design-inline-link" href={view.path} target="_blank" rel="noreferrer">Preview</a>
                                                            <a className="stand-design-inline-link" href={view.path} download>Download</a>
                                                            <button type="button" className="stand-design-inline-link" onClick={() => applyConceptAsReference(view.path)}>Use as next reference</button>
                                                        </div>
                                                    </article>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                    <div className="stand-design-coverage">
                                        <div className="stand-design-coverage-header"><strong>Requirements Coverage</strong><span>Heuristic review, not a guarantee</span></div>
                                        <div className="stand-design-coverage-grid">
                                            {(concept.coverage || []).map((item) => (
                                                <div key={item.key} className={`stand-design-coverage-item ${getCoverageTone(item.status)}`}>
                                                    <div className="stand-design-coverage-top"><strong>{item.label}</strong><span>{getCoverageLabel(item.status)}</span></div>
                                                    <p>{item.source || 'Not specified in the brief.'}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </article>
                            )) : (
                                <div className="stand-design-empty-state"><strong>No concepts yet</strong><span>Fill the structured brief, add any extra prompt notes, and generate 2 Pico-style stand concepts.</span></div>
                            )}
                        </div>
                    </section>
                </div>

                <section className="stand-design-saved-panel">
                    <div className="stand-design-saved-header"><div><h2>Saved Design Records</h2><p>Reopen a brief, compare prior rounds, or delete older concepts once the client direction is locked.</p></div></div>
                    {loading ? (
                        <div className="stand-design-empty-state"><strong>Loading studio records...</strong></div>
                    ) : records.length === 0 ? (
                        <div className="stand-design-empty-state"><strong>No saved stand designs yet</strong><span>Your generated concept sets will appear here after the first successful run.</span></div>
                    ) : (
                        <div className="stand-design-saved-grid">
                            {records.map((record) => (
                                <article key={record.id} className={`stand-design-saved-card ${String(record.id) === String(form.id) ? 'is-active' : ''}`}>
                                    <div className="stand-design-saved-card-header">
                                        <div><strong>{summarizeStandDesignBrief(record.brief) || (record.mode === 'edit' ? 'Edit & Enhance' : 'Generate New')}</strong><span>{toLocalDate(record.updated_at)}</span></div>
                                        <button type="button" className="stand-design-inline-link is-danger" onClick={() => deleteRecord(record.id)}>Delete</button>
                                    </div>
                                    <p>{record.prompt || 'Structured brief driven record'}</p>
                                    <div className="stand-design-saved-thumbs">{(record.concepts || []).slice(0, 2).map((concept) => <img key={concept.id} src={concept.path} alt="Saved stand concept" />)}</div>
                                    <button type="button" className="stand-design-secondary-btn" onClick={() => setForm(normalizeDesignRecord(record))}>Open Record</button>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
