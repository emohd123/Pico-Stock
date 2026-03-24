'use client';
import { useState, useRef, useMemo } from 'react';
import { displayDateToInput, inputDateToDisplay } from '@/app/admin/quotations/page';
import { computeSellingFromInternal } from '@/lib/quotationCommercial';

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
function QuotationPreview({ form, totals, companyProfile, formatMoney, numberToWords, signatures = [] }) {
    const profile = form.company_profile || companyProfile;
    const currencyCode = form.currency_code || 'BHD';
    const totalBeforeVat = totals.client;
    const vat = totals.vat;
    const grand = totals.grand;
    const poNumber = String(form.ref || '').trim();
    const staffSignature = signatures.find((signature) => signature.name?.toLowerCase() === String(form.created_by || '').trim().toLowerCase());
    const hasLegalBlocks = [form.exclusions, form.terms, form.payment_terms]
        .some((items) => Array.isArray(items) && items.some((item) => String(item || '').trim()));
    const hasSignatureBlock = Boolean(staffSignature?.signature_image || staffSignature?.stamp_image);
    const previewSections = (form.sections || []).map((section, si) => ({
        letter: String.fromCharCode(65 + si),
        name: section.name || 'Section',
        items: (section.items || []).filter((item) => item.description || item.costs_bhd || item.qty || item.image),
        total: Number(section.section_selling || 0) > 0
            ? Number(section.section_selling || 0)
            : (section.items || []).reduce((sum, item) => sum + Number(item?.costs_bhd || 0), 0),
    })).filter((section) => section.items.length > 0 || section.name);

    return (
        <div className="qp-root">
            <div className="qp-header">
                <div className="qp-logo-stack">
                    <img src={profile.logoPath} alt={profile.legalName} className="qp-logo" onError={(e) => { e.target.style.display = 'none'; }} />
                    <div className="qp-title-block">
                        <div className="qp-title">QUOTATION</div>
                        <div className="qp-title-meta">Date: {form.date || '—'}</div>
                        {poNumber && <div className="qp-title-meta">PO Number: {poNumber}</div>}
                    </div>
                </div>
                <div className="qp-company-block">
                    <div className="qp-company-legal">{profile.legalName}</div>
                    <div className="qp-company-info">
                        {(profile.addressLines || []).map((l) => <div key={l}>{l}</div>)}
                        {(profile.contactLines || []).map((l) => <div key={l}>{l}</div>)}
                        <div>{profile.vatNumber}</div>
                    </div>
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
                    {form.created_by && <div className="qp-meta-row"><span>Prepared By</span><span>{form.created_by}</span></div>}
                    {form.qt_number && <div className="qp-meta-row"><span>Quote No.</span><span>QT-{form.qt_number}</span></div>}
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
                        <th>Rate ({currencyCode})</th>
                        <th>Amount ({currencyCode})</th>
                    </tr>
                </thead>
                <tbody>
                    {previewSections.flatMap((section, si) => {
                        const rows = [];
                        if (section.name || section.total > 0) {
                            rows.push(
                                <tr key={`sec-${si}`} className="qp-section-row">
                                    <td colSpan={4}>{section.letter}. {section.name}</td>
                                    <td className="qp-right">{section.total > 0 ? formatMoney(section.total) : ''}</td>
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
                                    <td>
                                        <div>{item.description}</div>
                                        {item.image && (
                                            <div className="qp-item-image-wrap">
                                                <img
                                                    src={item.image}
                                                    alt={`Preview item ${ii + 1}`}
                                                    className="qp-item-image"
                                                />
                                            </div>
                                        )}
                                    </td>
                                    <td className="qp-center">{qty > 0 ? qty : ''}</td>
                                    <td className="qp-center">{cost > 0 ? formatMoney(cost) : ''}</td>
                                    <td className="qp-right">{cost > 0 && qty > 0 ? formatMoney(qty * cost) : ''}</td>
                                </tr>
                            );
                        });
                        return rows;
                    })}
                </tbody>
            </table>

            <div className="qp-summary-row">
                <div className="qp-summary-spacer" />
                <div className="qp-totals-box">
                    <div className="qp-totals-title">Total Cost</div>
                    <div className="qp-totals-row"><span>Sub Total</span><span>{formatMoney(totalBeforeVat)}</span></div>
                    <div className="qp-totals-row"><span>Total VAT ({form.vat_percent}%)</span><span>{formatMoney(vat)}</span></div>
                    <div className="qp-totals-row qp-totals-grand"><span>Total {currencyCode}</span><span>{formatMoney(grand)}</span></div>
                    {grand > 0 && numberToWords && (
                        <div className="qp-words">{numberToWords(grand)}</div>
                    )}
                </div>
            </div>

            {hasSignatureBlock && (
                <div className="qp-signature-block">
                    <div className="qp-block-title">Authorised Signatory</div>
                    <div className="qp-signature-media">
                        {staffSignature?.signature_image && (
                            <img
                                src={staffSignature.signature_image}
                                alt="Saved signature"
                                className="qp-signature-image"
                            />
                        )}
                        {staffSignature?.stamp_image && (
                            <img
                                src={staffSignature.stamp_image}
                                alt="Saved stamp"
                                className="qp-stamp-image"
                            />
                        )}
                    </div>
                    <div className="qp-signature-name">{form.created_by}</div>
                    <div className="qp-signature-company">{profile.legalName}</div>
                </div>
            )}

            {hasLegalBlocks && (
                <div className="qp-legal-stack">
                    {Array.isArray(form.exclusions) && form.exclusions.some((item) => String(item || '').trim()) && (
                        <div className="qp-legal-block">
                            <div className="qp-block-title">Exclusions</div>
                            <ol className="qp-legal-list">
                                {form.exclusions.filter((item) => String(item || '').trim()).map((item, index) => (
                                    <li key={`preview-exclusion-${index}`}>{item}</li>
                                ))}
                            </ol>
                        </div>
                    )}
                    {Array.isArray(form.terms) && form.terms.some((item) => String(item || '').trim()) && (
                        <div className="qp-legal-block">
                            <div className="qp-block-title">Terms &amp; Conditions of Contract</div>
                            <ol className="qp-legal-list">
                                {form.terms.filter((item) => String(item || '').trim()).map((item, index) => (
                                    <li key={`preview-term-${index}`}>{item}</li>
                                ))}
                            </ol>
                        </div>
                    )}
                    {Array.isArray(form.payment_terms) && form.payment_terms.some((item) => String(item || '').trim()) && (
                        <div className="qp-legal-block">
                            <div className="qp-block-title">Payment Terms</div>
                            <ol className="qp-legal-list">
                                {form.payment_terms.filter((item) => String(item || '').trim()).map((item, index) => (
                                    <li key={`preview-payment-${index}`}>{item}</li>
                                ))}
                            </ol>
                        </div>
                    )}
                </div>
            )}
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

function formatAttachmentSize(size) {
    const numericSize = Number(size || 0);
    if (numericSize >= 1024 * 1024) {
        return `${(numericSize / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (numericSize >= 1024) {
        return `${Math.round(numericSize / 1024)} KB`;
    }
    return `${numericSize} B`;
}

function downloadAttachment(attachment) {
    if (!attachment?.data) return;
    const link = document.createElement('a');
    link.href = attachment.data;
    link.download = attachment.name || 'attachment';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function QuotationAttachmentsPanel({
    attachments = [],
    onAttachQuotationFiles,
    onUpdateQuotationAttachment,
    onRemoveQuotationAttachment,
}) {
    const internalInputRef = useRef(null);
    const downloadInputRef = useRef(null);

    return (
        <div style={{ marginTop: '2rem' }}>
            <div className="quotation-pro-section-title" style={{ marginBottom: '0.9rem' }}>Attached Files</div>
            <div style={{ border: '1px solid #dbe5f0', borderRadius: '16px', background: 'linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)', padding: '1.1rem', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    <div>
                        <div style={{ fontWeight: 700, color: '#1e293b' }}>Keep files with this quotation</div>
                        <div style={{ fontSize: '0.84rem', color: '#64748b', marginTop: '0.2rem' }}>Mark each file for internal use only or keep it ready for later download.</div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <input
                            ref={internalInputRef}
                            type="file"
                            multiple
                            className="quotation-hidden-file"
                            style={{ display: 'none' }}
                            onChange={(event) => {
                                onAttachQuotationFiles(event.target.files, 'internal');
                                event.target.value = '';
                            }}
                        />
                        <button type="button" className="quotation-btn quotation-btn-ghost" onClick={() => internalInputRef.current?.click()}>
                            + Internal File
                        </button>
                        <input
                            ref={downloadInputRef}
                            type="file"
                            multiple
                            className="quotation-hidden-file"
                            style={{ display: 'none' }}
                            onChange={(event) => {
                                onAttachQuotationFiles(event.target.files, 'download');
                                event.target.value = '';
                            }}
                        />
                        <button type="button" className="quotation-pro-btn-primary" onClick={() => downloadInputRef.current?.click()}>
                            + Downloadable File
                        </button>
                    </div>
                </div>

                {attachments.length === 0 ? (
                    <div style={{ border: '1px dashed #cbd5e1', borderRadius: '14px', padding: '1rem 1.1rem', color: '#64748b', background: '#f8fbff' }}>
                        No files attached yet.
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '0.8rem' }}>
                        {attachments.map((attachment) => (
                            <div key={attachment.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) 160px 120px 110px', gap: '0.85rem', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.85rem 0.95rem', background: '#fff' }}>
                                <div style={{ minWidth: 0 }}>
                                    <input
                                        className="quotation-pro-input"
                                        value={attachment.name || ''}
                                        onChange={(event) => onUpdateQuotationAttachment(attachment.id, 'name', event.target.value)}
                                        style={{ fontWeight: 600 }}
                                    />
                                    <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '0.35rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                        <span>{attachment.type || 'File'}</span>
                                        <span>{formatAttachmentSize(attachment.size)}</span>
                                    </div>
                                </div>
                                <select
                                    className="quotation-pro-input"
                                    value={attachment.category || 'internal'}
                                    onChange={(event) => onUpdateQuotationAttachment(attachment.id, 'category', event.target.value)}
                                    style={{ height: '40px' }}
                                >
                                    <option value="internal">Internal use</option>
                                    <option value="download">Download later</option>
                                </select>
                                <button type="button" className="quotation-btn quotation-btn-ghost" onClick={() => downloadAttachment(attachment)}>
                                    Download
                                </button>
                                <button type="button" className="quotation-btn quotation-btn-danger" onClick={() => onRemoveQuotationAttachment(attachment.id)}>
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function QuotationActivityLog({ history = [], onRestoreVersion, disabled }) {
    return (
        <div style={{ marginTop: '1.5rem', border: '1px solid #dbe5f0', borderRadius: '16px', background: '#fff', overflow: 'hidden' }}>
            <div style={{ padding: '0.95rem 1rem', borderBottom: '1px solid #e2e8f0', background: 'linear-gradient(180deg, #fbfdff 0%, #f5f8fc 100%)' }}>
                <div style={{ fontWeight: 700, color: '#1e293b' }}>Quotation Activity</div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>Every save creates a version snapshot you can restore.</div>
            </div>
            <div style={{ padding: '0.85rem 1rem', display: 'grid', gap: '0.75rem' }}>
                {history.length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: '0.88rem' }}>No saved versions yet.</div>
                ) : history.map((entry, index) => (
                    <div key={`${entry.version}-${entry.changed_at}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 120px', gap: '0.75rem', alignItems: 'center', paddingBottom: index === history.length - 1 ? 0 : '0.75rem', borderBottom: index === history.length - 1 ? 'none' : '1px solid #eef2f7' }}>
                        <div>
                            <div style={{ fontWeight: 700, color: '#243447' }}>Version {entry.version}</div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.18rem' }}>
                                {entry.changed_by || 'Unknown'} · {entry.status || 'Draft'}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.18rem' }}>
                                {entry.changed_at ? new Date(entry.changed_at).toLocaleString() : '--'}
                            </div>
                        </div>
                        <button
                            type="button"
                            className="quotation-btn quotation-btn-ghost"
                            onClick={() => onRestoreVersion(entry.version)}
                            disabled={disabled || index === 0}
                            title={index === 0 ? 'Current version' : `Restore version ${entry.version}`}
                        >
                            {index === 0 ? 'Current' : 'Restore'}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
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
    currencies = [],
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
    onAttachQuotationFiles,
    onUpdateQuotationAttachment,
    onRemoveQuotationAttachment,
    onApplyReference,
    onApplyCustomer,
    onSaveCustomer,
    onSaveSelectedCustomer,
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
    quotationHistory = [],
    onRestoreVersion,
}) {
    const groupedPriceReferences = groupPriceReferences(priceReferences);
    const [showPreview, setShowPreview] = useState(false);
    const [showActivityLog, setShowActivityLog] = useState(false);
    const [showSaveCustomer, setShowSaveCustomer] = useState(false);
    const [isEditingClient, setIsEditingClient] = useState(!form.client_org);
    const [isEditingHeader, setIsEditingHeader] = useState(false);
    const selectedCustomerId = form.customer_id || customers.find((customer) => customer.display_name === form.client_org)?.id || '';
    const salespersonOptions = [...new Set(signatures.map((signature) => String(signature.name || '').trim()).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right));
    const itemTableColumns = showManagement
        ? '40px minmax(280px,1.45fr) 64px 78px 100px 90px 96px 108px 92px'
        : '40px minmax(280px,1.45fr) 64px 78px 110px 92px';

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
                    <button type="button" className="quotation-btn quotation-btn-ghost" onClick={() => setShowActivityLog(true)}>
                        Activity
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
                                            value={selectedCustomerId}
                                            onChange={(e) => onApplyCustomer(e.target.value)}
                                        >
                                            <option value="">Select or type customer...</option>
                                            {customers.map(c => (
                                                <option key={c.id} value={c.id}>{c.display_name}</option>
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
                                    <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                                        <button
                                            type="button"
                                            className="quotation-btn quotation-btn-primary"
                                            onClick={onSaveSelectedCustomer}
                                            disabled={!form.customer_id}
                                        >
                                            Save Customer Details
                                        </button>
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
                                <label className="quotation-pro-label">PO Number</label>
                                <input
                                    className="quotation-pro-input"
                                    placeholder="Add customer PO number if available"
                                    value={form.ref}
                                    onChange={e => onFieldChange('ref', e.target.value)}
                                />
                            </div>
                            <div className="quotation-pro-field-row" style={{ marginTop: '0.75rem' }}>
                                <label className="quotation-pro-label required">Quote Date</label>
                                <input
                                    type="date"
                                    className="quotation-pro-input"
                                    value={displayDateToInput(form.date)}
                                    onChange={e => onFieldChange('date', inputDateToDisplay(e.target.value))}
                                />
                            </div>
                            <div className="quotation-pro-field-row" style={{ marginTop: '0.75rem' }}>
                                <label className="quotation-pro-label">Currency</label>
                                <select className="quotation-pro-input" value={form.currency_code || 'BHD'} onChange={e => onFieldChange('currency_code', e.target.value)}>
                                    {currencies.map((currency) => (
                                        <option key={currency.code} value={currency.code}>
                                            {currency.code} - {currency.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="quotation-pro-field-row" style={{ marginTop: '0.75rem' }}>
                                <label className="quotation-pro-label">Expiry Date</label>
                                <input type="text" className="quotation-pro-input" placeholder="e.g. 30 Days" value={form.expiry_date} onChange={e => onFieldChange('expiry_date', e.target.value)} />
                            </div>
                            <div className="quotation-pro-field-row" style={{ marginTop: '0.75rem' }}>
                                <label className="quotation-pro-label">Salesperson</label>
                                <div className="quotation-pro-input-group">
                                    <input
                                        list="salesperson-options"
                                        className="quotation-pro-input"
                                        style={{ marginBottom: '0.5rem' }}
                                        placeholder="Select or type salesperson name"
                                        value={form.created_by}
                                        onChange={e => onFieldChange('created_by', e.target.value)}
                                    />
                                    <datalist id="salesperson-options">
                                        {salespersonOptions.map((name) => (
                                            <option key={name} value={name} />
                                        ))}
                                    </datalist>
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

                    <QuotationAttachmentsPanel
                        attachments={form.attachments || []}
                        onAttachQuotationFiles={onAttachQuotationFiles}
                        onUpdateQuotationAttachment={onUpdateQuotationAttachment}
                        onRemoveQuotationAttachment={onRemoveQuotationAttachment}
                    />

                    {/* ITEM TABLE (BoQ) */}
                    <div className="quotation-pro-section-title" style={{ marginTop: '3rem' }}>Scope of Works</div>
                    
                    <div className="quotation-pro-table-wrapper" style={{ border: '1px solid #dbe5f0', borderRadius: '14px', overflow: 'hidden', background: '#ffffff', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.04)' }}>
                        <div className="quotation-pro-table-header" style={{ display: 'grid', gridTemplateColumns: itemTableColumns, gap: '0.9rem', background: 'linear-gradient(180deg, #fbfdff 0%, #f3f7fb 100%)', padding: '1rem 0.9rem', borderBottom: '1px solid #dbe5f0', fontSize: '11px', fontWeight: 800, color: '#526277', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                            <div style={{ textAlign: 'center' }}>NO</div>
                            <div>ITEM DETAILS</div>
                            <div style={{ textAlign: 'right' }}>QTY</div>
                            <div>UNIT</div>
                            <div style={{ textAlign: 'right' }}>COSTS ({form.currency_code || 'BHD'})</div>
                            {showManagement && <div style={{ textAlign: 'right', color: '#2563eb' }}>Rate ({form.currency_code || 'BHD'})</div>}
                            {showManagement && <div style={{ textAlign: 'right', color: '#2563eb' }}>Cost</div>}
                            {showManagement && <div style={{ textAlign: 'right', color: '#d97706' }}>Selling</div>}
                            <div style={{ textAlign: 'center' }}>ACTIONS</div>
                        </div>

                        {form.sections.map((section, sectionIndex) => (
                            <div key={`section-${sectionIndex}`} className="quotation-pro-section-row">
                                <div style={{ background: 'linear-gradient(180deg, #eef4fb 0%, #e7eef8 100%)', padding: '0.9rem 0.95rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #d9e4f0' }}>
                                    <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 900, color: '#5d7089', fontSize: '1.35rem', lineHeight: 1 }}>{String.fromCharCode(65 + sectionIndex)}</span>
                                        <input 
                                            className="quotation-pro-input" 
                                            style={{ background: 'transparent', border: 'none', fontWeight: 800, textTransform: 'uppercase', width: '320px', fontSize: '1rem', color: '#243447', padding: 0, boxShadow: 'none' }} 
                                            value={section.name} 
                                            onChange={e => onSectionChange(sectionIndex, s => ({ ...s, name: e.target.value.toUpperCase() }))}
                                            placeholder="Section Title..."
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                        <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', fontSize: '0.78rem', color: '#64748b', background: 'rgba(255,255,255,0.7)', border: '1px solid #d5dfeb', borderRadius: '999px', padding: '0.35rem 0.45rem 0.35rem 0.75rem' }}>
                                            <label style={{ whiteSpace: 'nowrap' }}>Section Total</label>
                                            <input
                                                className="quotation-pro-input"
                                                style={{ width: '98px', padding: '4px 8px', height: '30px', borderRadius: '8px', background: '#fff' }}
                                                value={section.section_selling || ''}
                                                onChange={e => onSectionChange(sectionIndex, s => ({ ...s, section_selling: e.target.value }))}
                                                placeholder="Auto"
                                                type="number"
                                            />
                                        </div>
                                        {showManagement && (
                                            <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', fontSize: '0.78rem', color: '#64748b', background: 'rgba(255,255,255,0.7)', border: '1px solid #d5dfeb', borderRadius: '999px', padding: '0.35rem 0.45rem 0.35rem 0.75rem' }}>
                                                <label style={{ whiteSpace: 'nowrap' }}>Selling %</label>
                                                <input className="quotation-pro-input" style={{ width: '70px', padding: '4px 8px', height: '30px', borderRadius: '8px', background: '#fff' }} value={section.selling_rule} onChange={e => onSectionChange(sectionIndex, s => ({ ...s, selling_rule: e.target.value }))} />
                                            </div>
                                        )}
                                        <button className="quotation-btn-danger" style={{ padding: '0.45rem 0.8rem', fontSize: '11px', borderRadius: '999px' }} onClick={() => onRemoveSection(sectionIndex)}>Remove Section</button>
                                    </div>
                                </div>

                                {section.items.map((item, itemIndex) => {
                                    const lineTotal = Number(item.qty || 0) * Number(item.rate || 0);
                                    const itemSelling = computeSellingFromInternal(lineTotal, section.selling_rule);
                                    return (
                                        <div key={`item-${sectionIndex}-${itemIndex}`} style={{ display: 'grid', gridTemplateColumns: itemTableColumns, gap: '0.9rem', padding: '1rem 0.9rem', borderBottom: '1px solid #edf2f7', alignItems: 'start', background: itemIndex % 2 === 0 ? '#ffffff' : '#fbfdff' }}>
                                            <div style={{ textAlign: 'center', color: '#8ca0b8', fontSize: '0.92rem', paddingTop: '0.65rem', fontWeight: 700 }}>{itemIndex + 1}</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                                <textarea className="quotation-pro-input" rows={2} style={{ width: '100%', minHeight: '46px', resize: 'vertical' }} value={item.description} onChange={e => onItemChange(sectionIndex, itemIndex, 'description', e.target.value)} />
                                                <select
                                                    className="quotation-pro-input"
                                                    style={{ fontSize: '11px', padding: '4px 8px', height: '32px' }}
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
                                                    <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', marginTop: '2px' }}>
                                                        <img src={item.image} alt="pic" style={{ height: '28px', width: '72px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #d8e1eb' }} />
                                                        <button className="quotation-btn-ghost" style={{ fontSize: '10px', padding: '0.25rem 0.5rem', borderRadius: '999px' }} onClick={() => onItemChange(sectionIndex, itemIndex, 'image', null)}>Remove Image</button>
                                                    </div>
                                                )}
                                            </div>
                                            <input type="number" className="quotation-pro-input" style={{ textAlign: 'center', height: '32px', padding: '4px 8px' }} value={item.qty} onChange={e => onItemChange(sectionIndex, itemIndex, 'qty', e.target.value)} />
                                            <select className="quotation-pro-input" style={{ height: '32px', padding: '4px 8px' }} value={item.unit} onChange={e => onItemChange(sectionIndex, itemIndex, 'unit', e.target.value)}>
                                                {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                                            </select>
                                            <input type="number" className="quotation-pro-input" style={{ textAlign: 'center', height: '32px', padding: '4px 8px' }} value={item.costs_bhd} onChange={e => onItemChange(sectionIndex, itemIndex, 'costs_bhd', e.target.value)} />
                                            {showManagement && <input type="number" className="quotation-pro-input" style={{ textAlign: 'center', background: '#fff8e7', height: '32px', padding: '4px 8px' }} value={item.rate} onChange={e => onItemChange(sectionIndex, itemIndex, 'rate', e.target.value)} />}
                                            {showManagement && <div style={{ textAlign: 'right', padding: '0.45rem 0.15rem', fontSize: '14px', fontWeight: 700, color: '#166534' }}>{formatMoney(lineTotal)}</div>}
                                            {showManagement && <div style={{ textAlign: 'right', padding: '0.45rem 0.15rem', fontSize: '14px', fontWeight: 700, color: '#b45309' }}>{formatMoney(itemSelling)}</div>}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'stretch' }}>
                                                <input className="quotation-hidden-file" id={`f-${sectionIndex}-${itemIndex}`} type="file" onChange={e => onAttachImage(sectionIndex, itemIndex, e.target.files?.[0])} style={{ display: 'none' }} />
                                                <label htmlFor={`f-${sectionIndex}-${itemIndex}`} style={{ textAlign: 'center', cursor: 'pointer', fontSize: '11px', color: '#4f46e5', background: '#eef2ff', borderRadius: '999px', padding: '0.35rem 0.5rem', fontWeight: 600 }}>Attach</label>
                                                <button className="quotation-btn-ghost" style={{ fontSize: '11px', color: '#ef4444', borderRadius: '999px', padding: '0.3rem 0.5rem', border: '1px solid #fecaca' }} onClick={() => onRemoveItem(sectionIndex, itemIndex)}>Remove</button>
                                            </div>
                                        </div>
                                    );
                                })}
                                {showManagement && (
                                    <div style={{ display: 'grid', gridTemplateColumns: itemTableColumns, gap: '0.75rem', padding: '0.7rem 0.9rem', background: 'linear-gradient(180deg, #fffef7 0%, #fff9e8 100%)', borderBottom: '1px solid #eee2b5', alignItems: 'center' }}>
                                        <div />
                                        <div style={{ fontWeight: 700, color: '#9a3412', fontSize: '0.92rem' }}>Section Summary</div>
                                        <div />
                                        <div />
                                        <div />
                                        <div style={{ textAlign: 'right', fontWeight: 700, color: '#2563eb', lineHeight: 1.3, fontSize: '0.9rem' }}>{sellingRuleLabel(section.selling_rule)}</div>
                                        <div style={{ textAlign: 'right', color: '#64748b', fontWeight: 700, lineHeight: 1.2 }}>
                                            <span style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sub-Total</span>
                                            <span style={{ fontSize: '0.98rem', color: '#475569' }}>{formatMoney(getSectionTotals(section).itemCostSubtotal)}</span>
                                        </div>
                                        <div style={{ textAlign: 'right', fontWeight: 700, color: '#a16207', lineHeight: 1.2 }}>
                                            <span style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Selling</span>
                                            <span style={{ fontSize: '0.98rem' }}>{formatMoney(getSectionTotals(section).suggested)}</span>
                                        </div>
                                    </div>
                                )}
                                {!showManagement && (
                                    <div style={{ display: 'grid', gridTemplateColumns: itemTableColumns, gap: '0.75rem', padding: '0.65rem 0.9rem', background: '#fbfcfe', borderBottom: '1px solid #e8eef5', alignItems: 'center' }}>
                                        <div />
                                        <div style={{ fontWeight: 700, color: '#64748b', fontSize: '0.88rem' }}>Customer Section Total</div>
                                        <div />
                                        <div />
                                        <div style={{ textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>
                                            {formatMoney(getSectionTotals(section).client)}
                                        </div>
                                        <div />
                                    </div>
                                )}
                                <div style={{ padding: '0.95rem 0.9rem 1rem', borderBottom: '1px solid #e2e8f0', background: '#fbfdff' }}>
                                    <button className="quotation-pro-btn-primary" style={{ background: '#f8fbff', color: '#64748b', border: '1px dashed #c3d4e8', width: '100%', borderRadius: '10px' }} onClick={() => onAddItem(sectionIndex)}>+ Add Item Line</button>
                                </div>
                            </div>
                        ))}
                        <div style={{ padding: '1.5rem', background: '#f8fbff', textAlign: 'center' }}>
                            <button className="quotation-pro-btn-primary" style={{ borderRadius: '10px', minWidth: '180px' }} onClick={onAddSection}>+ Add New Section</button>
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
                                <button
                                    type="button"
                                    className="quotation-btn quotation-btn-ghost quotation-activity-trigger"
                                    onClick={() => setShowActivityLog(true)}
                                >
                                    Open Quotation Activity
                                </button>
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
                                <span style={{ fontWeight: 700, color: '#1e293b' }}>Total {form.currency_code || 'BHD'}</span>
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
                                    signatures={signatures}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showActivityLog && (
                <div className="quotation-preview-overlay" onClick={() => setShowActivityLog(false)}>
                    <div className="quotation-activity-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="quotation-preview-header">
                            <span>Quotation Activity</span>
                            <button type="button" className="quotation-btn quotation-btn-ghost" onClick={() => setShowActivityLog(false)}>âœ•</button>
                        </div>
                        <div className="quotation-activity-scroll">
                            <QuotationActivityLog
                                history={quotationHistory}
                                onRestoreVersion={(version) => {
                                    setShowActivityLog(false);
                                    onRestoreVersion(version);
                                }}
                                disabled={!form.id || saving}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
