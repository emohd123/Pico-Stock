'use client';
import { useEffect, useMemo, useState } from 'react';
import { STAND_DESIGN_ANGLE_OPTIONS, STAND_DESIGN_MODES, STAND_DESIGN_STYLE_PRESETS } from '@/lib/standDesignConfig';
import { buildStandDesignCoverageSummary, createDefaultStandDesignBrief, getStandDesignBriefSections, summarizeStandDesignBrief } from '@/lib/standDesignBrief';

// ─── helpers ─────────────────────────────────────────────────────────────────
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
function buildUploadAccept() { return 'image/png,image/jpeg,image/webp'; }
function buildDownloadFilename(brief = {}, label = '', suffix = '') {
  const slug = (str) => String(str || '').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  const client = slug(brief?.client_name || brief?.brand_name || '');
  const event = slug(brief?.event_name || brief?.stand_size || '');
  const parts = [client, event, slug(label), slug(suffix)].filter(Boolean);
  return (parts.join('-') || 'stand-concept') + '.png';
}
function toLocalDate(value) {
  if (!value) return '';
  try { return new Date(value).toLocaleString(); } catch { return ''; }
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
function getCoverageIcon(status) {
  if (status === 'likely-included') return '✓';
  if (status === 'possibly-missing') return '⚠';
  return '?';
}

// ─── sub-components ───────────────────────────────────────────────────────────
function RenderImageOrPlaceholder({ src, alt, className, placeholder }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className={`${className} stand-design-image-placeholder`}>{placeholder || 'Image unavailable'}</div>;
  }
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}

