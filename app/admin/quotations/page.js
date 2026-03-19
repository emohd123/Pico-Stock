'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import QuotationDashboardTable from '@/components/quotations/QuotationDashboardTable';
import PriceReferenceManager from '@/components/quotations/PriceReferenceManager';
import QuoteEditor from '@/components/quotations/QuoteEditor';
import {
    defaultCommercialLists,
    getSectionCommercialSummary,
    QUOTATION_COMPANY_PROFILE,
    SELLING_RULE_OPTIONS,
} from '@/lib/quotationCommercial';

const STATUS_OPTIONS = ['Draft', 'Confirmed', 'Cancelled'];
const UNIT_OPTIONS = ['nos', 'sqm', 'lm', 'rm', 'sets', 'l.s.', 'lot', 'kg', 'hrs', 'days'];

let quotationMessageTimer = null;

function todayString() {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
}

function buildReference(dateValue, quoteNumber) {
    const parts = String(dateValue || todayString()).split('.');
    const month = parts[1] || String(new Date().getMonth() + 1).padStart(2, '0');
    const year = parts[2] || String(new Date().getFullYear());
    return `Q/${year}/${month}/${quoteNumber || '--'}`;
}

function createItem() {
    return { description: '', image: null, qty: '', unit: 'nos', costs_bhd: '', rate: '', price_reference_id: '' };
}

function createSection() {
    return { name: '', selling_rule: '0.70', section_selling: 0, items: [createItem()] };
}

function createDraft(quoteNumber) {
    const date = todayString();
    const defaults = defaultCommercialLists();

    return {
        id: null,
        qt_number: quoteNumber,
        date,
        ref: buildReference(date, quoteNumber),
        project_title: '',
        client_to: '',
        client_org: '',
        client_location: '',
        event_name: '',
        venue: '',
        event_date: '',
        created_by: '',
        status: 'Draft',
        notes: '',
        sections: [createSection()],
        exclusions: defaults.exclusions,
        terms: defaults.terms,
        payment_terms: defaults.payment_terms,
        vat_percent: 10,
    };
}

function normalizeQuote(raw) {
    const defaults = defaultCommercialLists();
    return {
        ...createDraft(raw?.qt_number ?? null),
        ...raw,
        sections: Array.isArray(raw?.sections) && raw.sections.length > 0
            ? raw.sections.map((section) => ({
                name: section?.name || '',
                selling_rule: section?.selling_rule || '0.70',
                section_selling: Number(section?.section_selling || 0),
                items: Array.isArray(section?.items) && section.items.length > 0
                    ? section.items.map((item) => ({
                        description: item?.description || '',
                        image: item?.image || null,
                        qty: item?.qty ?? '',
                        unit: item?.unit || 'nos',
                        costs_bhd: item?.costs_bhd ?? '',
                        rate: item?.rate ?? '',
                        price_reference_id: item?.price_reference_id || '',
                    }))
                    : [createItem()],
            }))
            : [createSection()],
        exclusions: Array.isArray(raw?.exclusions) && raw.exclusions.length > 0 ? raw.exclusions : defaults.exclusions,
        terms: Array.isArray(raw?.terms) && raw.terms.length > 0 ? raw.terms : defaults.terms,
        payment_terms: Array.isArray(raw?.payment_terms) && raw.payment_terms.length > 0 ? raw.payment_terms : defaults.payment_terms,
        vat_percent: Number(raw?.vat_percent ?? 10),
        ref: raw?.ref || buildReference(raw?.date, raw?.qt_number),
    };
}

function formatMoney(value) {
    return Number(value || 0).toFixed(3);
}

function sectionTotals(section) {
    const summary = getSectionCommercialSummary(section);
    return {
        internal: summary.internalSubtotal,
        client: summary.internalSubtotal > 0 ? summary.suggestedSelling : (Number(section.section_selling || 0) > 0 ? Number(section.section_selling || 0) : summary.clientLineTotal),
        suggested: summary.suggestedSelling,
    };
}

function quoteTotals(form) {
    const summaries = (form.sections || []).map(sectionTotals);
    const internal = summaries.reduce((sum, summary) => sum + summary.internal, 0);
    const client = summaries.reduce((sum, summary) => sum + summary.client, 0);
    const vat = client * (Number(form.vat_percent || 0) / 100);
    const grand = client + vat;
    const margin = client > 0 ? ((client - internal) / client) * 100 : 0;
    return { internal, client, vat, grand, margin };
}

