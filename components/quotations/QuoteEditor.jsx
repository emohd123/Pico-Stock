'use client';
import { useEffect, useState, useRef, useMemo } from 'react';
import { displayDateToInput, inputDateToDisplay } from '@/app/admin/quotations/page';
import {
    computeSellingFromInternal,
    DEFAULT_BRANDING_LOGO,
    FALLBACK_BRANDING_LOGO,
    normalizeBrandingLogoPath,
} from '@/lib/quotationCommercial';

function SafeBrandLogo({ src, alt, className, style, width, height }) {
    const [logoSrc, setLogoSrc] = useState(() => normalizeBrandingLogoPath(src));

    useEffect(() => {
        setLogoSrc(normalizeBrandingLogoPath(src));
    }, [src]);

    return (
        <img
            src={logoSrc}
            alt={alt}
            className={className}
            style={style}
            width={width}
            height={height}
            onError={(event) => {
                if (logoSrc === DEFAULT_BRANDING_LOGO) {
                    setLogoSrc(FALLBACK_BRANDING_LOGO);
                    return;
                }
                event.currentTarget.style.display = 'none';
            }}
        />
    );
}

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
    const existing = customers.find(
        (c) => c.display_name.toLowerCase() === String(form.client_org || '').trim().toLowerCase()
    );
    const [localForm, setLocalForm] = useState({
        display_name: form.client_org || '',
        contact_to: form.client_to || '',
        contact_title: existing?.contact_title || '',
        address: form.client_location || '',
        trn: form.client_trn || '',
        registration_number: existing?.registration_number || '',
        email: '',
        phone: '',
        extra_contacts: Array.isArray(existing?.extra_contacts) ? existing.extra_contacts : [],
    });
    const duplicate = customers.find(
        (c) => c.display_name.toLowerCase() === localForm.display_name.trim().toLowerCase()
    );

    async function handleSave() {
        if (!localForm.display_name.trim()) return;
        const savedCustomer = await onSaveCustomer(localForm);
        if (savedCustomer) {
            onClose();
        }
    }

    return (
        <div className="quotation-save-customer-panel">
            <div className="quotation-save-customer-header">
                <strong>{existing ? 'Update Customer' : 'Save as Customer'}</strong>
                <button type="button" className="quotation-btn quotation-btn-ghost" onClick={onClose}>Close</button>
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
                <div className="quotation-field">
                    <label>Contact Title</label>
                    <input className="quotation-input" value={localForm.contact_title} onChange={(e) => setLocalForm({ ...localForm, contact_title: e.target.value })} />
                </div>
                <div className="quotation-field quotation-span-2">
                    <label>Address</label>
                    <input className="quotation-input" value={localForm.address} onChange={(e) => setLocalForm({ ...localForm, address: e.target.value })} />
                </div>
                <div className="quotation-field">
                    <label>Registration Number</label>
                    <input className="quotation-input" value={localForm.registration_number} onChange={(e) => setLocalForm({ ...localForm, registration_number: e.target.value })} />
                </div>
                <div className="quotation-field">
                    <label>Email</label>
                    <input className="quotation-input" type="email" value={localForm.email} onChange={(e) => setLocalForm({ ...localForm, email: e.target.value })} />
                </div>
                <div className="quotation-field">
                    <label>Phone</label>
                    <input className="quotation-input" value={localForm.phone} onChange={(e) => setLocalForm({ ...localForm, phone: e.target.value })} />
                </div>
                <div className="quotation-field quotation-span-2">
                    <label>Additional Contacts</label>
                    <textarea
                        className="quotation-input quotation-textarea"
                        rows={4}
                        value={(localForm.extra_contacts || [])
                            .map((contact) => [contact.name, contact.title, contact.email, contact.phone].filter(Boolean).join(' | '))
                            .join('\n')}
                        onChange={(e) => setLocalForm({
                            ...localForm,
                            extra_contacts: e.target.value
                                .split('\n')
                                .map((line) => {
                                    const [name = '', title = '', email = '', phone = ''] = line.split('|').map((part) => part.trim());
                                    return { name, title, email, phone };
                                })
                                .filter((contact) => contact.name || contact.title || contact.email || contact.phone),
                        })}
                    />
                </div>
            </div>
            <div className="quotation-save-customer-actions">
                {duplicate && <span className="quotation-customer-exists-badge">Will update existing record</span>}
                <button type="button" className="quotation-btn quotation-btn-save-confirm" onClick={handleSave}>
                    {duplicate ? 'Update Customer' : 'Save Customer'}
                </button>
            </div>
        </div>
    );
}

