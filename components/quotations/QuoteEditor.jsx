import { useState } from 'react';

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

function EditableTextList({ title, items, onChange }) {
    function updateItem(index, value) {
        onChange(items.map((item, itemIndex) => itemIndex === index ? value : item));
    }

    function removeItem(index) {
        const nextItems = items.filter((_, itemIndex) => itemIndex !== index);
        onChange(nextItems.length > 0 ? nextItems : ['']);
    }

    function addItem() {
        onChange([...items, '']);
    }

    return (
        <div className="quotation-card">
            <div className="quotation-card-toolbar">
                <div className="quotation-card-heading">{title}</div>
                <button type="button" className="quotation-btn quotation-btn-primary" onClick={addItem}>+ Add Line</button>
            </div>
            <div className="quotation-list-editor">
                {items.map((item, index) => (
                    <div key={`${title}-${index}`} className="quotation-list-editor-row">
                        <span className="quotation-list-editor-index">{index + 1}</span>
                        <textarea
                            className="quotation-input quotation-textarea"
                            rows={2}
                            value={item}
                            onChange={(event) => updateItem(index, event.target.value)}
                        />
                        <button type="button" className="quotation-btn quotation-btn-danger" onClick={() => removeItem(index)}>Remove</button>
                    </div>
                ))}
            </div>
        </div>
    );
}

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
            if (!grouped.has(category)) {
                grouped.set(category, []);
            }
            grouped.get(category).push(reference);
        });
    return Array.from(grouped.entries());
}

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

    return (
        <div className="quotation-editor-screen">
            <div className="quotation-brand-card">
                <div className="quotation-brand-block">
                    <img src={companyProfile.logoPath} alt={companyProfile.legalName} className="quotation-brand-logo" />
                    <div className="quotation-brand-copy">
                        <strong>{companyProfile.legalName}</strong>
                        {companyProfile.addressLines.map((line) => <span key={line}>{line}</span>)}
                    </div>
                </div>
                <div className="quotation-brand-meta">
                    <div className="quotation-brand-title">Quotation</div>
                    {companyProfile.contactLines.map((line) => <span key={line}>{line}</span>)}
                    <span>{companyProfile.vatNumber}</span>
                </div>
            </div>

            <div className="quotation-screen-header">
                <div>
                    <h1>{form.id ? 'Edit Quotation' : 'New Quotation'}</h1>
                    <p>Use section selling notes to convert internal subtotal into customer-facing selling totals.</p>
                </div>
                <div className="quotation-screen-tools">
                    <label className="quotation-toggle">
                        <input type="checkbox" checked={showManagement} onChange={(event) => onToggleManagement(event.target.checked)} />
                        <span>Show Management Columns</span>
                    </label>
                    <button type="button" className="quotation-btn quotation-btn-ghost" onClick={onBack}>Back</button>
                </div>
            </div>

            <div className="quotation-card">
                <div className="quotation-card-heading">Quotation Info</div>
                <div className="quotation-form-grid quotation-form-grid-3">
                    <div className="quotation-field">
                        <label>QT Number</label>
                        <div className="quotation-key-value">QT-{form.qt_number || 'Pending'}</div>
                    </div>
                    <div className="quotation-field">
                        <label>Date *</label>
                        <input className="quotation-input" value={form.date} onChange={(event) => onFieldChange('date', event.target.value)} />
                    </div>
                    <div className="quotation-field">
                        <label>Reference</label>
                        <input className="quotation-input" value={form.ref} onChange={(event) => onFieldChange('ref', event.target.value)} />
                    </div>
                </div>
                <div className="quotation-form-grid quotation-form-grid-4">
                    <div className="quotation-field quotation-span-2">
                        <label>Project Title *</label>
                        <input className="quotation-input" placeholder="e.g. SAFESURF BOOTH FOR YOUTH CITY" value={form.project_title} onChange={(event) => onFieldChange('project_title', event.target.value.toUpperCase())} />
                    </div>
                    <div className="quotation-field">
                        <label>Created By *</label>
                        <input className="quotation-input" placeholder="Your name" value={form.created_by} onChange={(event) => onFieldChange('created_by', event.target.value)} />
                    </div>
                    <div className="quotation-field">
                        <label>Status</label>
                        <select className="quotation-input" value={form.status} onChange={(event) => onFieldChange('status', event.target.value)}>
                            {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            <div className="quotation-card">
                <div className="quotation-card-heading">Client Information</div>
                <div className="quotation-form-grid quotation-form-grid-3">
                    <div className="quotation-field">
                        <label>To (Attention / Role)</label>
                        <input className="quotation-input" placeholder="e.g. Procurement" value={form.client_to} onChange={(event) => onFieldChange('client_to', event.target.value)} />
                    </div>
                    <div className="quotation-field">
                        <label>Organisation *</label>
                        <input className="quotation-input" placeholder="e.g. Ministry of Municipalities" value={form.client_org} onChange={(event) => onFieldChange('client_org', event.target.value)} />
                    </div>
                    <div className="quotation-field">
                        <label>Location</label>
                        <input className="quotation-input" placeholder="e.g. Kingdom of Bahrain" value={form.client_location} onChange={(event) => onFieldChange('client_location', event.target.value)} />
                    </div>
                </div>
            </div>

            <div className="quotation-card">
                <div className="quotation-card-heading">Event Details</div>
                <div className="quotation-form-grid quotation-form-grid-3">
                    <div className="quotation-field">
                        <label>Event Name</label>
                        <input className="quotation-input" placeholder="e.g. YOUTH CITY" value={form.event_name} onChange={(event) => onFieldChange('event_name', event.target.value)} />
                    </div>
                    <div className="quotation-field">
                        <label>Venue</label>
                        <input className="quotation-input" placeholder="e.g. EWB" value={form.venue} onChange={(event) => onFieldChange('venue', event.target.value)} />
                    </div>
                    <div className="quotation-field">
                        <label>Event Date</label>
                        <input className="quotation-input" placeholder="e.g. April 28th - May 2nd" value={form.event_date} onChange={(event) => onFieldChange('event_date', event.target.value)} />
                    </div>
                </div>
            </div>

            <div className="quotation-card">
                <div className="quotation-card-toolbar">
                    <div>
                        <div className="quotation-card-heading">Scope of Works</div>
                        <p className="quotation-card-subheading">Selling note is chosen per section. Furniture references default to no selling uplift.</p>
                    </div>
                    <div className="quotation-card-toolbar-actions">
                        <button type="button" className="quotation-btn quotation-btn-primary" onClick={onAddSection}>+ Add Section</button>
                    </div>
                </div>

                <div className="quotation-scope-stack">
                    {form.sections.map((section, sectionIndex) => {
                        const sectionTotals = getSectionTotals(section);
                        return (
                            <div key={`section-${sectionIndex}`} className="quotation-scope-section">
                                <div className="quotation-scope-section-header">
                                    <div className="quotation-scope-section-title">
                                        <span className="quotation-scope-badge">{String.fromCharCode(65 + sectionIndex)}</span>
                                        <input
                                            className="quotation-input quotation-section-name"
                                            placeholder="SECTION NAME (e.g. PLATFORM)"
                                            value={section.name}
                                            onChange={(event) => onSectionChange(sectionIndex, (current) => ({ ...current, name: event.target.value.toUpperCase() }))}
                                        />
                                    </div>
                                    <div className="quotation-scope-section-tools">
                                        {showManagement && (
                                            <label className="quotation-inline-input quotation-inline-input-compact">
                                                <span>Selling %</span>
                                                <select
                                                    className="quotation-input quotation-input-small"
                                                    value={section.selling_rule}
                                                    onChange={(event) => onSectionChange(sectionIndex, (current) => ({ ...current, selling_rule: event.target.value }))}
                                                >
                                                    {sellingRuleOptions.map((rule) => (
                                                        <option key={rule.value} value={rule.value}>{rule.label}</option>
                                                    ))}
                                                </select>
                                            </label>
                                        )}
                                        <button type="button" className="quotation-btn quotation-btn-danger" onClick={() => onRemoveSection(sectionIndex)}>Remove</button>
                                    </div>
                                </div>

                                <div className={`quotation-scope-table ${showManagement ? 'management' : 'client'}`}>
                                    <div className="quotation-scope-table-header">No</div>
                                    <div className="quotation-scope-table-header">Scope of Works Description</div>
                                    <div className="quotation-scope-table-header">Qty</div>
                                    <div className="quotation-scope-table-header">Unit</div>
                                    <div className="quotation-scope-table-header">COSTS (BHD)</div>
                                    {showManagement ? <div className="quotation-scope-table-header">Rate</div> : null}
                                    {showManagement ? <div className="quotation-scope-table-header">Cost (auto)</div> : null}
                                    <div className="quotation-scope-table-header">Actions</div>

                                    {section.items.map((item, itemIndex) => {
                                        const lineTotal = Number(item.qty || 0) * Number(item.rate || 0);
                                        return (
                                            <div key={`item-${sectionIndex}-${itemIndex}`} className="quotation-scope-table-row">
                                                <div className="quotation-scope-cell quotation-scope-index">{itemIndex + 1}</div>
                                                <div className="quotation-scope-cell quotation-scope-description">
                                                    <textarea className="quotation-input quotation-textarea quotation-scope-description-input" rows={3} placeholder="Description of work..." value={item.description} onChange={(event) => onItemChange(sectionIndex, itemIndex, 'description', event.target.value)} />
                                                    <div className="quotation-reference-inline">
                                                        <select
                                                            className="quotation-input"
                                                            value={item.price_reference_id || ''}
                                                            onChange={(event) => onApplyReference(sectionIndex, itemIndex, event.target.value)}
                                                        >
                                                            <option value="">Apply price reference</option>
                                                            {groupedPriceReferences.map(([category, references]) => (
                                                                <optgroup key={category} label={category}>
                                                                    {references.map((reference) => (
                                                                        <option key={reference.id} value={reference.id}>
                                                                            {reference.title} - BHD {Number(reference.reference_rate || 0).toFixed(3)} [{reference.default_selling_rule}]
                                                                        </option>
                                                                    ))}
                                                                </optgroup>
                                                            ))}
                                                        </select>
                                                        {item.price_reference_id ? (
                                                            <span className="quotation-reference-chip">
                                                                Linked to reference
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                    {item.image ? (
                                                        <div className="quotation-scope-image-chip">
                                                            <img src={item.image} alt={`Attachment ${itemIndex + 1}`} />
                                                            <button type="button" className="quotation-btn quotation-btn-ghost" onClick={() => onItemChange(sectionIndex, itemIndex, 'image', null)}>Remove Image</button>
                                                        </div>
                                                    ) : null}
                                                </div>
                                                <div className="quotation-scope-cell">
                                                    <input className="quotation-input" type="number" step="0.001" value={item.qty} onChange={(event) => onItemChange(sectionIndex, itemIndex, 'qty', event.target.value)} />
                                                </div>
                                                <div className="quotation-scope-cell">
                                                    <select className="quotation-input" value={item.unit} onChange={(event) => onItemChange(sectionIndex, itemIndex, 'unit', event.target.value)}>
                                                        {unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                                                    </select>
                                                </div>
                                                <div className="quotation-scope-cell">
                                                    <input className="quotation-input" type="number" step="0.001" value={item.costs_bhd} onChange={(event) => onItemChange(sectionIndex, itemIndex, 'costs_bhd', event.target.value)} />
                                                </div>
                                                {showManagement ? (
                                                    <div className="quotation-scope-cell">
                                                        <input className="quotation-input quotation-management-input" type="number" step="0.001" value={item.rate} onChange={(event) => onItemChange(sectionIndex, itemIndex, 'rate', event.target.value)} />
                                                    </div>
                                                ) : null}
                                                {showManagement ? <div className="quotation-scope-cell quotation-scope-auto">BHD {formatMoney(lineTotal)}</div> : null}
                                                <div className="quotation-scope-cell quotation-scope-actions">
                                                    <input className="quotation-hidden-file" id={`scope-file-${sectionIndex}-${itemIndex}`} type="file" accept="image/*" onChange={(event) => onAttachImage(sectionIndex, itemIndex, event.target.files?.[0])} />
                                                    <label htmlFor={`scope-file-${sectionIndex}-${itemIndex}`} className="quotation-btn quotation-btn-ghost">Attach</label>
                                                    <button type="button" className="quotation-btn quotation-btn-danger" onClick={() => onRemoveItem(sectionIndex, itemIndex)}>Remove</button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="quotation-scope-footer">
                                    <button type="button" className="quotation-btn quotation-btn-primary" onClick={() => onAddItem(sectionIndex)}>+ Add Item</button>
                                    {showManagement && (
                                        <div className="quotation-scope-summary">
                                            <div className="quotation-scope-total-block">
                                                <span>Sub-Total</span>
                                                <strong>BHD {formatMoney(sectionTotals.internal)}</strong>
                                            </div>
                                            <div className="quotation-scope-total-divider" />
                                            <div className="quotation-scope-total-block quotation-scope-total-selling">
                                                <span>Selling ({sellingRuleLabel(section.selling_rule)})</span>
                                                <strong>BHD {formatMoney(sectionTotals.client)}</strong>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="quotation-card quotation-card-compact">
                <div className="quotation-card-compact-row">
                    <label className="quotation-inline-input">
                        <span>VAT %</span>
                        <input className="quotation-input quotation-input-small" type="number" step="0.1" value={form.vat_percent} onChange={(event) => onFieldChange('vat_percent', Number(event.target.value || 0))} />
                    </label>
                    <p>Exclusions, terms, and payment terms are editable below and included in the exports.</p>
                </div>
            </div>

            <EditableBlock title="Exclusions" items={form.exclusions} onChange={(nextValue) => onListChange('exclusions', nextValue)} />
            <EditableBlock title="Terms & Conditions of Contract" items={form.terms} onChange={(nextValue) => onListChange('terms', nextValue)} />
            <EditableBlock title="Payment Terms" items={form.payment_terms} onChange={(nextValue) => onListChange('payment_terms', nextValue)} />

            <div className="quotation-card">
                <div className="quotation-card-heading">Internal Notes</div>
                <div className="quotation-field">
                    <textarea className="quotation-input quotation-textarea quotation-notes" rows={4} placeholder="Internal notes (not printed on quotation)..." value={form.notes} onChange={(event) => onFieldChange('notes', event.target.value)} />
                </div>
            </div>

            <div className="quotation-bottom-bar">
                <div className="quotation-bottom-metrics">
                    <div className="quotation-bottom-metric"><span>Total Cost</span><strong>BHD {formatMoney(totals.client)}</strong></div>
                    <div className="quotation-bottom-metric"><span>VAT {form.vat_percent}%</span><strong>BHD {formatMoney(totals.vat)}</strong></div>
                    <div className="quotation-bottom-metric"><span>Total Cost Inc. VAT</span><strong>BHD {formatMoney(totals.grand)}</strong></div>
                    <div className="quotation-bottom-metric quotation-bottom-metric-words"><span>In Words</span><strong>{numberToWords ? numberToWords(totals.grand) : ''}</strong></div>
                </div>
                <div className="quotation-bottom-actions">
                    <button type="button" className="quotation-btn quotation-btn-save-draft" onClick={onSaveDraft} disabled={saving}>
                        {saving ? 'Saving…' : 'Save Draft'}
                    </button>
                    <button type="button" className="quotation-btn quotation-btn-save-confirm" onClick={onSaveConfirmed} disabled={saving}>
                        {saving ? 'Saving…' : 'Save Quotation'}
                    </button>
                </div>
            </div>

            <div className="quotation-editor-utilities">
                <div className="quotation-utilities-group">
                    <span className="quotation-utilities-label">Export</span>
                    <button type="button" className="quotation-btn quotation-btn-ghost" onClick={onExportCustomerPdf} disabled={!form.id} title={!form.id ? 'Save the quotation first' : 'Download customer PDF'}>
                        ↓ Customer PDF
                    </button>
                    <button type="button" className="quotation-btn quotation-btn-ghost" onClick={onExportManagementPdf} disabled={!form.id} title={!form.id ? 'Save the quotation first' : 'Download management PDF'}>
                        ↓ Management PDF
                    </button>
                </div>
                <div className="quotation-utilities-group">
                    <button type="button" className="quotation-btn quotation-btn-primary" onClick={onDuplicate} disabled={!form.id} title={!form.id ? 'Save the quotation first' : 'Duplicate this quotation'}>
                        + Duplicate
                    </button>
                    <button type="button" className="quotation-btn quotation-btn-danger" onClick={onDelete} disabled={!form.id} title={!form.id ? 'Save the quotation first' : 'Delete this quotation'}>
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}