async function toDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export default function QuotationsAdminPage() {
    const router = useRouter();
    const [quotes, setQuotes] = useState([]);
    const [priceReferences, setPriceReferences] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [referenceSaving, setReferenceSaving] = useState(false);
    const [viewMode, setViewMode] = useState('editor');
    const [showManagement, setShowManagement] = useState(true);
    const [showReferenceManager, setShowReferenceManager] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [referenceSearch, setReferenceSearch] = useState('');
    const [selectedId, setSelectedId] = useState(null);
    const [form, setForm] = useState(createDraft(null));
    const [message, setMessage] = useState({ type: '', text: '' });

    const priceReferenceMap = useMemo(() => {
        return priceReferences.reduce((map, reference) => {
            map[reference.id] = reference;
            return map;
        }, {});
    }, [priceReferences]);

    function flash(type, text) {
        setMessage({ type, text });
        window.clearTimeout(quotationMessageTimer);
        quotationMessageTimer = window.setTimeout(() => setMessage({ type: '', text: '' }), 3200);
    }

    async function fetchNextDraftNumber() {
        const response = await fetch('/api/quotations/next-number', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not prepare a draft');
        return data.qt_number;
    }

    async function loadPriceReferences() {
        const response = await fetch('/api/price-references', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load price references');
        setPriceReferences(Array.isArray(data) ? data : []);
    }

    async function openQuote(id, switchView = true) {
        try {
            const response = await fetch(`/api/quotations/${id}`, { cache: 'no-store' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to load quotation');
            setSelectedId(data.id);
            setForm(normalizeQuote(data));
            if (switchView) setViewMode('editor');
        } catch (error) {
            flash('error', error.message || 'Failed to open quotation');
        }
    }

    async function loadQuotes(nextSelectedId = selectedId) {
        setLoading(true);
        try {
            const [quoteResponse, referenceResponse] = await Promise.all([
                fetch('/api/quotations', { cache: 'no-store' }),
                fetch('/api/price-references', { cache: 'no-store' }),
            ]);
            const quoteData = await quoteResponse.json();
            const referenceData = await referenceResponse.json();

            if (!quoteResponse.ok) throw new Error(quoteData.error || 'Failed to load quotations');
            if (!referenceResponse.ok) throw new Error(referenceData.error || 'Failed to load price references');

            const nextQuotes = Array.isArray(quoteData) ? quoteData : [];
            setQuotes(nextQuotes);
            setPriceReferences(Array.isArray(referenceData) ? referenceData : []);

            if (nextSelectedId && nextQuotes.some((quote) => String(quote.id) === String(nextSelectedId))) {
                await openQuote(nextSelectedId, false);
            } else if (nextQuotes[0]) {
                setSelectedId(nextQuotes[0].id);
                setForm(normalizeQuote(nextQuotes[0]));
            } else {
                const nextNumber = await fetchNextDraftNumber();
                setSelectedId(null);
                setForm(createDraft(nextNumber));
            }
        } catch (error) {
            flash('error', error.message || 'Failed to load quotations');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        const isAdmin = sessionStorage.getItem('pico-admin');
        if (!isAdmin) {
            router.push('/admin/login');
            return;
        }

        let cancelled = false;

        async function bootstrap() {
            try {
                const [quoteResponse, referenceResponse] = await Promise.all([
                    fetch('/api/quotations', { cache: 'no-store' }),
                    fetch('/api/price-references', { cache: 'no-store' }),
                ]);
                const quoteData = await quoteResponse.json();
                const referenceData = await referenceResponse.json();

                if (!quoteResponse.ok) throw new Error(quoteData.error || 'Failed to load quotations');
                if (!referenceResponse.ok) throw new Error(referenceData.error || 'Failed to load price references');
                if (cancelled) return;

                const nextQuotes = Array.isArray(quoteData) ? quoteData : [];
                setQuotes(nextQuotes);
                setPriceReferences(Array.isArray(referenceData) ? referenceData : []);

                if (nextQuotes[0]) {
                    setSelectedId(nextQuotes[0].id);
                    setForm(normalizeQuote(nextQuotes[0]));
                } else {
                    const nextNumber = await fetchNextDraftNumber();
                    if (cancelled) return;
                    setSelectedId(null);
                    setForm(createDraft(nextNumber));
                }
            } catch (error) {
                if (!cancelled) flash('error', error.message || 'Failed to load quotations');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        bootstrap();

        return () => {
            cancelled = true;
        };
    }, [router]);

    async function startNewQuote() {
        try {
            const nextNumber = await fetchNextDraftNumber();
            setSelectedId(null);
            setForm(createDraft(nextNumber));
            setViewMode('editor');
        } catch (error) {
            flash('error', error.message || 'Could not prepare a draft');
        }
    }

    function setField(field, value) {
        setForm((current) => {
            const next = { ...current, [field]: value };
            if (field === 'date') next.ref = buildReference(value, current.qt_number);
            return next;
        });
    }

    function setListField(field, value) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    function updateSection(sectionIndex, updater) {
        setForm((current) => ({
            ...current,
            sections: current.sections.map((section, index) => index === sectionIndex ? updater(section) : section),
        }));
    }

    function updateItem(sectionIndex, itemIndex, field, value) {
        updateSection(sectionIndex, (section) => ({
            ...section,
            items: section.items.map((item, index) => index === itemIndex ? { ...item, [field]: value } : item),
        }));
    }

    function addSection() {
        setForm((current) => ({ ...current, sections: [...current.sections, createSection()] }));
    }

    function removeSection(sectionIndex) {
        setForm((current) => ({
            ...current,
            sections: current.sections.length === 1 ? [createSection()] : current.sections.filter((_, index) => index !== sectionIndex),
        }));
    }

    function addItem(sectionIndex) {
        updateSection(sectionIndex, (section) => ({ ...section, items: [...section.items, createItem()] }));
    }

    function removeItem(sectionIndex, itemIndex) {
        updateSection(sectionIndex, (section) => ({
            ...section,
            items: section.items.length === 1 ? [createItem()] : section.items.filter((_, index) => index !== itemIndex),
        }));
    }

    async function attachImage(sectionIndex, itemIndex, file) {
        if (!file) return;
        if (file.size > 3 * 1024 * 1024) return flash('error', 'Image size must stay under 3MB');
        try {
            const image = await toDataUrl(file);
            updateItem(sectionIndex, itemIndex, 'image', image);
        } catch {
            flash('error', 'Could not read that image');
        }
    }

    function applyReference(sectionIndex, itemIndex, referenceId) {
        const reference = priceReferenceMap[referenceId];
        if (!reference) {
            updateItem(sectionIndex, itemIndex, 'price_reference_id', '');
            return;
        }

        updateSection(sectionIndex, (section) => ({
            ...section,
            selling_rule: section.selling_rule === '0.70' ? reference.default_selling_rule : section.selling_rule,
            items: section.items.map((item, index) => {
                if (index !== itemIndex) return item;
                return {
                    ...item,
                    description: reference.title,
                    unit: reference.unit || item.unit,
                    costs_bhd: reference.reference_rate,
                    rate: reference.reference_rate,
                    price_reference_id: reference.id,
                };
            }),
        }));
    }

    async function saveQuote(nextStatus) {
        if (!form.project_title.trim()) return flash('error', 'Project title is required');
        if (!form.created_by.trim()) return flash('error', 'Created by is required');

        const normalizedSections = form.sections.map((section) => ({
            ...section,
            section_selling: sectionTotals(section).client,
        }));
        const totals = quoteTotals({ ...form, sections: normalizedSections });
        setSaving(true);
        try {
            const response = await fetch(form.id ? `/api/quotations/${form.id}` : '/api/quotations', {
                method: form.id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    sections: normalizedSections,
                    status: nextStatus || form.status,
                    total_selling: totals.client,
                    total_with_vat: totals.grand,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to save quotation');
            setSelectedId(data.id);
            setForm(normalizeQuote(data));
            await loadQuotes(data.id);
            setViewMode('editor');
            flash('success', `Quotation QT-${data.qt_number} saved`);
        } catch (error) {
            flash('error', error.message || 'Failed to save quotation');
        } finally {
            setSaving(false);
        }
    }

    async function duplicateQuote(id = form.id) {
        if (!id) return;
        try {
            const response = await fetch(`/api/quotations/${id}/duplicate`, { method: 'POST' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to duplicate quotation');
            await loadQuotes(data.id);
            setViewMode('editor');
            flash('success', `Duplicated into QT-${data.qt_number}`);
        } catch (error) {
            flash('error', error.message || 'Failed to duplicate quotation');
        }
    }

    async function deleteQuote(id = form.id) {
        if (!id) return;
        const target = quotes.find((quote) => String(quote.id) === String(id));
        if (!window.confirm(`Delete ${target?.project_title || `QT-${target?.qt_number || ''}`}?`)) return;
        try {
            const response = await fetch(`/api/quotations/${id}`, { method: 'DELETE' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to delete quotation');
            await loadQuotes();
            setViewMode('dashboard');
            flash('success', 'Quotation deleted');
        } catch (error) {
            flash('error', error.message || 'Failed to delete quotation');
        }
    }

    async function savePriceReference(referenceId, payload) {
        setReferenceSaving(true);
        try {
            const response = await fetch(referenceId ? `/api/price-references/${referenceId}` : '/api/price-references', {
                method: referenceId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to save price reference');
            await loadPriceReferences();
            flash('success', referenceId ? 'Price reference updated' : 'Price reference created');
        } catch (error) {
            flash('error', error.message || 'Failed to save price reference');
        } finally {
            setReferenceSaving(false);
        }
    }

    async function deletePriceReference(referenceId) {
        if (!window.confirm('Delete this price reference?')) return;
        setReferenceSaving(true);
        try {
            const response = await fetch(`/api/price-references/${referenceId}`, { method: 'DELETE' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to delete price reference');
            await loadPriceReferences();
            flash('success', 'Price reference deleted');
        } catch (error) {
            flash('error', error.message || 'Failed to delete price reference');
        } finally {
            setReferenceSaving(false);
        }
    }

    function exportQuotePdf(id = form.id, mode = 'customer') {
        if (!id) return;
        window.open(`/api/quotations/${id}/export/pdf?mode=${mode}`, '_blank', 'noopener,noreferrer');
    }

    function exportQuoteExcel(id = form.id) {
        if (!id) return;
        window.open(`/api/quotations/${id}/export/excel`, '_blank', 'noopener,noreferrer');
    }

    function getReferenceSummary(quote) {
        const ids = [...new Set((quote.sections || [])
            .flatMap((section) => section.items || [])
            .map((item) => item.price_reference_id)
            .filter(Boolean))];

        if (ids.length === 0) {
            return '--';
        }

        const labels = ids
            .map((id) => priceReferenceMap[id]?.title || id)
            .slice(0, 2);

        return `${labels.join(', ')}${ids.length > 2 ? ` +${ids.length - 2}` : ''}`;
    }

    const filteredQuotes = quotes.filter((quote) => {
        const needle = search.trim().toLowerCase();
        const matchesSearch = !needle || [
            quote.project_title,
            quote.client_org,
            quote.client_to,
            quote.created_by,
            quote.ref,
            getReferenceSummary(quote),
            String(quote.qt_number || ''),
        ].some((value) => String(value || '').toLowerCase().includes(needle));
        const matchesStatus = !statusFilter || quote.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const filteredPriceReferences = priceReferences.filter((reference) => {
        const needle = referenceSearch.trim().toLowerCase();
        if (!needle) return true;
        return [reference.title, reference.category, reference.notes, reference.unit]
            .some((value) => String(value || '').toLowerCase().includes(needle));
    });

    const totals = quoteTotals(form);
    const stats = {
        total: quotes.length,
        confirmed: quotes.filter((quote) => quote.status === 'Confirmed').length,
        drafts: quotes.filter((quote) => quote.status === 'Draft').length,
        pipeline: quotes.reduce((sum, quote) => sum + Number(quote.total_with_vat || 0), 0),
    };

    if (loading) {
        return <div className="loading-page"><div className="spinner"></div></div>;
    }

    return (
        <div className="quotation-page-shell">
            <header className="quotation-topbar">
                <div className="quotation-topbar-brand">
                    <img src={QUOTATION_COMPANY_PROFILE.logoPath} alt={QUOTATION_COMPANY_PROFILE.legalName} className="quotation-topbar-logo" />
                    <div>
                        <div className="quotation-topbar-title">Quotation System</div>
                        <div className="quotation-topbar-subtitle">Pico International (Bahrain)</div>
                    </div>
                </div>
                <div className="quotation-topbar-actions">
                    <button type="button" className={`quotation-btn ${viewMode === 'dashboard' ? 'quotation-btn-inverse' : 'quotation-btn-topbar'}`} onClick={() => setViewMode('dashboard')}>Dashboard</button>
                    <button type="button" className="quotation-btn quotation-btn-outline-light" onClick={startNewQuote}>+ New Quotation</button>
                </div>
            </header>

            <main className="quotation-page-main">
                {message.text ? <div className={`alert alert-${message.type}`} style={{ marginBottom: '1rem' }}>{message.text}</div> : null}

                {viewMode === 'dashboard' ? (
                    <div className="quotation-dashboard-screen">
                        <div className="quotation-screen-header">
                            <div>
                                <h1>Quotation Dashboard</h1>
                                <p>Search, filter, export, reopen quotes, and manage reusable price references from one place.</p>
                            </div>
                            <div className="quotation-dashboard-toolbar">
                                <input className="quotation-input" type="search" placeholder="Search by QT, project, client, owner, or references" value={search} onChange={(event) => setSearch(event.target.value)} />
                                <select className="quotation-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                                    <option value="">All statuses</option>
                                    {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                                </select>
                                <button type="button" className="quotation-btn quotation-btn-primary" onClick={() => setShowReferenceManager(true)}>
                                    Price References
                                </button>
                            </div>
                        </div>

                        <div className="quotation-dashboard-stats">
                            <div className="quotation-dashboard-stat"><span>Total Quotations</span><strong>{stats.total}</strong></div>
                            <div className="quotation-dashboard-stat"><span>Confirmed</span><strong>{stats.confirmed}</strong></div>
                            <div className="quotation-dashboard-stat"><span>Drafts</span><strong>{stats.drafts}</strong></div>
                            <div className="quotation-dashboard-stat"><span>Pipeline Value</span><strong>BHD {formatMoney(stats.pipeline)}</strong></div>
                        </div>

                        <div className="quotation-card">
                            <QuotationDashboardTable
                                quotes={filteredQuotes}
                                onOpen={openQuote}
                                onDuplicate={duplicateQuote}
                                onDelete={deleteQuote}
                                onExportPdf={exportQuotePdf}
                                onExportExcel={exportQuoteExcel}
                                formatMoney={formatMoney}
                                getReferenceSummary={getReferenceSummary}
                            />
                        </div>
                    </div>
                ) : (
                    <QuoteEditor
                        form={form}
                        saving={saving}
                        totals={totals}
                        showManagement={showManagement}
                        statusOptions={STATUS_OPTIONS}
                        unitOptions={UNIT_OPTIONS}
                        sellingRuleOptions={SELLING_RULE_OPTIONS}
                        companyProfile={QUOTATION_COMPANY_PROFILE}
                        priceReferences={priceReferences}
                        onBack={() => setViewMode('dashboard')}
                        onToggleManagement={setShowManagement}
                        onFieldChange={setField}
                        onListChange={setListField}
                        onSectionChange={updateSection}
                        onItemChange={updateItem}
                        onAddSection={addSection}
                        onRemoveSection={removeSection}
                        onAddItem={addItem}
                        onRemoveItem={removeItem}
                        onAttachImage={attachImage}
                        onApplyReference={applyReference}
                        onSaveDraft={() => saveQuote('Draft')}
                        onSaveConfirmed={() => saveQuote('Confirmed')}
                        onExportCustomerPdf={() => exportQuotePdf(form.id, 'customer')}
                        onExportManagementPdf={() => exportQuotePdf(form.id, 'management')}
                        onExportExcel={() => exportQuoteExcel(form.id)}
                        onDuplicate={() => duplicateQuote(form.id)}
                        onDelete={() => deleteQuote(form.id)}
                        formatMoney={formatMoney}
                        getSectionTotals={sectionTotals}
                    />
                )}
            </main>

            {showReferenceManager ? (
                <div className="modal-overlay" onClick={() => setShowReferenceManager(false)}>
                    <div className="modal-box quotation-reference-modal" onClick={(event) => event.stopPropagation()}>
                        <button type="button" className="modal-close" onClick={() => setShowReferenceManager(false)} aria-label="Close price reference manager">
                            ×
                        </button>
                        <div className="modal-body">
                            <PriceReferenceManager
                                references={filteredPriceReferences}
                                search={referenceSearch}
                                saving={referenceSaving}
                                onSearchChange={setReferenceSearch}
                                onSave={savePriceReference}
                                onDelete={deletePriceReference}
                            />
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