function CustomerDirectoryPanel({ customers, selectedCustomerId, onDeleteCustomers, onClose }) {
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);
    const filteredCustomers = customers.filter((customer) =>
        [
            customer.display_name,
            customer.contact_to,
            customer.contact_title,
            customer.registration_number,
            customer.email,
            customer.phone,
        ].some((value) => String(value || '').toLowerCase().includes(search.trim().toLowerCase()))
    );

    function toggleCustomer(id) {
        setSelectedIds((current) =>
            current.includes(id)
                ? current.filter((value) => value !== id)
                : [...current, id]
        );
    }

    async function handleDelete(ids) {
        if (!ids.length) return;
        await onDeleteCustomers(ids);
        setSelectedIds((current) => current.filter((value) => !ids.includes(value)));
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" style={{ width: 'min(960px, calc(100vw - 2rem))', padding: '1.25rem' }} onClick={(event) => event.stopPropagation()}>
                <div className="quotation-save-customer-header">
                    <strong>Manage Customers</strong>
                    <button type="button" className="quotation-btn quotation-btn-ghost" onClick={onClose}>Close</button>
                </div>
                <div style={{ display: 'grid', gap: '0.9rem' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <input
                            className="quotation-input"
                            style={{ width: 'min(100%, 360px)' }}
                            placeholder="Search customers..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ color: '#64748b', fontSize: '0.88rem' }}>{selectedIds.length} selected</span>
                            <button
                                type="button"
                                className="quotation-btn quotation-btn-ghost"
                                onClick={() => setSelectedIds(filteredCustomers.map((customer) => String(customer.id)))}
                                disabled={!filteredCustomers.length}
                            >
                                Select Filtered
                            </button>
                            <button
                                type="button"
                                className="quotation-btn"
                                style={{ background: '#fff1f2', borderColor: '#fecdd3', color: '#be123c' }}
                                onClick={() => handleDelete(selectedIds)}
                                disabled={!selectedIds.length}
                            >
                                Delete Selected
                            </button>
                        </div>
                    </div>
                    <div style={{ maxHeight: '60vh', overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                        {filteredCustomers.map((customer) => {
                            const customerId = String(customer.id);
                            const checked = selectedIds.includes(customerId);
                            return (
                                <label
                                    key={customerId}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '20px minmax(0, 1.3fr) minmax(0, 0.9fr) auto auto',
                                        gap: '0.9rem',
                                        alignItems: 'start',
                                        padding: '0.85rem 1rem',
                                        borderBottom: '1px solid #eef2f7',
                                        background: checked ? '#f0fdfa' : '#fff',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleCustomer(customerId)}
                                        style={{ marginTop: '0.2rem' }}
                                    />
                                    <div>
                                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{customer.display_name}</div>
                                        <div style={{ color: '#64748b', fontSize: '0.84rem', marginTop: '0.2rem' }}>
                                            {[customer.contact_to, customer.contact_title].filter(Boolean).join(' • ') || 'No main contact'}
                                        </div>
                                    </div>
                                    <div style={{ color: '#475569', fontSize: '0.84rem' }}>
                                        {customer.registration_number || customer.trn || 'No registration'}
                                    </div>
                                    <div style={{ color: '#64748b', fontSize: '0.82rem', minWidth: '140px' }}>
                                        {customer.email || customer.phone || 'No email / phone'}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <button
                                            type="button"
                                            className="quotation-btn quotation-btn-ghost"
                                            style={{ color: '#be123c', borderColor: '#fecdd3', background: '#fff1f2', minHeight: '38px', padding: '0.45rem 0.8rem' }}
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                handleDelete([customerId]);
                                            }}
                                            disabled={selectedCustomerId === customerId}
                                            title={selectedCustomerId === customerId ? 'Cannot delete the currently selected customer' : 'Delete customer'}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </label>
                            );
                        })}
                        {!filteredCustomers.length ? (
                            <div style={{ padding: '1.2rem', color: '#64748b', textAlign: 'center' }}>No customers found.</div>
                        ) : null}
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.82rem' }}>
                        The currently selected customer cannot be deleted until you switch to another one.
                    </div>
                </div>
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
                    <SafeBrandLogo src={profile.logoPath} alt={profile.legalName} className="qp-logo" />
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
    if (!attachment?.data && !attachment?.path) return;
    const link = document.createElement('a');
    link.href = attachment.data || attachment.path;
    link.download = attachment.original_name || attachment.name || 'attachment';
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
                            accept=".pdf,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.gif,.svg,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
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
                            accept=".pdf,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.gif,.svg,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
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
                            {entry.activity_type ? (
                                <div style={{ marginTop: '0.42rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', fontWeight: 700, color: '#0f766e', background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: '999px', padding: '0.24rem 0.55rem' }}>
                                    <span>AI</span>
                                    <span>{String(entry.activity_type || '').replace(/^ai-/, '').replace(/-/g, ' ')}</span>
                                </div>
                            ) : null}
                            {entry.activity_summary ? (
                                <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.45rem', lineHeight: 1.5 }}>
                                    {entry.activity_summary}
                                </div>
                            ) : null}
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
function fileToAiPayload(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            resolve({
                name: file.name,
                type: file.type || 'application/octet-stream',
                size: Number(file.size || 0),
                data: String(reader.result || ''),
            });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

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
    onDeleteCustomers,
    onSaveSelectedCustomer,
    onSaveSignature,
    onGenerateAiDraft,
    onSuggestAiPricing,
    onApplyAiPricingSuggestions,
    onReviewAiQuote,
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
    const [showAiAssistant, setShowAiAssistant] = useState(false);
    const [showSaveCustomer, setShowSaveCustomer] = useState(false);
    const [showCustomerDirectory, setShowCustomerDirectory] = useState(false);
    const [isEditingHeader, setIsEditingHeader] = useState(false);
    const [aiBrief, setAiBrief] = useState('');
    const [aiFiles, setAiFiles] = useState([]);
    const [aiBusy, setAiBusy] = useState(false);
    const [aiBusyLabel, setAiBusyLabel] = useState('');
    const [aiResult, setAiResult] = useState(null);
    const [aiLibraryStats, setAiLibraryStats] = useState(null);
    const [aiLibraryBusy, setAiLibraryBusy] = useState(false);
    const selectedCustomerId = form.customer_id || customers.find((customer) => customer.display_name === form.client_org)?.id || '';
    const selectedCustomer = customers.find((customer) => String(customer.id) === String(selectedCustomerId)) || null;
    const salespersonOptions = [...new Set(signatures.map((signature) => String(signature.name || '').trim()).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right));
    const itemTableColumns = showManagement
        ? '40px minmax(280px,1.45fr) 64px 78px 100px 90px 96px 108px 92px'
        : '40px minmax(280px,1.45fr) 64px 78px 110px 92px';

    const activeProfile = form.company_profile || companyProfile;
    const sectionHeaderControlStyle = {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.28rem',
        minWidth: '122px',
        padding: '0.55rem 0.65rem',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.92)',
        border: '1px solid #dbe5f0',
        boxShadow: '0 8px 18px rgba(15, 23, 42, 0.05)',
    };
    const sectionHeaderLabelStyle = {
        fontSize: '0.68rem',
        fontWeight: 800,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        lineHeight: 1,
    };

    async function buildAiFilesPayload(fileList) {
        const files = Array.from(fileList || []);
        return Promise.all(files.map(fileToAiPayload));
    }

    async function handleAiFileChange(event) {
        const files = Array.from(event.target.files || []);
        setAiFiles(files);
        setAiResult(null);
    }

    async function loadAiLibraryStatus() {
        setAiLibraryBusy(true);
        try {
            const response = await fetch('/api/quotations/ai/library/import', { cache: 'no-store' });
            if (!response.ok) return; // silently skip — don't pollute AI results with background stats errors
            const data = await response.json();
            setAiLibraryStats(data.stats || null);
        } catch {
            // silently skip background stats load
        } finally {
            setAiLibraryBusy(false);
        }
    }

    async function importAiLibrary() {
        setAiLibraryBusy(true);
        try {
            const response = await fetch('/api/quotations/ai/library/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to import quotation AI library');
            setAiLibraryStats(data.stats || null);
            setAiResult({
                type: 'AI Library',
                data: {
                    summary: `Imported ${data.historical?.imported_records || 0} historical quotation groups and indexed ${data.system_indexed || 0} live system quotations.`,
                    matched_quotations: [],
                    library_stats: data.stats || null,
                },
            });
        } catch (error) {
            setAiResult({
                type: 'AI Library',
                error: error.message || 'Failed to import quotation AI library',
            });
        } finally {
            setAiLibraryBusy(false);
        }
    }

    async function runAiAction(label, action) {
        setAiBusy(true);
        setAiBusyLabel(label);
        try {
            const files = await buildAiFilesPayload(aiFiles);
            const result = await action({ brief: aiBrief, files });
            if (result?.library_stats) {
                setAiLibraryStats(result.library_stats);
            }
            setAiResult({ type: label, data: result });
        } catch (error) {
            const raw = error.message || `Failed to ${label.toLowerCase()}`;
            const isAuthError = raw === 'Unauthorized' || raw.toLowerCase().includes('unauthorized');
            setAiResult({
                type: label,
                error: isAuthError
                    ? 'Your session has expired. Please refresh the page and log in again to use the AI assistant.'
                    : raw,
                sessionExpired: isAuthError,
            });
        } finally {
            setAiBusy(false);
            setAiBusyLabel('');
        }
    }

    function renderAiWarnings(result) {
        const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
        if (!warnings.length) {
            return <div style={{ color: '#0f766e', fontWeight: 600 }}>No obvious quotation issues were found.</div>;
        }
        return (
            <div style={{ display: 'grid', gap: '0.65rem' }}>
                {warnings.map((warning, index) => (
                    <div
                        key={`${warning.title || 'warning'}-${index}`}
                        style={{
                            padding: '0.8rem 0.9rem',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            background: warning.severity === 'high' ? '#fff1f2' : warning.severity === 'medium' ? '#fff7ed' : '#f8fafc',
                        }}
                    >
                        <div style={{ fontWeight: 700, color: '#0f172a', textTransform: 'capitalize' }}>
                            {warning.severity || 'info'}: {warning.title}
                        </div>
                        <div style={{ marginTop: '0.35rem', color: '#475569', lineHeight: 1.5 }}>{warning.message}</div>
                    </div>
                ))}
            </div>
        );
    }

    useEffect(() => {
        if (!showAiAssistant) return;
        loadAiLibraryStatus();
    }, [showAiAssistant]);

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
                        {showPreview ? 'Close Preview' : 'Preview'}
                    </button>
                    <button type="button" className="quotation-btn quotation-btn-ghost" onClick={() => setShowAiAssistant(true)}>
                        AI Assistant
                    </button>
                    <button type="button" className="quotation-btn quotation-btn-ghost" onClick={() => setShowActivityLog(true)}>
                        Activity
                    </button>
                    <button type="button" className="quotation-pro-btn-primary" onClick={form.status === 'Confirmed' ? onSaveConfirmed : onSaveDraft}>
                        {saving ? 'Saving...' : 'Save Quote'}
                    </button>
                    <button type="button" className="quotation-btn quotation-btn-ghost" onClick={onBack}>Close</button>
                </div>
            </div>

            {/* ─── Editor Content ─── */}
            <div className="quotation-editor-pane">
                <div className="quotation-pro-sheet">
                    {/* Header Branding (Compact) */}
                    <div className="quotation-brand-pro-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <SafeBrandLogo src={activeProfile.logoPath} alt="Logo" style={{ height: '40px', width: 'auto' }} />
                            <div style={{ fontSize: '0.9rem', color: '#475569' }}>
                                <strong style={{ display: 'block', color: '#1e293b' }}>{activeProfile.legalName}</strong>
                                <span>{activeProfile.vatNumber}</span>
                            </div>
                        </div>
                        <button type="button" className="quotation-header-edit-btn" onClick={() => setIsEditingHeader(true)}>Edit Header</button>
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
                                        <button type="button" className="quotation-btn-small" onClick={() => setShowCustomerDirectory(true)} style={{ border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff', padding: '0 10px', fontSize: '12px' }}>Manage</button>
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

                            <div style={{ marginTop: '1rem', padding: '0.9rem 1rem', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                <div className="quotation-form-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '0.75rem' }}>
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
                                {Array.isArray(selectedCustomer?.extra_contacts) && selectedCustomer.extra_contacts.length > 0 && (
                                    <div style={{ marginTop: '0.75rem' }}>
                                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>Additional Contacts</div>
                                        <div style={{ display: 'grid', gap: '0.35rem' }}>
                                            {selectedCustomer.extra_contacts.map((contact, index) => (
                                                <div key={`${contact.name || 'contact'}-${index}`} style={{ padding: '0.45rem 0.65rem', borderRadius: '7px', background: '#fff', border: '1px solid #e2e8f0', fontSize: '0.83rem' }}>
                                                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{contact.name || 'Contact'}</span>
                                                    {contact.title ? <span style={{ color: '#64748b' }}> · {contact.title}</span> : null}
                                                    {contact.email ? <span style={{ color: '#2563eb' }}> · {contact.email}</span> : null}
                                                    {contact.phone ? <span style={{ color: '#475569' }}> · {contact.phone}</span> : null}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div style={{ marginTop: '0.9rem', display: 'flex', justifyContent: 'flex-end' }}>
                                    <button
                                        type="button"
                                        className="quotation-btn quotation-btn-primary"
                                        onClick={onSaveSelectedCustomer}
                                        disabled={!form.customer_id}
                                        title={!form.customer_id ? 'Select a customer first' : 'Save contact details to the customer record'}
                                    >
                                        Save to Customer Record
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Metadata Section */}
                        <div className="quotation-pro-section">
                            {form.source_type === 'order' && form.source_order_reference ? (
                                <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', borderRadius: '10px', background: '#eefbf7', border: '1px solid #bde6d8', color: '#0f766e', fontSize: '0.84rem', fontWeight: 700 }}>
                                    Linked order: {form.source_order_reference}
                                </div>
                            ) : null}
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
                                <div style={{ background: 'linear-gradient(180deg, #f4f8fd 0%, #eaf1fa 100%)', padding: '1rem 1rem 1.05rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #d9e4f0', gap: '1rem', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'center', minWidth: '320px', flex: '1 1 360px' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '12px', fontWeight: 900, color: '#42617f', fontSize: '1.05rem', lineHeight: 1, background: '#ffffff', border: '1px solid #d8e2ee', boxShadow: '0 8px 16px rgba(15, 23, 42, 0.05)' }}>{String.fromCharCode(65 + sectionIndex)}</span>
                                        <input 
                                            className="quotation-pro-input" 
                                            style={{ background: 'transparent', border: 'none', fontWeight: 800, textTransform: 'uppercase', width: '100%', maxWidth: '420px', fontSize: '1rem', color: '#243447', padding: 0, boxShadow: 'none', letterSpacing: '0.01em' }} 
                                            value={section.name} 
                                            onChange={e => onSectionChange(sectionIndex, s => ({ ...s, name: e.target.value.toUpperCase() }))}
                                            placeholder="Section Title..."
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'stretch', flexWrap: 'wrap', justifyContent: 'flex-end', flex: '0 1 auto' }}>
                                        <div style={sectionHeaderControlStyle}>
                                            <label style={sectionHeaderLabelStyle}>Section Total</label>
                                            <input
                                                className="quotation-pro-input"
                                                style={{ width: '100%', padding: '6px 10px', height: '34px', borderRadius: '10px', background: '#fff', fontWeight: 700 }}
                                                value={section.section_selling || ''}
                                                onChange={e => onSectionChange(sectionIndex, s => ({ ...s, section_selling: e.target.value }))}
                                                placeholder="Auto"
                                                type="number"
                                            />
                                        </div>
                                        {showManagement && (
                                            <div style={{ ...sectionHeaderControlStyle, minWidth: '112px' }}>
                                                <label style={sectionHeaderLabelStyle}>Selling %</label>
                                                <input className="quotation-pro-input" style={{ width: '100%', padding: '6px 10px', height: '34px', borderRadius: '10px', background: '#fff', fontWeight: 700 }} value={section.selling_rule} onChange={e => onSectionChange(sectionIndex, s => ({ ...s, selling_rule: e.target.value }))} />
                                            </div>
                                        )}
                                        <button className="quotation-btn-danger" style={{ padding: '0.6rem 0.95rem', fontSize: '11px', borderRadius: '12px', alignSelf: 'stretch', minHeight: '50px', display: 'inline-flex', alignItems: 'center' }} onClick={() => onRemoveSection(sectionIndex)}>Remove Section</button>
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
                                    <div style={{ padding: '0.95rem 1rem', background: 'linear-gradient(180deg, #fffef8 0%, #fff9eb 100%)', borderBottom: '1px solid #eee2b5' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                            <div style={{ fontWeight: 800, color: '#9a3412', fontSize: '0.95rem' }}>Section Summary</div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, auto))', gap: '0.75rem', alignItems: 'stretch' }}>
                                                <div style={{ padding: '0.7rem 0.85rem', borderRadius: '12px', background: '#ffffff', border: '1px solid #e8dcc0', textAlign: 'right' }}>
                                                    <span style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', fontWeight: 800 }}>Selling Rule</span>
                                                    <span style={{ display: 'block', marginTop: '0.25rem', fontWeight: 800, color: '#2563eb', lineHeight: 1.35 }}>{sellingRuleLabel(section.selling_rule)}</span>
                                                </div>
                                                <div style={{ padding: '0.7rem 0.85rem', borderRadius: '12px', background: '#ffffff', border: '1px solid #e8dcc0', textAlign: 'right' }}>
                                                    <span style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', fontWeight: 800 }}>Sub-Total</span>
                                                    <span style={{ display: 'block', marginTop: '0.25rem', fontSize: '1rem', color: '#475569', fontWeight: 800 }}>{formatMoney(getSectionTotals(section).itemCostSubtotal)}</span>
                                                </div>
                                                <div style={{ padding: '0.7rem 0.85rem', borderRadius: '12px', background: '#ffffff', border: '1px solid #e8dcc0', textAlign: 'right' }}>
                                                    <span style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', fontWeight: 800 }}>Selling</span>
                                                    <span style={{ display: 'block', marginTop: '0.25rem', fontSize: '1rem', color: '#a16207', fontWeight: 800 }}>{formatMoney(getSectionTotals(section).suggested)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {!showManagement && (
                                    <div style={{ padding: '0.8rem 1rem', background: '#fbfcfe', borderBottom: '1px solid #e8eef5' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                            <div style={{ fontWeight: 700, color: '#64748b', fontSize: '0.9rem' }}>Customer Section Total</div>
                                            <div style={{ padding: '0.65rem 0.85rem', borderRadius: '12px', background: '#ffffff', border: '1px solid #dbe5f0', textAlign: 'right', minWidth: '150px' }}>
                                                <span style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', fontWeight: 800 }}>Total</span>
                                                <span style={{ display: 'block', marginTop: '0.25rem', fontWeight: 800, color: '#0f766e' }}>
                                                    {formatMoney(getSectionTotals(section).client)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div style={{ padding: '0.95rem 1rem 1.05rem', borderBottom: '1px solid #e2e8f0', background: '#fbfdff' }}>
                                    <button className="quotation-pro-btn-primary" style={{ background: '#f8fbff', color: '#64748b', border: '1px dashed #c3d4e8', width: '100%', borderRadius: '12px', minHeight: '44px', fontWeight: 700 }} onClick={() => onAddItem(sectionIndex)}>+ Add Item Line</button>
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
                                <button className="quotation-btn quotation-btn-ghost" onClick={onExportCustomerPdf} disabled={!form.id}>Customer PDF</button>
                                <button className="quotation-btn quotation-btn-ghost" onClick={onExportManagementPdf} disabled={!form.id}>Management PDF</button>
                                <button className="quotation-btn quotation-btn-ghost" onClick={onExportExcel} disabled={!form.id}>Export Excel</button>
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

            {showAiAssistant && (
                <div className="quotation-preview-overlay" onClick={() => setShowAiAssistant(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
                    <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 'min(980px, 96vw)', maxHeight: '90vh', overflow: 'auto', borderRadius: '20px', boxShadow: '0 35px 90px rgba(15,23,42,0.28)', padding: '1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.95rem' }}>
                            <div>
                                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>AI Assistant</div>
                                <div style={{ color: '#64748b', fontSize: '0.88rem', marginTop: '0.2rem' }}>Generate a first draft, suggest pricing, and review the quote before sending.</div>
                            </div>
                            <button type="button" className="quotation-btn quotation-btn-ghost" onClick={() => setShowAiAssistant(false)}>Close</button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.95fr) minmax(0, 1.05fr)', gap: '1rem', marginTop: '1rem' }}>
                            <div style={{ display: 'grid', gap: '0.9rem' }}>
                                <div style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '16px', background: '#fbfdff' }}>
                                    <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '0.55rem' }}>Brief</div>
                                    <textarea
                                        className="quotation-input quotation-textarea"
                                        rows={8}
                                        placeholder="Paste the client brief, notes, design scope, or the outcome you want the quotation to cover..."
                                        value={aiBrief}
                                        onChange={(event) => {
                                            setAiBrief(event.target.value);
                                            setAiResult(null);
                                        }}
                                    />
                                </div>

                                <div style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '16px', background: '#fbfdff' }}>
                                    <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '0.55rem' }}>Source Files</div>
                                    <input type="file" multiple accept=".pdf,.ppt,.pptx,.xlsx,.xls,.txt,.png,.jpg,.jpeg,.webp" onChange={handleAiFileChange} />
                                    <div style={{ marginTop: '0.55rem', color: '#64748b', fontSize: '0.82rem' }}>
                                        Supports PDF, PPT/PPTX, Excel, text, and images for internal draft generation.
                                    </div>
                                    <div style={{ marginTop: '0.35rem', color: '#0f766e', fontSize: '0.8rem', fontWeight: 600 }}>
                                        Upload an old quotation here to duplicate it into a new draft.
                                    </div>
                                    {aiFiles.length ? (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.75rem' }}>
                                            {aiFiles.map((file) => (
                                                <span key={`${file.name}-${file.size}`} style={{ fontSize: '0.78rem', borderRadius: '999px', padding: '0.3rem 0.6rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                                                    {file.name}
                                                </span>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>

                                <div style={{ padding: '1rem', border: '1px solid #d9edf2', borderRadius: '16px', background: 'linear-gradient(180deg, #f5fdff 0%, #effbff 100%)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                        <div>
                                            <div style={{ fontWeight: 700, color: '#155e75' }}>AI Learning Library</div>
                                            <div style={{ color: '#64748b', fontSize: '0.82rem', marginTop: '0.2rem' }}>Import old quotation spreadsheets once, then keep learning from future saved quotations automatically.</div>
                                        </div>
                                        <button
                                            type="button"
                                            className="quotation-btn quotation-btn-ghost"
                                            onClick={importAiLibrary}
                                            disabled={aiLibraryBusy}
                                        >
                                            {aiLibraryBusy ? 'Importing...' : 'Import Historical Library'}
                                        </button>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.65rem', marginTop: '0.85rem' }}>
                                        <div style={{ padding: '0.7rem 0.8rem', borderRadius: '12px', background: '#fff', border: '1px solid #dbeafe' }}>
                                            <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Historical</div>
                                            <div style={{ marginTop: '0.25rem', fontWeight: 800, color: '#0f172a' }}>{aiLibraryStats?.historical_records ?? '--'}</div>
                                        </div>
                                        <div style={{ padding: '0.7rem 0.8rem', borderRadius: '12px', background: '#fff', border: '1px solid #dbeafe' }}>
                                            <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>System</div>
                                            <div style={{ marginTop: '0.25rem', fontWeight: 800, color: '#0f172a' }}>{aiLibraryStats?.system_records ?? '--'}</div>
                                        </div>
                                        <div style={{ padding: '0.7rem 0.8rem', borderRadius: '12px', background: '#fff', border: '1px solid #dbeafe' }}>
                                            <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Last Import</div>
                                            <div style={{ marginTop: '0.25rem', fontWeight: 700, color: '#0f172a', fontSize: '0.82rem' }}>
                                                {aiLibraryStats?.historical_imported_at ? new Date(aiLibraryStats.historical_imported_at).toLocaleString() : (aiLibraryBusy ? 'Loading...' : 'Not imported yet')}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gap: '0.65rem' }}>
                                    <button
                                        type="button"
                                        className="quotation-pro-btn-primary"
                                        onClick={() => runAiAction('Generate Draft', onGenerateAiDraft)}
                                        disabled={aiBusy}
                                    >
                                        {aiBusyLabel === 'Generate Draft' ? 'Generating Draft...' : 'Generate Draft'}
                                    </button>
                                    <button
                                        type="button"
                                        className="quotation-btn quotation-btn-ghost"
                                        onClick={() => runAiAction('Duplicate Uploaded Quote', ({ brief, files }) => onGenerateAiDraft({ brief, files, mode: 'duplicate' }))}
                                        disabled={aiBusy}
                                    >
                                        {aiBusyLabel === 'Duplicate Uploaded Quote' ? 'Duplicating Quote...' : 'Duplicate Uploaded Quote'}
                                    </button>
                                    <button
                                        type="button"
                                        className="quotation-btn quotation-btn-ghost"
                                        onClick={() => runAiAction('Suggest Pricing', () => onSuggestAiPricing())}
                                        disabled={aiBusy}
                                    >
                                        {aiBusyLabel === 'Suggest Pricing' ? 'Checking Pricing...' : 'Suggest Pricing'}
                                    </button>
                                    <button
                                        type="button"
                                        className="quotation-btn quotation-btn-ghost"
                                        onClick={() => runAiAction('Review Quote', onReviewAiQuote)}
                                        disabled={aiBusy}
                                    >
                                        {aiBusyLabel === 'Review Quote' ? 'Reviewing Quote...' : 'Review Quote'}
                                    </button>
                                </div>
                            </div>

                            <div style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '16px', background: '#fff', minHeight: '420px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem' }}>
                                    <div>
                                        <div style={{ fontWeight: 700, color: '#1e293b' }}>AI Results</div>
                                        <div style={{ color: '#64748b', fontSize: '0.82rem', marginTop: '0.2rem' }}>The assistant updates the working draft only. Save when you are happy with the result.</div>
                                    </div>
                                </div>

                                {!aiResult ? (
                                    <div style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.7 }}>
                                        Use the assistant to build a draft from notes and files, suggest pricing from your saved references, or review the quote before export.
                                    </div>
                                ) : aiResult.error ? (
                                    <div style={{ padding: '0.9rem 1rem', borderRadius: '12px', background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239' }}>
                                        {aiResult.error}
                                        {aiResult.sessionExpired && (
                                            <div style={{ marginTop: '0.65rem' }}>
                                                <a href="/admin/login" style={{ display: 'inline-block', padding: '0.4rem 0.9rem', background: '#9f1239', color: '#fff', borderRadius: '8px', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700 }}>
                                                    Log in again
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gap: '0.9rem' }}>
                                        <div style={{ padding: '0.9rem 1rem', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{aiResult.type}</div>
                                            {aiResult.data?.summary ? (
                                                <div style={{ marginTop: '0.35rem', color: '#475569', lineHeight: 1.6 }}>{aiResult.data.summary}</div>
                                            ) : null}
                                        </div>

                                        {Array.isArray(aiResult.data?.assumptions) && aiResult.data.assumptions.length ? (
                                            <div>
                                                <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '0.45rem' }}>Assumptions</div>
                                                <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#475569', lineHeight: 1.7 }}>
                                                    {aiResult.data.assumptions.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
                                                </ul>
                                            </div>
                                        ) : null}

                                        {Array.isArray(aiResult.data?.missing_details) && aiResult.data.missing_details.length ? (
                                            <div>
                                                <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '0.45rem' }}>Still Needed</div>
                                                <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#475569', lineHeight: 1.7 }}>
                                                    {aiResult.data.missing_details.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
                                                </ul>
                                            </div>
                                        ) : null}

                                        {Array.isArray(aiResult.data?.suggestions) ? (
                                            <div style={{ display: 'grid', gap: '0.7rem' }}>
                                                <div style={{ fontWeight: 700, color: '#1e293b' }}>Pricing Suggestions</div>
                                                {aiResult.data.suggestions.length ? aiResult.data.suggestions.map((suggestion, index) => (
                                                    <div key={`${suggestion.sectionIndex}-${suggestion.itemIndex}-${index}`} style={{ padding: '0.85rem 0.95rem', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fbfdff' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                                                            <strong style={{ color: '#0f172a' }}>Section {Number(suggestion.sectionIndex) + 1}, item {Number(suggestion.itemIndex) + 1}</strong>
                                                            <span style={{ fontSize: '0.78rem', color: '#0f766e', fontWeight: 700 }}>Confidence {(Number(suggestion.confidence || 0) * 100).toFixed(0)}%</span>
                                                        </div>
                                                        <div style={{ marginTop: '0.35rem', color: '#475569', lineHeight: 1.55 }}>{suggestion.reasoning}</div>
                                                        <div style={{ marginTop: '0.45rem', display: 'flex', flexWrap: 'wrap', gap: '0.6rem', fontSize: '0.82rem', color: '#334155' }}>
                                                            {suggestion.reference_title ? <span>Reference: {suggestion.reference_title}</span> : null}
                                                            {suggestion.matched_quotation_label ? <span>Matched Quote: {suggestion.matched_quotation_label}</span> : null}
                                                            {suggestion.costs_bhd !== undefined ? <span>Cost: {suggestion.costs_bhd}</span> : null}
                                                            {suggestion.rate !== undefined ? <span>Rate: {suggestion.rate}</span> : null}
                                                            {suggestion.selling_rule ? <span>Selling %: {suggestion.selling_rule}</span> : null}
                                                        </div>
                                                    </div>
                                                )) : <div style={{ color: '#64748b' }}>No pricing suggestions were returned for the current quote.</div>}
                                                {aiResult.data.suggestions.length ? <div style={{ color: '#0f766e', fontWeight: 700 }}>Pricing suggestions were applied to the working draft. Save the quotation when you are ready.</div> : null}
                                            </div>
                                        ) : null}

                                        {Array.isArray(aiResult.data?.matched_quotations) && aiResult.data.matched_quotations.length ? (
                                            <div>
                                                <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '0.45rem' }}>Matched Quotations</div>
                                                <div style={{ display: 'grid', gap: '0.55rem' }}>
                                                    {aiResult.data.matched_quotations.map((match, index) => (
                                                        <div key={`${match.source_key || match.source_label}-${index}`} style={{ padding: '0.8rem 0.9rem', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#fbfdff' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                                                                <strong style={{ color: '#0f172a' }}>{match.source_label || match.title || 'Matched quotation'}</strong>
                                                                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{match.source_type}</span>
                                                            </div>
                                                            <div style={{ marginTop: '0.35rem', color: '#475569', fontSize: '0.84rem' }}>
                                                                {[match.title, match.customer_name, match.ref].filter(Boolean).join(' | ')}
                                                            </div>
                                                            {Array.isArray(match.reasons) && match.reasons.length ? (
                                                                <div style={{ marginTop: '0.45rem', display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                                                                    {match.reasons.map((reason) => (
                                                                        <span key={`${match.source_key || match.source_label}-${reason}`} style={{ fontSize: '0.75rem', borderRadius: '999px', padding: '0.2rem 0.5rem', background: '#ecfeff', color: '#0f766e', border: '1px solid #bae6fd' }}>
                                                                            {reason}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}

                                        {aiResult.data?.learned_patterns ? (
                                            <div>
                                                <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '0.45rem' }}>Learned Patterns</div>
                                                <div style={{ display: 'grid', gap: '0.75rem' }}>
                                                    {[
                                                        ['Preferred Sections', aiResult.data.learned_patterns.preferred_section_names],
                                                        ['Common Units', aiResult.data.learned_patterns.preferred_units],
                                                        ['Typical Selling Rules', aiResult.data.learned_patterns.recommended_selling_rules],
                                                    ].filter(([, values]) => Array.isArray(values) && values.length).map(([label, values]) => (
                                                        <div key={label} style={{ padding: '0.85rem 0.95rem', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fbfdff' }}>
                                                            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.45rem' }}>{label}</div>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                                                                {values.map((value) => (
                                                                    <span key={`${label}-${value}`} style={{ fontSize: '0.78rem', borderRadius: '999px', padding: '0.28rem 0.55rem', background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1' }}>
                                                                        {value}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}

                                        {Array.isArray(aiResult.data?.warnings) ? renderAiWarnings(aiResult.data) : null}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showPreview && (
                <div className="quotation-preview-overlay" onClick={() => setShowPreview(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
                    <div className="quotation-preview-modal" onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: '900px', maxWidth: '95vw', height: '90vh', borderRadius: '8px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div className="quotation-preview-header" style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600 }}>Live Preview</span>
                            <button type="button" className="quotation-btn quotation-btn-ghost" onClick={() => setShowPreview(false)}>Close</button>
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
                            <button type="button" className="quotation-btn quotation-btn-ghost" onClick={() => setShowActivityLog(false)}>Close</button>
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

            {showCustomerDirectory ? (
                <CustomerDirectoryPanel
                    customers={customers}
                    selectedCustomerId={selectedCustomerId}
                    onDeleteCustomers={onDeleteCustomers}
                    onClose={() => setShowCustomerDirectory(false)}
                />
            ) : null}
        </div>
    );
}


