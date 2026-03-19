'use client';

import { useEffect, useMemo, useState } from 'react';

const DEFAULT_FORM = {
    title: '',
    unit: 'item',
    reference_rate: '',
    min_rate: '',
    max_rate: '',
    category: '',
    default_selling_rule: '0.70',
    source: 'Manual',
    notes: '',
};

function byCategoryThenTitle(left, right) {
    const categoryCompare = String(left.category || 'General').localeCompare(String(right.category || 'General'));
    if (categoryCompare !== 0) return categoryCompare;
    return String(left.title || '').localeCompare(String(right.title || ''));
}

export default function PriceReferenceManager({
    references,
    search,
    saving,
    onSearchChange,
    onSave,
    onDelete,
}) {
    const [editingId, setEditingId] = useState(null);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [form, setForm] = useState(DEFAULT_FORM);

    const categories = useMemo(() => {
        return [...new Set(references.map((item) => item.category || 'General'))].sort((left, right) => left.localeCompare(right));
    }, [references]);

    const groupedReferences = useMemo(() => {
        const grouped = new Map();
        references
            .slice()
            .sort(byCategoryThenTitle)
            .forEach((reference) => {
                const category = reference.category || 'General';
                if (selectedCategory !== 'all' && selectedCategory !== category) {
                    return;
                }

                if (!grouped.has(category)) {
                    grouped.set(category, []);
                }

                grouped.get(category).push(reference);
            });
        return Array.from(grouped.entries());
    }, [references, selectedCategory]);

    useEffect(() => {
        if (!editingId) {
            setForm(DEFAULT_FORM);
            return;
        }

        const reference = references.find((item) => item.id === editingId);
        if (!reference) {
            setEditingId(null);
            setForm(DEFAULT_FORM);
            return;
        }

        setForm({
            title: reference.title || '',
            unit: reference.unit || 'item',
            reference_rate: reference.reference_rate ?? '',
            min_rate: reference.min_rate ?? '',
            max_rate: reference.max_rate ?? '',
            category: reference.category || '',
            default_selling_rule: reference.default_selling_rule || '0.70',
            source: reference.source || 'Manual',
            notes: reference.notes || '',
        });
    }, [editingId, references]);

    async function handleSubmit(event) {
        event.preventDefault();
        await onSave(editingId, {
            ...form,
            reference_rate: Number(form.reference_rate || 0),
            min_rate: form.min_rate === '' ? null : Number(form.min_rate || 0),
            max_rate: form.max_rate === '' ? null : Number(form.max_rate || 0),
        });
        setEditingId(null);
        setForm(DEFAULT_FORM);
    }

    return (
        <div className="quotation-card quotation-reference-manager-card">
            <div className="quotation-card-toolbar">
                <div>
                    <div className="quotation-card-heading">Price Reference Manager</div>
                    <p className="quotation-card-subheading">Browse, search, and edit reusable pricing references grouped by category.</p>
                </div>
                <div className="quotation-reference-toolbar">
                    <input
                        className="quotation-input"
                        type="search"
                        placeholder="Search by title, category, source, notes, or product id"
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                    />
                    <select
                        className="quotation-input"
                        value={selectedCategory}
                        onChange={(event) => setSelectedCategory(event.target.value)}
                    >
                        <option value="all">All categories</option>
                        {categories.map((category) => (
                            <option key={category} value={category}>{category}</option>
                        ))}
                    </select>
                </div>
            </div>

            <form className="quotation-reference-form" onSubmit={handleSubmit}>
                <input
                    className="quotation-input"
                    placeholder="Reference title"
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    required
                />
                <input
                    className="quotation-input"
                    placeholder="Category / tag"
                    value={form.category}
                    onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                />
                <input
                    className="quotation-input"
                    placeholder="Unit"
                    value={form.unit}
                    onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))}
                />
                <input
                    className="quotation-input"
                    type="number"
                    step="0.001"
                    placeholder="Reference rate"
                    value={form.reference_rate}
                    onChange={(event) => setForm((current) => ({ ...current, reference_rate: event.target.value }))}
                />
                <input
                    className="quotation-input"
                    type="number"
                    step="0.001"
                    placeholder="Min rate"
                    value={form.min_rate}
                    onChange={(event) => setForm((current) => ({ ...current, min_rate: event.target.value }))}
                />
                <input
                    className="quotation-input"
                    type="number"
                    step="0.001"
                    placeholder="Max rate"
                    value={form.max_rate}
                    onChange={(event) => setForm((current) => ({ ...current, max_rate: event.target.value }))}
                />
                <select
                    className="quotation-input"
                    value={form.default_selling_rule}
                    onChange={(event) => setForm((current) => ({ ...current, default_selling_rule: event.target.value }))}
                >
                    <option value="0.70">Selling Note 0.70</option>
                    <option value="0.75">Selling Note 0.75</option>
                    <option value="none">Selling Note None</option>
                </select>
                <input
                    className="quotation-input"
                    placeholder="Source"
                    value={form.source}
                    onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))}
                />
                <input
                    className="quotation-input"
                    placeholder="Notes"
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                />
                <div className="quotation-reference-form-actions">
                    <button type="submit" className="quotation-btn quotation-btn-primary" disabled={saving}>
                        {saving ? 'Saving...' : editingId ? 'Update Reference' : 'Add Reference'}
                    </button>
                    {editingId ? (
                        <button type="button" className="quotation-btn quotation-btn-ghost" onClick={() => setEditingId(null)}>
                            Cancel
                        </button>
                    ) : null}
                </div>
            </form>

            <div className="quotation-reference-groups">
                {groupedReferences.length === 0 ? (
                    <div className="quotation-dashboard-empty">
                        <strong>No price references found</strong>
                        <p>Try another search term or category.</p>
                    </div>
                ) : null}

                {groupedReferences.map(([category, items]) => (
                    <section key={category} className="quotation-reference-group">
                        <div className="quotation-reference-group-header">
                            <strong>{category}</strong>
                            <span>{items.length} item{items.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="quotation-dashboard-table-wrap">
                            <table className="quotation-dashboard-table">
                                <thead>
                                    <tr>
                                        <th>Title</th>
                                        <th>Unit</th>
                                        <th>Rate</th>
                                        <th>Range</th>
                                        <th>Selling Note</th>
                                        <th>Source</th>
                                        <th>Notes</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((reference) => (
                                        <tr key={reference.id}>
                                            <td>{reference.title}</td>
                                            <td>{reference.unit || '--'}</td>
                                            <td>BHD {Number(reference.reference_rate || 0).toFixed(3)}</td>
                                            <td>
                                                {reference.min_rate != null || reference.max_rate != null
                                                    ? `BHD ${Number(reference.min_rate ?? reference.reference_rate ?? 0).toFixed(3)} - ${Number(reference.max_rate ?? reference.reference_rate ?? 0).toFixed(3)}`
                                                    : '--'}
                                            </td>
                                            <td>{reference.default_selling_rule}</td>
                                            <td>{reference.source || '--'}</td>
                                            <td>{reference.notes || '--'}</td>
                                            <td>
                                                <div className="quotation-dashboard-actions">
                                                    <button type="button" className="quotation-btn quotation-btn-ghost" onClick={() => setEditingId(reference.id)}>Edit</button>
                                                    <button type="button" className="quotation-btn quotation-btn-danger" onClick={() => onDelete(reference.id)}>Delete</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}
