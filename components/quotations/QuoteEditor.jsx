'use client';
import { useState, useRef, useMemo } from 'react';

/* ─── Editable collapsible block ───────────────────────────────────────── */
function EditableBlock({ title, items, onChange }) {
    const [open, setOpen] = useState(false);
    const text = (items || []).join('\n');
    function handleChange(event) {
        const lines = event.target.value.split('\n').filter(line => line.trim() !== '');
        onChange(lines.length > 0 ? lines : ['']);
    }
    return (
        <div className={`quotation-collapsible${open ? ' quotation-collapsible-open' : ''}`}>
            <button type="button" className="quotation-collapsible-trigger" onClick={() => setOpen((v) => !v)}>
                <span>{title}</span>
                <span className="quotation-collapsible-chevron">{open ? '▲' : '▼'}</span>
            </button>
            {open && (
                <div className="quotation-collapsible-body">
                    <textarea
                        className="quotation-input quotation-textarea"
                        rows={6}
                        value={text}
                        onChange={handleChange}
                    />
                </div>
            )}
        </div>
    );
}

/* ─── Signature/stamp uploader card ────────────────────────────────────── */
function SignatureUploader({ name, signatures, onSaveSignature }) {
    const sigRef = useRef(null);
    const stampRef = useRef(null);

    const existing = useMemo(
        () => signatures.find((s) => s.name?.toLowerCase() === (name || '').trim().toLowerCase()),
        [signatures, name]
    );

    async function handleFile(file, kind) {
        if (!file || !name.trim()) return;
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = String(reader.result || '');
                const sig = existing?.signature_image;
                const stamp = existing?.stamp_image;
                onSaveSignature(
                    name.trim(),
                    kind === 'sig' ? dataUrl : sig ?? null,
                    kind === 'stamp' ? dataUrl : stamp ?? null
                );
                resolve();
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    if (!name.trim()) return null;

    return (
        <div className="quotation-sig-uploader">
            <div className="quotation-sig-slot">
                <span className="quotation-sig-label">Signature</span>
                {existing?.signature_image ? (
                    <img src={existing.signature_image} alt="signature" className="quotation-sig-thumb" />
                ) : (
                    <div className="quotation-sig-empty">No signature</div>
                )}
                <input
                    ref={sigRef}
                    type="file"
                    accept="image/*"
                    className="quotation-hidden-file"
                    onChange={(e) => handleFile(e.target.files?.[0], 'sig')}
                />
                <button
                    type="button"
                    className="quotation-btn quotation-btn-ghost quotation-sig-upload-btn"
                    onClick={() => sigRef.current?.click()}
                >
                    {existing?.signature_image ? '✏ Edit' : '↑ Upload'}
                </button>
            </div>
            <div className="quotation-sig-slot">
                <span className="quotation-sig-label">Stamp</span>
                {existing?.stamp_image ? (
                    <img src={existing.stamp_image} alt="stamp" className="quotation-sig-thumb" />
                ) : (
                    <div className="quotation-sig-empty">No stamp</div>
                )}
                <input
                    ref={stampRef}
                    type="file"
                    accept="image/*"
                    className="quotation-hidden-file"
                    onChange={(e) => handleFile(e.target.files?.[0], 'stamp')}
                />
                <button
                    type="button"
                    className="quotation-btn quotation-btn-ghost quotation-sig-upload-btn"
                    onClick={() => stampRef.current?.click()}
                >
                    {existing?.stamp_image ? '✏ Edit' : '↑ Upload'}
                </button>
            </div>
        </div>
    );
}

/* ─── Save-as-Customer mini form ────────────────────────────────────────── */
function SaveCustomerPanel({ form, customers, onSaveCustomer, onClose }) {
    const [localForm, setLocalForm] = useState({
        display_name: form.client_org || '',
        contact_to: form.client_to || '',
        address: form.client_location || '',
        trn: form.client_trn || '',
        email: '',
        phone: '',
    });

    const existing = customers.find(
        (c) => c.display_name.toLowerCase() === localForm.display_name.trim().toLowerCase()
    );

    async function handleSave() {
        if (!localForm.display_name.trim()) return;
        await onSaveCustomer(localForm);
        onClose();
    }

    return (
        <div className="quotation-save-customer-panel">
            <div className="quotation-save-customer-header">
                <strong>{existing ? '✏ Update Customer' : '+ Save as Customer'}</strong>
                <button type="button" className="quotation-btn quotation-btn-ghost" onClick={onClose}>✕</button>
            </div>
            <div className="quotation-form-grid quotation-form-grid-3">
                <div className="quotation-field quotation-span-2">
                    <label>Company / Display Name *</label>
                    <input className="quotation-input" value={localForm.display_name} onChange={(e) => setLocalForm({ ...localForm, display_name: e.target.value })} />
                </div>
                <div className="quotation-field">
                    <label>TRN</label>
                    <input className="quotation-input" value={localForm.trn} onChange={(e) => setLocalForm({ ...localForm, trn: e.target.value })} />
                </div>
                <div className="quotation-field">
                    <label>Contact / Attention</label>
                    <input className="quotation-input" value={localForm.contact_to} onChange={(e) => setLocalForm({ ...localForm, contact_to: e.target.value })} />
                </div>
                <div className="quotation-field quotation-span-2">
                    <label>Address</label>
                    <input className="quotation-input" value={localForm.address} onChange={(e) => setLocalForm({ ...localForm, address: e.target.value })} />
                </div>
                <div className="quotation-field">
                    <label>Email</label>
                    <input className="quotation-input" type="email" value={localForm.email} onChange={(e) => setLocalForm({ ...localForm, email: e.target.value })} />
                </div>
                <div className="quotation-field">
                    <label>Phone</label>
                    <input className="quotation-input" value={localForm.phone} onChange={(e) => setLocalForm({ ...localForm, phone: e.target.value })} />
                </div>
            </div>
            <div className="quotation-save-customer-actions">
                {existing && <span className="quotation-customer-exists-badge">Will update existing record</span>}
                <button type="button" className="quotation-btn quotation-btn-save-confirm" onClick={handleSave}>
                    {existing ? 'Update Customer' : 'Save Customer'}
                </button>
            </div>
        </div>
    );
}

/* ─── Header Editor ────────────────────────────────────────────────────── */
function HeaderEditor({ profile, onChange, onClose }) {
    const [local, setLocal] = useState({ ...profile });

    function handleSave() {
        onChange(local);
        onClose();
    }

    return (
        <div className="quotation-header-editor">
            <div className="quotation-field">
                <label>Company Legal Name</label>
                <input
                    className="quotation-input"
                    value={local.legalName || ''}
                    onChange={(e) => setLocal({ ...local, legalName: e.target.value })}
                />
            </div>
            <div className="quotation-form-grid-2">
                <div className="quotation-field">
                    <label>Address Lines (one per line)</label>
                    <textarea
                        className="quotation-input quotation-textarea"
                        rows={4}
                        value={(local.addressLines || []).join('\n')}
                        onChange={(e) => setLocal({ ...local, addressLines: e.target.value.split('\n') })}
                    />
                </div>
                <div className="quotation-field">
                    <label>Contact Lines (one per line)</label>
                    <textarea
                        className="quotation-input quotation-textarea"
                        rows={4}
                        value={(local.contactLines || []).join('\n')}
                        onChange={(e) => setLocal({ ...local, contactLines: e.target.value.split('\n') })}
                    />
                </div>
            </div>
            <div className="quotation-field">
                <label>VAT Number</label>
                <input
                    className="quotation-input"
                    value={local.vatNumber || ''}
                    onChange={(e) => setLocal({ ...local, vatNumber: e.target.value })}
                />
            </div>
            <div className="quotation-header-editor-actions">
                <button type="button" className="quotation-btn quotation-btn-primary" onClick={handleSave}>Confirm Header Changes</button>
                <button type="button" className="quotation-btn quotation-btn-ghost" onClick={onClose}>Cancel</button>
            </div>
        </div>
    );
}

/* ─── Live HTML Preview pane ────────────────────────────────────────────── */
function QuotationPreview({ form, totals, companyProfile, formatMoney, numberToWords }) {
    const profile = form.company_profile || companyProfile;
    const totalBeforeVat = totals.client;
    const vat = totals.vat;
    const grand = totals.grand;

    return (
        <div className="qp-root">
            <div className="qp-header">
                <div className="qp-header-left">
                    <img src={profile.logoPath} alt={profile.legalName} className="qp-logo" onError={(e) => { e.target.style.display = 'none'; }} />
                    <div className="qp-company-info">
                        {(profile.addressLines || []).map((l) => <div key={l}>{l}</div>)}
                        {(profile.contactLines || []).map((l) => <div key={l}>{l}</div>)}
                        <div>{profile.vatNumber}</div>
                    </div>
                </div>
                <div className="qp-header-right">
                    <div className="qp-title">Quotation</div>
                    {form.qt_number && <div className="qp-qt-num"># QT-{form.qt_number}</div>}
                </div>
            </div>

            <div className="qp-info-grid">
                <div className="qp-bill-to">
                    <div className="qp-bill-label">Bill To</div>
                    {form.client_org && <div className="qp-bill-name">{form.client_org}</div>}
                    {form.client_to && <div className="qp-bill-line">{form.client_to}</div>}
                    {form.client_location && <div className="qp-bill-line">{form.client_location}</div>}
                    {form.client_trn && <div className="qp-bill-line">TRN {form.client_trn}</div>}
                </div>
                <div className="qp-meta">
                    {form.date && <div className="qp-meta-row"><span>Quote Date</span><span>{form.date}</span></div>}
                    {form.event_date && <div className="qp-meta-row"><span>Event Date</span><span>{form.event_date}</span></div>}
                    {form.created_by && <div className="qp-meta-row"><span>Prepared By</span><span>{form.created_by}</span></div>}
                </div>
            </div>

            {form.project_title && (
                <div className="qp-subject">
                    <span className="qp-subject-label">Subject:</span> {form.project_title}
                </div>
            )}

            <table className="qp-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Item &amp; Description</th>
                        <th>Qty</th>
                        <th>Rate</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {(form.sections || []).flatMap((section, si) => {
                        const rows = [];
                        if (section.name) {
                            rows.push(
                                <tr key={`sec-${si}`} className="qp-section-row">
                                    <td colSpan={5}>{String.fromCharCode(65 + si)}. {section.name}</td>
                                </tr>
                            );
                        }
                        section.items.forEach((item, ii) => {
                            if (!item.description && !item.costs_bhd && !item.qty) return;
                            const qty = Number(item.qty || 0);
                            const cost = Number(item.costs_bhd || 0);
                            rows.push(
                                <tr key={`item-${si}-${ii}`}>
                                    <td className="qp-center">{ii + 1}</td>
                                    <td>{item.description}</td>
                                    <td className="qp-center">{qty > 0 ? qty.toFixed(2) : ''}</td>
                                    <td className="qp-right">{cost > 0 ? formatMoney(cost) : ''}</td>
                                    <td className="qp-right">{cost > 0 && qty > 0 ? formatMoney(qty * cost) : ''}</td>
                                </tr>
                            );
                        });
                        return rows;
                    })}
                </tbody>
            </table>

            <div className="qp-totals">
                <div className="qp-totals-row"><span>Sub Total</span><span>{formatMoney(totalBeforeVat)}</span></div>
                <div className="qp-totals-row"><span>VAT {form.vat_percent}%</span><span>{formatMoney(vat)}</span></div>
                <div className="qp-totals-row qp-totals-grand"><span>Total</span><span>BHD {formatMoney(grand)}</span></div>
                {grand > 0 && numberToWords && (
                    <div className="qp-words">
                        Total In Words: <em>{numberToWords(grand)}</em>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */
function sellingRuleLabel(sellingRule) {
    if (sellingRule === 'none') return 'Selling = subtotal';
    return `Selling = subtotal / ${sellingRule}`;
}

function groupPriceReferences(priceReferences) {
    const grouped = new Map();
    priceReferences
        .slice()
        .sort((left, right) => {
            const categoryCompare = String(left.category || 'General').localeCompare(String(right.category || 'General'));
            if (categoryCompare !== 0) return categoryCompare;
            return String(left.title || '').localeCompare(String(right.title || ''));
        })
        .forEach((reference) => {
            const category = reference.category || 'General';
            if (!grouped.has(category)) grouped.set(category, []);
            grouped.get(category).push(reference);
        });
    return Array.from(grouped.entries());
}

/* ─── Main QuoteEditor ──────────────────────────────────────────────────── */
export default function QuoteEditor({
    form,
    saving,
    totals,
    showManagement,
    statusOptions,
    unitOptions,
    sellingRuleOptions,
    companyProfile,
    priceReferences,
    customers = [],
    signatures = [],
    onBack,
    onToggleManagement,
    onFieldChange,
    onSectionChange,
    onItemChange,
    onAddSection,
    onRemoveSection,
    onAddItem,
    onRemoveItem,
    onAttachImage,
    onApplyReference,
    onApplyCustomer,
    onSaveCustomer,
    onSaveSignature,
    onListChange,
    onSaveDraft,
    onSaveConfirmed,
    onExportCustomerPdf,
    onExportManagementPdf,
    onExportExcel,
    onDuplicate,
    onDelete,
    formatMoney,
    getSectionTotals,
    numberToWords,
}) {
    const groupedPriceReferences = groupPriceReferences(priceReferences);
    const [showPreview, setShowPreview] = useState(false);
    const [showSaveCustomer, setShowSaveCustomer] = useState(false);
    const [isEditingClient, setIsEditingClient] = useState(!form.client_org);
    const [isEditingHeader, setIsEditingHeader] = useState(false);

    const activeProfile = form.company_profile || companyProfile;

    return (
        <div className="quotation-editor-screen">
            {/* ─── Sticky Top Bar ─── */}
            <div className="quotation-screen-header sticky-header">
                <div>
                    <h1 className="pro-title" style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b' }}>{form.id ? 'Edit Quote' : 'New Quote'}</h1>
                </div>
                <div className="quotation-screen-tools">
                    <label className="quotation-toggle">
                        <input type="checkbox" checked={showManagement} onChange={(event) => onToggleManagement(event.target.checked)} />
                        <span>Management Mode</span>
                    </label>
                    <button
                        type="button"
                        className={`quotation-btn ${showPreview ? 'quotation-btn-primary' : 'quotation-btn-ghost'}`}
                        onClick={() => setShowPreview((v) => !v)}
                    >
                        {showPreview ? '✕ Close Preview' : '👁 Preview'}
                    </button>
                    <button type="button" className="quotation-pro-btn-primary" onClick={form.status === 'Confirmed' ? onSaveConfirmed : onSaveDraft}>
                        {saving ? 'Saving...' : 'Save Quote'}
                    </button>
                    <button type="button" className="quotation-btn quotation-btn-ghost" onClick={onBack}>✕</button>
                </div>
            </div>

            {/* ─── Editor Content ─── */}
            <div className="quotation-editor-pane">
                <div className="quotation-pro-sheet">
                    {/* Header Branding (Compact) */}
                    <div className="quotation-brand-pro-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <img src={activeProfile.logoPath} alt="Logo" style={{ height: '40px', width: 'auto' }} />
                            <div style={{ fontSize: '0.9rem', color: '#475569' }}>
                                <strong style={{ display: 'block', color: '#1e293b' }}>{activeProfile.legalName}</strong>
                                <span>{activeProfile.vatNumber}</span>
                            </div>
                        </div>
                        <button type="button" className="quotation-header-edit-btn" onClick={() => setIsEditingHeader(true)}>✏️ Edit Header</button>
                    </div>

                    {isEditingHeader && (
                        <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#f8fafc', borderRadius: '4px', border: '1px dashed #cbd5e1' }}>
                            <HeaderEditor
                                profile={activeProfile}
                                onChange={(newProfile) => onFieldChange('company_profile', newProfile)}
                                onClose={() => setIsEditingHeader(false)}
                            />
                        </div>
                    )}

                    {/* Customer & Metadata Section */}
                    <div className="quotation-pro-grid" style={{ gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: '4rem' }}>
                        <div className="quotation-pro-section">
                            <div className="quotation-pro-field-row">
                                <label className="quotation-pro-label required">Customer Name</label>
                                <div className="quotation-pro-input-group">
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <select
                                            className="quotation-pro-input"
                                            style={{ flex: 1 }}
                                            value={form.client_org}
                                            onChange={(e) => onApplyCustomer(customers.find(c => c.display_name === e.target.value)?.id)}
                                        >
                                            <option value="">Select or type customer...</option>
                                            {customers.map(c => (
                                                <option key={c.id} value={c.display_name}>{c.display_name}</option>
                                            ))}
                                        </select>
                                        <button type="button" className="quotation-btn-small" onClick={() => setShowSaveCustomer(true)} style={{ border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff', padding: '0 10px', fontSize: '12px' }}>+ New</button>
                                    </div>
                                    {showSaveCustomer && (
                                        <div style={{ marginTop: '1rem' }}>
                                            <SaveCustomerPanel
                                                form={form}
                                                customers={customers}
                                                onSaveCustomer={onSaveCustomer}
                                                onClose={() => setShowSaveCustomer(false)}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="quotation-pro-field-row" style={{ marginTop: '1.5rem' }}>
                                <label className="quotation-pro-label">Billing Address</label>
                                <div className="quotation-pro-input-group">
                                    <textarea
                                        className="quotation-pro-input"
                                        style={{ background: '#fdfdfd' }}
                                        rows={4}
                                        placeholder="Address, Location, TRN..."
                                        value={`${form.client_to}\n${form.client_location}${form.client_trn ? '\nTRN: ' + form.client_trn : ''}`}
                                        readOnly
                                    />
                                    <button type="button" className="quotation-link-btn" onClick={() => setIsEditingClient(!isEditingClient)} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.8rem', textAlign: 'left', padding: '4px 0', cursor: 'pointer' }}>
                                        {isEditingClient ? '✕ Close Details' : '✏️ Edit Address / Contact / TRN'}
                                    </button>
                                </div>
                            </div>

                            {isEditingClient && (
                                <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                    <div className="quotation-form-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem' }}>
                                        <div className="quotation-field">
                                            <label style={{ fontSize: '0.7rem' }}>Attention / To</label>
                                            <input className="quotation-pro-input" style={{ width: '100%' }} value={form.client_to} onChange={e => onFieldChange('client_to', e.target.value)} />
                                        </div>
                                        <div className="quotation-field">
                                            <label style={{ fontSize: '0.7rem' }}>TRN</label>
                                            <input className="quotation-pro-input" style={{ width: '100%' }} value={form.client_trn} onChange={e => onFieldChange('client_trn', e.target.value)} />
                                        </div>
                                        <div className="quotation-field" style={{ gridColumn: 'span 2' }}>
                                            <label style={{ fontSize: '0.7rem' }}>Location / Address</label>
                                            <input className="quotation-pro-input" style={{ width: '100%' }} value={form.client_location} onChange={e => onFieldChange('client_location', e.target.value)} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Metadata Section */}
                        <div className="quotation-pro-section">
                            <div className="quotation-pro-field-row">
                                <label className="quotation-pro-label required">Quote#</label>
                                <input className="quotation-pro-input" style={{ background: '#f8fafc', fontWeight: 600 }} value={`QT-${form.qt_number}`} readOnly />
                            </div>
                            <div className="quotation-pro-field-row" style={{ marginTop: '0.75rem' }}>
                                <label className="quotation-pro-label">Reference#</label>
                                <input className="quotation-pro-input" value={form.ref} onChange={e => onFieldChange('ref', e.target.value)} />
                            </div>
                            <div className="quotation-pro-field-row" style={{ marginTop: '0.75rem' }}>
                                <label className="quotation-pro-label required">Quote Date</label>
                                <input type="text" className="quotation-pro-input" value={form.date} onChange={e => onFieldChange('date', e.target.value)} />
                            </div>
                            <div className="quotation-pro-field-row" style={{ marginTop: '0.75rem' }}>
                                <label className="quotation-pro-label">Expiry Date</label>
                                <input type="text" className="quotation-pro-input" placeholder="e.g. 30 Days" value={form.expiry_date} onChange={e => onFieldChange('expiry_date', e.target.value)} />
                            </div>
                            <div className="quotation-pro-field-row" style={{ marginTop: '0.75rem' }}>
                                <label className="quotation-pro-label">Salesperson</label>
                                <div className="quotation-pro-input-group">
                                    <input className="quotation-pro-input" style={{ marginBottom: '0.5rem' }} value={form.created_by} onChange={e => onFieldChange('created_by', e.target.value)} />
                                    <SignatureUploader name={form.created_by} signatures={signatures} onSaveSignature={onSaveSignature} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Subject Line */}
                    <div style={{ marginTop: '2rem', borderTop: '1px solid #f1f5f9', paddingTop: '2rem' }}>
                        <div className="quotation-pro-field-row" style={{ gridTemplateColumns: '160px 1fr' }}>
                            <label className="quotation-pro-label">Subject</label>
                            <input
                                className="quotation-pro-input"
                                style={{ fontWeight: 600, fontSize: '1.05rem', color: '#1e293b' }}
                                placeholder="Subject of the quotation..."
                                value={form.project_title}
                                onChange={e => onFieldChange('project_title', e.target.value.toUpperCase())}
                            />
                        </div>
                    </div>

                    {/* Event Details */}
                    <div className="quotation-pro-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem', marginTop: '1.5rem' }}>
                        <div className="quotation-field">
                            <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>EVENT NAME</label>
                            <input className="quotation-pro-input" style={{ width: '100%' }} value={form.event_name} onChange={e => onFieldChange('event_name', e.target.value)} />
                        </div>
                        <div className="quotation-field">
                            <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>VENUE</label>
                            <input className="quotation-pro-input" style={{ width: '100%' }} value={form.venue} onChange={e => onFieldChange('venue', e.target.value)} />
                        </div>
                        <div className="quotation-field">
                            <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>EVENT DATE</label>
                            <input className="quotation-pro-input" style={{ width: '100%' }} value={form.event_date} onChange={e => onFieldChange('event_date', e.target.value)} />
                        </div>
                    </div>

                    {/* ITEM TABLE (BoQ) */}
                    <div className="quotation-pro-section-title" style={{ marginTop: '3rem' }}>Scope of Works</div>
                    
                    <div className="quotation-pro-table-wrapper" style={{ border: '1px solid #e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                        <div className="quotation-pro-table-header" style={{ display: 'grid', gridTemplateColumns: `42px 1fr 60px 80px 110px ${showManagement ? '100px 120px' : ''} 100px`, gap: '1rem', background: '#f8fafc', padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 700, color: '#475569' }}>
                            <div style={{ textAlign: 'center' }}>NO</div>
                            <div>ITEM DETAILS</div>
                            <div style={{ textAlign: 'right' }}>QTY</div>
                            <div>UNIT</div>
                            <div style={{ textAlign: 'right' }}>RATE</div>
                            {showManagement && <div style={{ textAlign: 'right' }}>COST (MANAGEMENT)</div>}
                            {showManagement && <div style={{ textAlign: 'right' }}>TOTAL (AUTO)</div>}
                            <div style={{ textAlign: 'center' }}>ACTIONS</div>
                        </div>

                        {form.sections.map((section, sectionIndex) => (
                            <div key={`section-${sectionIndex}`} className="quotation-pro-section-row">
                                <div style={{ background: '#f1f5f9', padding: '0.5rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 800, color: '#64748b' }}>{String.fromCharCode(65 + sectionIndex)}</span>
                                        <input 
                                            className="quotation-pro-input" 
                                            style={{ background: 'transparent', border: 'none', fontWeight: 700, textTransform: 'uppercase', width: '300px' }} 
                                            value={section.name} 
                                            onChange={e => onSectionChange(sectionIndex, s => ({ ...s, name: e.target.value.toUpperCase() }))}
                                            placeholder="Section Title..."
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        {showManagement && (
                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem' }}>
                                                <label>Selling %</label>
                                                <input className="quotation-pro-input" style={{ width: '80px', padding: '4px 8px' }} value={section.selling_rule} onChange={e => onSectionChange(sectionIndex, s => ({ ...s, selling_rule: e.target.value }))} />
                                            </div>
                                        )}
                                        <button className="quotation-btn-danger" style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '4px' }} onClick={() => onRemoveSection(sectionIndex)}>Remove Section</button>
                                    </div>
                                </div>

                                {section.items.map((item, itemIndex) => {
                                    const lineTotal = Number(item.qty || 0) * Number(item.rate || 0);
                                    return (
                                        <div key={`item-${sectionIndex}-${itemIndex}`} style={{ display: 'grid', gridTemplateColumns: `42px 1fr 60px 80px 110px ${showManagement ? '100px 120px' : ''} 100px`, gap: '1rem', padding: '1rem', borderBottom: '1px solid #f1f5f9', alignItems: 'start' }}>
                                            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem', paddingTop: '8px' }}>{itemIndex + 1}</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                <textarea className="quotation-pro-input" rows={2} style={{ width: '100%' }} value={item.description} onChange={e => onItemChange(sectionIndex, itemIndex, 'description', e.target.value)} />
                                                <select
                                                    className="quotation-pro-input"
                                                    style={{ fontSize: '11px', padding: '4px' }}
                                                    value={item.price_reference_id || ''}
                                                    onChange={e => onApplyReference(sectionIndex, itemIndex, e.target.value)}
                                                >
                                                    <option value="">Apply price reference...</option>
                                                    {groupedPriceReferences.map(([cat, refs]) => (
                                                        <optgroup key={cat} label={cat}>
                                                            {refs.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                                                        </optgroup>
                                                    ))}
                                                </select>
                                                {item.image && (
                                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '4px' }}>
                                                        <img src={item.image} alt="pic" style={{ height: '32px', borderRadius: '4px' }} />
                                                        <button className="quotation-btn-ghost" style={{ fontSize: '10px' }} onClick={() => onItemChange(sectionIndex, itemIndex, 'image', null)}>Remove Image</button>
                                                    </div>
                                                )}
                                            </div>
                                            <input type="number" className="quotation-pro-input" style={{ textAlign: 'right' }} value={item.qty} onChange={e => onItemChange(sectionIndex, itemIndex, 'qty', e.target.value)} />
                                            <select className="quotation-pro-input" value={item.unit} onChange={e => onItemChange(sectionIndex, itemIndex, 'unit', e.target.value)}>
                                                {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                                            </select>
                                            <input type="number" className="quotation-pro-input" style={{ textAlign: 'right' }} value={item.costs_bhd} onChange={e => onItemChange(sectionIndex, itemIndex, 'costs_bhd', e.target.value)} />
                                            {showManagement && <input type="number" className="quotation-pro-input" style={{ textAlign: 'right', background: '#fffbeb' }} value={item.rate} onChange={e => onItemChange(sectionIndex, itemIndex, 'rate', e.target.value)} />}
                                            {showManagement && <div style={{ textAlign: 'right', padding: '8px 10px', fontSize: '13px', fontWeight: 600, color: '#166534' }}>{formatMoney(lineTotal)}</div>}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                <input className="quotation-hidden-file" id={`f-${sectionIndex}-${itemIndex}`} type="file" onChange={e => onAttachImage(sectionIndex, itemIndex, e.target.files?.[0])} style={{ display: 'none' }} />
                                                <label htmlFor={`f-${sectionIndex}-${itemIndex}`} style={{ textAlign: 'center', cursor: 'pointer', fontSize: '11px', color: '#6366f1' }}>Attach Image</label>
                                                <button className="quotation-btn-ghost" style={{ fontSize: '11px', color: '#ef4444' }} onClick={() => onRemoveItem(sectionIndex, itemIndex)}>Remove</button>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0' }}>
                                    <button className="quotation-pro-btn-primary" style={{ background: '#f8fafc', color: '#64748b', border: '1px dashed #cbd5e1', width: '100%' }} onClick={() => onAddItem(sectionIndex)}>+ Add Item Line</button>
                                </div>
                            </div>
                        ))}
                        <div style={{ padding: '1.5rem', background: '#f8fafc', textAlign: 'center' }}>
                            <button className="quotation-pro-btn-primary" onClick={onAddSection}>+ Add New Section</button>
                        </div>
                    </div>

                    {/* Footer Totals & Notes */}
                    <div className="quotation-pro-grid" style={{ gridTemplateColumns: '1.2fr 1fr', gap: '4rem', marginTop: '3rem' }}>
                        <div>
                            <div className="quotation-pro-section-title">Terms & Notes</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div className="quotation-field">
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>VAT (%)</label>
                                    <input type="number" className="quotation-pro-input" style={{ width: '80px' }} value={form.vat_percent} onChange={e => onFieldChange('vat_percent', Number(e.target.value))} />
                                </div>
                                <div className="quotation-field">
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Internal Notes</label>
                                    <textarea className="quotation-pro-input" rows={3} style={{ width: '100%' }} value={form.notes} onChange={e => onFieldChange('notes', e.target.value)} />
                                </div>
                                <EditableBlock title="Exclusions" items={form.exclusions} onChange={next => onListChange('exclusions', next)} />
                                <EditableBlock title="Terms & Conditions" items={form.terms} onChange={next => onListChange('terms', next)} />
                                <EditableBlock title="Payment Terms" items={form.payment_terms} onChange={next => onListChange('payment_terms', next)} />
                            </div>
                        </div>

                        <div className="quotation-pro-totals" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div className="quotation-pro-total-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ color: '#64748b' }}>Sub Total</span>
                                <strong style={{ color: '#1e293b' }}>{formatMoney(totals.client)}</strong>
                            </div>
                            <div className="quotation-pro-total-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ color: '#64748b' }}>Total VAT ({form.vat_percent}%)</span>
                                <strong style={{ color: '#1e293b' }}>{formatMoney(totals.vat)}</strong>
                            </div>
                            <div className="quotation-pro-total-row grand" style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 0', marginTop: '0.5rem', background: '#f8fafc', paddingRight: '1rem', paddingLeft: '1rem', borderRadius: '4px' }}>
                                <span style={{ fontWeight: 700, color: '#1e293b' }}>Total BHD</span>
                                <strong style={{ fontSize: '1.25rem', color: '#2563eb' }}>{formatMoney(totals.grand)}</strong>
                            </div>
                            {totals.grand > 0 && (
                                <div style={{ marginTop: '1rem', width: '100%', fontSize: '0.85rem', color: '#64748b', textAlign: 'right', fontStyle: 'italic' }}>
                                    Total in words: {numberToWords ? numberToWords(totals.grand) : ''}
                                </div>
                            )}
                            <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', width: '100%', justifyContent: 'flex-end' }}>
                                <button className="quotation-btn quotation-btn-ghost" onClick={onExportCustomerPdf} disabled={!form.id}>↓ Customer PDF</button>
                                <button className="quotation-btn quotation-btn-ghost" onClick={onExportManagementPdf} disabled={!form.id}>↓ Management PDF</button>
                                <button className="quotation-btn quotation-btn-ghost" onClick={onExportExcel} disabled={!form.id}>↓ Export Excel</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center', gap: '1rem', paddingBottom: '4rem' }}>
                    <button className="quotation-btn quotation-btn-ghost" style={{ padding: '0.75rem 2rem' }} onClick={onBack}>Cancel</button>
                    <button className="quotation-pro-btn-primary" style={{ padding: '0.75rem 3rem' }} onClick={form.status === 'Confirmed' ? onSaveConfirmed : onSaveDraft}>
                        {saving ? 'Processing...' : 'Save Quotation'}
                    </button>
                </div>
            </div>

            {showPreview && (
                <div className="quotation-preview-overlay" onClick={() => setShowPreview(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
                    <div className="quotation-preview-modal" onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: '900px', maxWidth: '95vw', height: '90vh', borderRadius: '8px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div className="quotation-preview-header" style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600 }}>Live Preview</span>
                            <button type="button" className="quotation-btn quotation-btn-ghost" onClick={() => setShowPreview(false)}>✕</button>
                        </div>
                        <div className="quotation-preview-scroll" style={{ flex: 1, overflowY: 'auto', padding: '2rem', background: '#f1f5f9' }}>
                            <div style={{ background: '#fff', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', margin: '0 auto', maxWidth: '800px', minHeight: '100%' }}>
                                <QuotationPreview
                                    form={form}
                                    totals={totals}
                                    companyProfile={companyProfile}
                                    formatMoney={formatMoney}
                                    numberToWords={numberToWords}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