/** Full-screen modal overlay */
function Modal({ title, onClose, children }) {
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);
  return (
    <div className="sd-modal-backdrop" onClick={onClose}>
      <div className="sd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sd-modal-header">
          <strong>{title}</strong>
          <button type="button" className="sd-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="sd-modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Compact pill row + "Details" button that opens a modal */
function CoverageRow({ coverage, conceptTitle }) {
  const [open, setOpen] = useState(false);
  if (!coverage?.length) return null;
  const good = coverage.filter((c) => c.status === 'likely-included').length;
  const warn = coverage.filter((c) => c.status === 'possibly-missing').length;
  return (
    <div className="sd-coverage-bar">
      <div className="sd-coverage-pills">
        {coverage.map((item) => (
          <span key={item.key} className={`sd-coverage-pill ${getCoverageTone(item.status)}`} title={item.label}>
            {getCoverageIcon(item.status)} {item.label}
          </span>
        ))}
      </div>
      <div className="sd-coverage-summary">
        <span className="sd-cov-count is-good">{good} included</span>
        {warn > 0 && <span className="sd-cov-count is-warning">{warn} missing</span>}
        <button type="button" className="stand-design-inline-link" onClick={() => setOpen(true)}>View Details</button>
      </div>
      {open && (
        <Modal title={`Coverage — ${conceptTitle}`} onClose={() => setOpen(false)}>
          <div className="sd-coverage-detail-grid">
            {coverage.map((item) => (
              <div key={item.key} className={`sd-coverage-detail-item ${getCoverageTone(item.status)}`}>
                <div className="sd-coverage-detail-top">
                  <strong>{getCoverageIcon(item.status)} {item.label}</strong>
                  <span className="sd-coverage-detail-status">{getCoverageLabel(item.status)}</span>
                </div>
                {item.source && <p className="sd-coverage-detail-source">{item.source}</p>}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Collapsible section wrapper for the brief panel */
function CollapsibleSection({ id, title, collapsedSet, onToggle, children }) {
  const isCollapsed = collapsedSet.has(id);
  return (
    <div className={`stand-design-brief-section sd-collapsible ${isCollapsed ? 'is-collapsed' : ''}`}>
      <button type="button" className="sd-section-toggle" onClick={() => onToggle(id)}>
        <h4>{title}</h4>
        <span className="sd-chevron">{isCollapsed ? '▸' : '▾'}</span>
      </button>
      {!isCollapsed && <div className="sd-collapsible-body">{children}</div>}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export default function StandDesignStudio() {
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(createDraft());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [viewGenerationIndex, setViewGenerationIndex] = useState(null);
  const [uploadingField, setUploadingField] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [aiStatus, setAiStatus] = useState({ configured: false, model: '' });
  const [aiLoading, setAiLoading] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState(new Set());
  const [activeConcept, setActiveConcept] = useState(0);
  const [parsingBrief, setParsingBrief] = useState(false);
  const [briefParseInfo, setBriefParseInfo] = useState({ count: 0, show: false });
  const [regeneratingConceptIndex, setRegeneratingConceptIndex] = useState(null);
  const [expandedRecordId, setExpandedRecordId] = useState(null);

  const selectedRecord = useMemo(
    () => records.find((item) => String(item.id) === String(form.id)) || null,
    [records, form.id],
  );
  const briefSummary = useMemo(() => summarizeStandDesignBrief(form.brief), [form.brief]);
  // Live coverage — always derived from form.brief so it reflects the current state,
  // never stale from the generation-time snapshot stored in concept.coverage
  const liveCoverage = useMemo(() => buildStandDesignCoverageSummary(form.brief), [form.brief]);

  function toggleSection(id) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function loadStandDesigns() {
    setLoading(true);
    try {
      const response = await fetch('/api/stand-design', { cache: 'no-store' });
      const data = await response.json();
      if (data.ai) setAiStatus(data.ai);
      setAiLoading(false);
      if (!response.ok) throw new Error(data.error || 'Failed to load stand design studio');
      const items = Array.isArray(data.items) ? data.items.map(normalizeDesignRecord) : [];
      setRecords(items);
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

  // Auto-parse Design Prompt into brief fields (debounced, only fills empty fields)
  useEffect(() => {
    const prompt = form.prompt?.trim() || '';
    if (prompt.length < 60) return;
    const timer = setTimeout(() => parsePromptIntoBrief(prompt), 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.prompt]);

  async function parsePromptIntoBrief(promptText, { overwrite = false } = {}) {
    if (parsingBrief) return;
    setParsingBrief(true);
    try {
      const response = await fetch('/api/stand-design/parse-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText || form.prompt }),
      });
      const data = await response.json();
      if (!response.ok || !data.brief) return;
      let filled = 0;
      setForm((current) => {
        const nextBrief = { ...current.brief };
        for (const [key, value] of Object.entries(data.brief)) {
          // Auto-debounce: only fill empty fields; manual button: overwrite all extracted fields
          if ((overwrite || !nextBrief[key]?.trim()) && value) {
            nextBrief[key] = value;
            filled += 1;
          }
        }
        return filled > 0 ? { ...current, brief: nextBrief } : current;
      });
      if (data.count > 0) {
        setBriefParseInfo({ count: data.count, show: true });
        setTimeout(() => setBriefParseInfo((p) => ({ ...p, show: false })), 5000);
        // Auto-expand all brief sections so user immediately sees the filled fields
        setCollapsedSections(new Set());
      }
    } catch { /* silent — parse is best-effort */ }
    finally { setParsingBrief(false); }
  }

  function flash(type, text) { setMessage({ type, text }); }
  function setField(field, value) { setForm((current) => ({ ...current, [field]: value })); }
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
      const endpoint =
        regenerate && (payloadOverride?.id || form.id)
          ? `/api/stand-design/${payloadOverride?.id || form.id}/regenerate`
          : '/api/stand-design/generate';
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
      if (conceptIndex !== null) setActiveConcept(conceptIndex);
      else setActiveConcept(0);
      flash('success', conceptIndex === null
        ? regenerate ? 'Stand design regenerated' : '2 concepts generated'
        : `Concept ${conceptIndex + 1} regenerated`);
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

  function resetDraft() { setForm(createDraft()); flash('', ''); }

  function applyConceptAsReference(conceptPath) {
    setForm((current) => ({ ...current, mode: 'edit', reference_image_path: conceptPath }));
    flash('success', 'Concept set as reference — Edit & Enhance mode is now active in the left panel.');
    // Scroll so the user can see the reference image appear in the left panel
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function refineConcept(index) {
    const concept = form.concepts[index];
    if (!concept?.path) return;
    const payload = {
      ...form,
      mode: 'edit',
      reference_image_path: concept.path,
      refinement_prompt: concept.refinement_prompt || form.refinement_prompt,
    };
    await submitGeneration({ regenerate: Boolean(form.id), conceptIndex: index, payloadOverride: payload });
  }

  async function generateConceptViews(index) {
    const concept = form.concepts[index];
    if (!form.id) { flash('error', 'Save the design first before generating views.'); return; }
    if (!concept?.path) { flash('error', 'Concept image is not available. Try regenerating the concept first.'); return; }
    setBusy(true);
    setViewGenerationIndex(index);
    flash('', `Generating all views for ${concept.title || `Concept ${index + 1}`}… this can take a few minutes.`);
    try {
      const response = await fetch(`/api/stand-design/${form.id}/views`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept_index: index, prompt: form.prompt, brief: form.brief, style_preset: form.style_preset }),
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

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="stand-design-page">
      <div className="stand-design-shell">

        {/* Hero */}
        <div className="stand-design-hero">
          <div>
            <div className="quotation-dashboard-kicker">Pico Bahrain</div>
            <h1>Stand Design</h1>
            <p>Generate 2 different Pico-style stand concepts with stronger layout accuracy, richer brand control, and clearer comparison for client-facing reviews.</p>
          </div>
          <div className="stand-design-hero-status">
            <span className={`stand-design-status-pill ${aiLoading ? 'is-loading' : aiStatus.configured ? 'is-live' : 'is-warning'}`}>
              {aiLoading ? 'Checking…' : aiStatus.configured ? 'Gemini Ready' : 'Gemini Not Configured'}
            </span>
            <span className="stand-design-status-meta">
              {aiLoading ? '' : aiStatus.model ? `Model: ${aiStatus.model}` : 'Set GEMINI_API_KEY and GEMINI_IMAGE_MODEL on the server'}
            </span>
          </div>
        </div>

        {/* Alert */}
        {message.text
          ? <div className={`stand-design-alert ${message.type === 'error' ? 'is-error' : 'is-success'}`}>{message.text}</div>
          : null}

        {/* Main two-column grid */}
        <div className="stand-design-grid">

          {/* LEFT: Controls */}
          <aside className="stand-design-panel stand-design-controls">
            <div className="stand-design-controls-body">

            <div className="stand-design-section">
              <div className="stand-design-section-label">Mode</div>
              <div className="stand-design-mode-row">
                {STAND_DESIGN_MODES.map((mode) => (
                  <button key={mode.id} type="button"
                    className={`stand-design-chip ${form.mode === mode.id ? 'is-active' : ''}`}
                    onClick={() => setField('mode', mode.id)}>{mode.label}</button>
                ))}
              </div>
            </div>

            {/* Structured Brief with collapsible sections */}
            <div className="stand-design-brief-card">
              <div className="stand-design-card-header">
                <div>
                  <h3>Structured Stand Brief</h3>
                  <p>Layout-first inputs are treated as the main truth for generation.</p>
                </div>
                <div className="sd-brief-header-right">
                  {parsingBrief && <span className="sd-parse-spinner" title="Extracting from prompt…">⟳ Parsing…</span>}
                  {!parsingBrief && briefParseInfo.show && (
                    <span className="sd-parse-badge">✦ {briefParseInfo.count} fields filled from prompt</span>
                  )}
                  {briefSummary ? <span className="stand-design-mini-pill">{briefSummary}</span> : null}
                </div>
              </div>
              {getStandDesignBriefSections().map((section) => (
                <CollapsibleSection key={section.id} id={section.id} title={section.title}
                  collapsedSet={collapsedSections} onToggle={toggleSection}>
                  <div className="stand-design-brief-grid">
                    {section.fields.map(([field, label]) => (
                      <label key={field} className="stand-design-field">
                        <span>{label}</span>
                        <textarea
                          className="stand-design-textarea stand-design-textarea-small"
                          rows={field.includes('notes') || field.includes('requirements') || field.includes('details') ? 3 : 2}
                          value={form.brief[field] || ''}
                          onChange={(event) => setBriefField(field, event.target.value)}
                          placeholder={label} />
                      </label>
                    ))}
                  </div>
                </CollapsibleSection>
              ))}
              {/* Live coverage preview inside the brief panel — updates as fields are filled */}
              <div className="sd-brief-coverage-preview">
                <CoverageRow coverage={liveCoverage} conceptTitle="Current Brief" />
              </div>

              <div className="stand-design-upload-grid">
                <label className={`stand-design-upload ${uploadingField === 'logo_image_path' ? 'is-busy' : ''}`}>
                  <input type="file" accept={buildUploadAccept()}
                    onChange={(e) => uploadImageToField(e.target.files?.[0], 'logo_image_path', { scope: 'brief' })} hidden />
                  <strong>{uploadingField === 'logo_image_path' ? 'Uploading...' : 'Upload Logo / Branding Asset'}</strong>
                  <span>Use the real logo or brand graphic as a control asset for more disciplined branding.</span>
                </label>
                <label className={`stand-design-upload ${uploadingField === 'brand_reference_image_path' ? 'is-busy' : ''}`}>
                  <input type="file" accept={buildUploadAccept()}
                    onChange={(e) => uploadImageToField(e.target.files?.[0], 'brand_reference_image_path', { scope: 'brief' })} hidden />
                  <strong>{uploadingField === 'brand_reference_image_path' ? 'Uploading...' : 'Upload Brand Reference'}</strong>
                  <span>Optional inspiration reference for mood, finishes, or brand language.</span>
                </label>
              </div>
            </div>

            <div className="stand-design-section">
              <div className="sd-prompt-label-row">
                <label className="stand-design-section-label" htmlFor="stand-design-prompt">Design Prompt</label>
                <button type="button" className="sd-parse-btn"
                  disabled={parsingBrief || !form.prompt?.trim()}
                  onClick={() => parsePromptIntoBrief(form.prompt, { overwrite: true })}
                  title="Extract and fill ALL brief fields from this prompt (overwrites existing values)">
                  {parsingBrief ? '⟳ Parsing…' : '✦ Fill Brief from Prompt'}
                </button>
              </div>
              <textarea id="stand-design-prompt" className="stand-design-textarea" rows={6}
                value={form.prompt} onChange={(e) => setField('prompt', e.target.value)}
                placeholder="Paste your full project brief or describe the stand — client, event, size, open sides, branding, screens, VIP zone… AI will extract and fill the structured brief automatically." />
              {briefParseInfo.show && !parsingBrief && (
                <p className="sd-parse-notice">✦ {briefParseInfo.count} brief fields auto-filled from your prompt — review and adjust as needed.</p>
              )}
            </div>

            <div className="stand-design-section">
              <div className="stand-design-section-label">Style Direction</div>
              <div className="stand-design-style-grid">
                {STAND_DESIGN_STYLE_PRESETS.map((preset) => (
                  <button key={preset.id} type="button"
                    className={`stand-design-style-card ${form.style_preset === preset.id ? 'is-active' : ''}`}
                    onClick={() => setField('style_preset', preset.id)}>
                    <strong>{preset.label}</strong><span>{preset.summary}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="stand-design-section">
              <div className="stand-design-section-label">Reference Image</div>
              <label className={`stand-design-upload ${uploadingField === 'reference_image_path' ? 'is-busy' : ''}`}>
                <input type="file" accept={buildUploadAccept()}
                  onChange={(e) => uploadImageToField(e.target.files?.[0], 'reference_image_path', { forceEditMode: true })} hidden />
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
                  <textarea id="stand-design-refinement" className="stand-design-textarea stand-design-textarea-small" rows={4}
                    value={form.refinement_prompt} onChange={(e) => setField('refinement_prompt', e.target.value)}
                    placeholder="Make it more premium, open the layout, increase branding, refine materials, move VIP area..." />
                </div>
                <div className="stand-design-section">
                  <label className="stand-design-section-label" htmlFor="stand-design-angle">Angle Focus</label>
                  <select id="stand-design-angle" className="stand-design-select" value={form.angle}
                    onChange={(e) => setField('angle', e.target.value)}>
                    {STAND_DESIGN_ANGLE_OPTIONS.map((option) => (
                      <option key={option.id || 'none'} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            </div>{/* end stand-design-controls-body */}

            <div className="stand-design-actions stand-design-actions-footer">
              <button type="button" className="stand-design-primary-btn" disabled={busy}
                onClick={() => submitGeneration({ regenerate: Boolean(form.id) })}>
                {busy ? 'Generating...' : form.id ? 'Regenerate 2 Concepts' : 'Generate 2 Concepts'}
              </button>
              <button type="button" className="stand-design-secondary-btn" onClick={resetDraft} disabled={busy}>Start Fresh</button>
            </div>
          </aside>

          {/* RIGHT: Results */}
          <section className="stand-design-panel stand-design-results">
            <div className="stand-design-results-header">
              <div>
                <h2>{selectedRecord ? 'Saved Stand Design' : 'Concept Comparison'}</h2>
                <p>Compare the 2 concept directions, refine one concept without losing the other, and keep the brief visible while reviewing client options.</p>
              </div>
              {selectedRecord
                ? <div className="stand-design-result-meta">
                    <span>{selectedRecord.mode === 'edit' ? 'Edit & Enhance' : 'Generate New'}</span>
                    <span>{toLocalDate(selectedRecord.updated_at)}</span>
                  </div>
                : null}
            </div>

            {/* Compact single-line meta bar */}
            <div className="sd-meta-bar">
              <span className="sd-meta-chip">
                <span className="sd-meta-label">Brief</span>
                <span className="sd-meta-value">{briefSummary || 'No brief yet'}</span>
              </span>
              <span className="sd-meta-sep">·</span>
              <span className="sd-meta-chip">
                <span className="sd-meta-label">Style</span>
                <span className="sd-meta-value">{STAND_DESIGN_STYLE_PRESETS.find((p) => p.id === form.style_preset)?.label || 'Crisp'}</span>
              </span>
              {form.prompt && <>
                <span className="sd-meta-sep">·</span>
                <span className="sd-meta-chip sd-meta-chip-grow">
                  <span className="sd-meta-label">Prompt</span>
                  <span className="sd-meta-value sd-meta-truncate">{form.prompt}</span>
                </span>
              </>}
            </div>

            {/* Concept sub-pages */}
            {(form.concepts || []).length > 0 ? (
              <>
                {/* Tab bar */}
                <div className="sd-concept-tabs">
                  {form.concepts.map((concept, index) => (
                    <button key={concept.id || index} type="button"
                      className={`sd-concept-tab ${activeConcept === index ? 'is-active' : ''}`}
                      onClick={() => setActiveConcept(index)}>
                      <span className="sd-concept-tab-num">{index + 1}</span>
                      {concept.title || `Concept ${index + 1}`}
                      {concept.views?.length > 0 && (
                        <span className="sd-concept-tab-badge">{concept.views.length} views</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Active concept card */}
                {form.concepts.map((concept, index) => (
                  <article key={concept.id || index}
                    className={`stand-design-result-card stand-design-result-card-xl ${activeConcept !== index ? 'sd-concept-hidden' : ''}`}>
                    <div className="stand-design-result-header">
                      <div>
                        <div className="stand-design-result-label">{concept.title || `Concept ${index + 1}`}</div>
                        <p className="stand-design-result-summary">{concept.summary || 'Pico-style concept direction'}</p>
                      </div>
                      <span className="stand-design-mini-pill">{concept.source_variant || `concept-${index + 1}`}</span>
                    </div>

                    <RenderImageOrPlaceholder src={concept.path} alt={`Stand concept ${index + 1}`}
                      className="stand-design-result-image stand-design-result-image-xl"
                      placeholder="Saved image unavailable for this older record" />

                    <div className="stand-design-result-actions">
                      {/* Preview — open in new tab */}
                      <a className="stand-design-inline-link" href={concept.path} target="_blank" rel="noreferrer">
                        Preview
                      </a>

                      {/* Download — client + event + concept title for meaningful filenames */}
                      <a className="stand-design-inline-link" href={concept.path}
                        download={buildDownloadFilename(form.brief, concept.title || `Concept ${index + 1}`)}>
                        Download
                      </a>

                      {/* Use as reference — sets Edit mode and scrolls left panel into view */}
                      <button type="button" className="stand-design-inline-link"
                        disabled={!concept?.path}
                        onClick={() => applyConceptAsReference(concept.path)}>
                        Use as reference
                      </button>

                      {/* Regenerate only — requires a saved record (form.id) identical guard to Generate all views */}
                      <button type="button" className="stand-design-inline-link"
                        disabled={busy || !form.id || !concept?.path}
                        onClick={async () => {
                          setRegeneratingConceptIndex(index);
                          await submitGeneration({
                            regenerate: true,
                            conceptIndex: index,
                            payloadOverride: {
                              ...form,
                              mode: 'edit',
                              reference_image_path: concept.path,
                              refinement_prompt: concept.refinement_prompt || form.refinement_prompt,
                            },
                          });
                          setRegeneratingConceptIndex(null);
                        }}>
                        {regeneratingConceptIndex === index ? 'Regenerating…' : 'Regenerate only'}
                      </button>

                      {/* Generate all views */}
                      <button type="button" className="stand-design-inline-link"
                        disabled={busy || !form.id || !concept?.path}
                        onClick={() => generateConceptViews(index)}>
                        {viewGenerationIndex === index ? 'Generating views…' : 'Generate all views'}
                      </button>
                    </div>

                    <div className="stand-design-concept-refine">
                      <label className="stand-design-field">
                        <span>Refine this concept</span>
                        <textarea className="stand-design-textarea stand-design-textarea-small" rows={2}
                          value={concept.refinement_prompt || ''}
                          onChange={(e) => setConceptField(index, 'refinement_prompt', e.target.value)}
                          placeholder="Make it more premium, open the stand more, increase branding, move VIP area..." />
                      </label>
                      <button type="button" className="stand-design-secondary-btn" disabled={busy}
                        onClick={() => refineConcept(index)}>Refine This Concept</button>
                    </div>

                    {Array.isArray(concept.views) && concept.views.length > 0 ? (
                      <div className="stand-design-views">
                        <div className="stand-design-coverage-header">
                          <strong>All Views</strong>
                          <span>{viewGenerationIndex === index ? 'Generating...' : `${concept.views.length} views generated`}</span>
                        </div>
                        <div className="stand-design-view-grid">
                          {concept.views.map((view) => (
                            <article key={view.id || view.path} className="stand-design-view-card">
                              <RenderImageOrPlaceholder src={view.path} alt={view.label || 'Stand view'}
                                className="stand-design-view-image" placeholder="View unavailable" />
                              <div className="stand-design-view-meta">
                                <strong>{view.label || 'View'}</strong>
                                <span>{view.angle || ''}</span>
                              </div>
                              <div className="stand-design-view-actions">
                                <a className="stand-design-inline-link" href={view.path} target="_blank" rel="noreferrer">Preview</a>
                                <a className="stand-design-inline-link" href={view.path}
                                  download={buildDownloadFilename(form.brief, concept.title || `Concept ${index + 1}`, view.label || view.angle || 'view')}>
                                  Download
                                </a>
                                <button type="button" className="stand-design-inline-link"
                                  disabled={!view?.path}
                                  onClick={() => applyConceptAsReference(view.path)}>Use as reference</button>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="stand-design-coverage">
                      <div className="stand-design-coverage-header">
                        <strong>Requirements Coverage</strong>
                        <span>Live — reflects your current brief</span>
                      </div>
                      <CoverageRow coverage={liveCoverage} conceptTitle={concept.title || `Concept ${index + 1}`} />
                    </div>
                  </article>
                ))}
              </>
            ) : (
              <div className="stand-design-empty-state">
                <strong>No concepts yet</strong>
                <span>Fill the structured brief, add any extra prompt notes, and generate 2 Pico-style stand concepts.</span>
              </div>
            )}
          </section>
        </div>

        {/* Saved records panel — compact thumbnail cards, click to expand */}
        <section className="stand-design-saved-panel">
          <div className="stand-design-saved-header">
            <div>
              <h2>Saved Design Records</h2>
              <p>{records.length > 0 ? `${records.length} record${records.length !== 1 ? 's' : ''} — click any card to expand details` : 'Generated concepts will appear here.'}</p>
            </div>
          </div>
          {loading ? (
            <div className="stand-design-empty-state"><strong>Loading studio records...</strong></div>
          ) : records.length === 0 ? (
            <div className="stand-design-empty-state">
              <strong>No saved stand designs yet</strong>
              <span>Your generated concept sets will appear here after the first successful run.</span>
            </div>
          ) : (
            <div className="stand-design-saved-grid">
              {records.map((record) => {
                const isActive = String(record.id) === String(form.id);
                const isExpanded = expandedRecordId === record.id;
                const concepts = Array.isArray(record.concepts) ? record.concepts.slice(0, 2) : [];
                const title = summarizeStandDesignBrief(record.brief) || (record.mode === 'edit' ? 'Edit & Enhance' : 'Generate New');

                return (
                  <article key={record.id}
                    className={`stand-design-saved-card ${isActive ? 'is-active' : ''}`}>

                    {/* Thumbnail strip — always visible */}
                    <div className={`sd-saved-thumbs ${concepts.length < 2 ? 'sd-saved-single' : ''}`}
                      onClick={() => setExpandedRecordId(isExpanded ? null : record.id)}
                      style={{ cursor: 'pointer' }}>
                      {concepts.length > 0
                        ? concepts.map((c) => (
                            <RenderImageOrPlaceholder key={c.id} src={c.path} alt="Stand concept"
                              className="stand-design-saved-thumb-image" placeholder="—" />
                          ))
                        : <div className="stand-design-saved-thumb-image stand-design-image-placeholder">No image</div>
                      }
                    </div>

                    {/* Compact meta row */}
                    <div className="sd-saved-meta"
                      onClick={() => setExpandedRecordId(isExpanded ? null : record.id)}
                      style={{ cursor: 'pointer' }}>
                      <strong title={title}>{title}</strong>
                      <div className="sd-saved-meta-sub">
                        <span>{toLocalDate(record.updated_at)}</span>
                        {concepts.length > 0 && <>
                          <span className="sd-saved-meta-sep">·</span>
                          <span>{concepts.length} concept{concepts.length !== 1 ? 's' : ''}</span>
                        </>}
                      </div>
                    </div>

                    {/* Compact action row */}
                    <div className="sd-saved-actions">
                      <button type="button" className="stand-design-inline-link"
                        onClick={() => setExpandedRecordId(isExpanded ? null : record.id)}>
                        {isExpanded ? '▲ Collapse' : '▼ Details'}
                      </button>
                      <button type="button" className="stand-design-inline-link is-danger"
                        onClick={(e) => { e.stopPropagation(); deleteRecord(record.id); }}>
                        Delete
                      </button>
                    </div>

                    {/* Expanded details — inline below the compact card */}
                    {isExpanded && (
                      <div className="sd-saved-expanded">
                        {record.brief?.client_name && (
                          <div className="sd-saved-expanded-row">
                            <span className="sd-saved-expanded-label">Client</span>
                            <span className="sd-saved-expanded-value">{record.brief.client_name}</span>
                          </div>
                        )}
                        {record.brief?.event_name && (
                          <div className="sd-saved-expanded-row">
                            <span className="sd-saved-expanded-label">Event</span>
                            <span className="sd-saved-expanded-value">{record.brief.event_name}</span>
                          </div>
                        )}
                        {(record.brief?.stand_size || record.brief?.stand_type) && (
                          <div className="sd-saved-expanded-row">
                            <span className="sd-saved-expanded-label">Stand</span>
                            <span className="sd-saved-expanded-value">
                              {[record.brief.stand_size, record.brief.stand_type].filter(Boolean).join(' · ')}
                            </span>
                          </div>
                        )}
                        {record.prompt && (
                          <div className="sd-saved-expanded-row">
                            <span className="sd-saved-expanded-label">Prompt</span>
                            <span className="sd-saved-expanded-value">{record.prompt}</span>
                          </div>
                        )}
                        {record.model && (
                          <div className="sd-saved-expanded-row">
                            <span className="sd-saved-expanded-label">Model</span>
                            <span className="sd-saved-expanded-value">{record.model}</span>
                          </div>
                        )}
                        <div className="sd-saved-expanded-actions">
                          <button type="button" className="stand-design-primary-btn"
                            onClick={() => { setForm(normalizeDesignRecord(record)); setActiveConcept(0); setExpandedRecordId(null); }}>
                            Load into Studio
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
