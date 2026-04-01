'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import QuotationDashboardTable from '@/components/quotations/QuotationDashboardTable';
import QuotationReports from '@/components/quotations/QuotationReports';
import PriceReferenceManager from '@/components/quotations/PriceReferenceManager';
import QuoteEditor from '@/components/quotations/QuoteEditor';
import {
    DEFAULT_CURRENCY_CODE,
    defaultCommercialLists,
    formatCurrencyAmount,
    getSectionCommercialSummary,
    normalizeCurrencyCode,
    numberToWords,
    QUOTATION_CURRENCIES,
    QUOTATION_COMPANY_PROFILE,
    SELLING_RULE_OPTIONS,
} from '@/lib/quotationCommercial';

const STATUS_OPTIONS = ['Draft', 'Confirmed', 'Cancelled'];
const UNIT_OPTIONS = ['nos', 'sqm', 'lm', 'rm', 'sets', 'l.s.', 'lot', 'kg', 'hrs', 'days', 'pax'];

let quotationMessageTimer = null;

function todayString() {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
}

export function displayDateToInput(dateValue) {
    const parts = String(dateValue || '').split('.');
    if (parts.length !== 3) return '';
    const [day, month, year] = parts;
    if (!day || !month || !year) return '';
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function inputDateToDisplay(dateValue) {
    const parts = String(dateValue || '').split('-');
    if (parts.length !== 3) return '';
    const [year, month, day] = parts;
    if (!day || !month || !year) return '';
    return `${day.padStart(2, '0')}.${month.padStart(2, '0')}.${year}`;
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
        customer_id: '',
        qt_number: quoteNumber,
        source_type: 'manual',
        source_order_id: '',
        source_order_reference: '',
        source_order_customer_email: '',
        email_sent_at: null,
        confirmed_at: null,
        date,
        ref: '',
        currency_code: DEFAULT_CURRENCY_CODE,
        project_title: '',
        client_to: '',
        client_org: '',
        client_location: '',
        client_trn: '',
        event_name: '',
        venue: '',
        event_date: '',
        created_by: '',
        status: 'Draft',
        notes: '',
        sections: [createSection()],
        attachments: [],
        exclusions: defaults.exclusions,
        terms: defaults.terms,
        payment_terms: defaults.payment_terms,
        vat_percent: 10,
        expiry_date: '',
        subject: '',
        company_profile: { ...QUOTATION_COMPANY_PROFILE },
    };
}

function normalizeQuote(raw) {
    const defaults = defaultCommercialLists();
    return {
        ...createDraft(raw?.qt_number ?? null),
        ...raw,
        customer_id: String(raw?.customer_id || ''),
        source_type: String(raw?.source_type || 'manual'),
        source_order_id: String(raw?.source_order_id || ''),
        source_order_reference: String(raw?.source_order_reference || ''),
        source_order_customer_email: String(raw?.source_order_customer_email || ''),
        email_sent_at: raw?.email_sent_at || null,
        confirmed_at: raw?.confirmed_at || null,
        currency_code: normalizeCurrencyCode(raw?.currency_code),
        client_trn: String(raw?.client_trn || ''),
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
        attachments: Array.isArray(raw?.attachments)
            ? raw.attachments.map((attachment) => ({
                id: attachment?.id || `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name: attachment?.name || 'Attachment',
                type: attachment?.type || 'application/octet-stream',
                size: Number(attachment?.size || 0),
                category: attachment?.category === 'download' ? 'download' : 'internal',
                data: attachment?.data || '',
                uploaded_at: attachment?.uploaded_at || new Date().toISOString(),
            }))
            : [],
        exclusions: Array.isArray(raw?.exclusions) && raw.exclusions.length > 0 ? raw.exclusions : defaults.exclusions,
        terms: Array.isArray(raw?.terms) && raw.terms.length > 0 ? raw.terms : defaults.terms,
        payment_terms: Array.isArray(raw?.payment_terms) && raw.payment_terms.length > 0 ? raw.payment_terms : defaults.payment_terms,
        vat_percent: Number(raw?.vat_percent ?? 10),
        ref: raw?.ref || '',
        company_profile: raw?.company_profile || { ...QUOTATION_COMPANY_PROFILE },
        expiry_date: raw?.expiry_date || '',
        subject: raw?.subject || '',
    };
}

function formatMoney(value, currencyCode = DEFAULT_CURRENCY_CODE, options = {}) {
    return formatCurrencyAmount(value, currencyCode, options);
}

function sectionTotals(section) {
    const summary = getSectionCommercialSummary(section);
    const itemCostSubtotal = (section.items || []).reduce((sum, item) => sum + Number(item?.costs_bhd || 0), 0);
    return {
        internal: summary.internalSubtotal,
        client: summary.customerTotal,
        suggested: summary.suggestedSelling,
        itemCustomerTotal: summary.clientLineTotal,
        itemCostSubtotal,
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

function QuotationsAdminPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [quotes, setQuotes] = useState([]);
    const [priceReferences, setPriceReferences] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [signatures, setSignatures] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [referenceSaving, setReferenceSaving] = useState(false);
    const [viewMode, setViewMode] = useState('dashboard');
    const [dashboardTab, setDashboardTab] = useState('overview');
    const [showManagement, setShowManagement] = useState(true);
    const [showReferenceManager, setShowReferenceManager] = useState(false);
    const [showQtNumberEditor, setShowQtNumberEditor] = useState(false);
    const [qtNumberInput, setQtNumberInput] = useState('');
    const [qtNumberSaving, setQtNumberSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [referenceSearch, setReferenceSearch] = useState('');
    const [selectedId, setSelectedId] = useState(null);
    const [form, setForm] = useState(createDraft(null));
    const [quotationHistory, setQuotationHistory] = useState([]);
    const [pendingAiHistoryMeta, setPendingAiHistoryMeta] = useState(null);
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

    function queueAiHistoryMeta(activity_type, activity_summary) {
        setPendingAiHistoryMeta({
            activity_type: String(activity_type || '').trim(),
            activity_summary: String(activity_summary || '').trim(),
        });
    }

    async function fetchNextDraftNumber() {
        const response = await fetch('/api/quotations/next-number', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not prepare a draft');
        return data.qt_number;
    }

    async function openQtNumberEditor() {
        try {
            const nextNumber = await fetchNextDraftNumber();
            setQtNumberInput(String(nextNumber));
            setShowQtNumberEditor(true);
        } catch (error) {
            flash('error', error.message || 'Could not load quotation number');
        }
    }

    async function saveQtNumber() {
        const value = parseInt(qtNumberInput, 10);
        if (!Number.isFinite(value) || value < 1) {
            flash('error', 'Enter a valid positive number');
            return;
        }
        setQtNumberSaving(true);
        try {
            const response = await fetch('/api/quotations/next-number', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ qt_number: value }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to update quotation number');
            setShowQtNumberEditor(false);
            flash('success', `Next quotation number set to ${data.qt_number}`);
        } catch (error) {
            flash('error', error.message || 'Failed to update quotation number');
        } finally {
            setQtNumberSaving(false);
        }
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
            setPendingAiHistoryMeta(null);
            setForm(normalizeQuote(data));
            await loadQuotationHistory(data.id);
            if (switchView) setViewMode('editor');
        } catch (error) {
            flash('error', error.message || 'Failed to open quotation');
        }
    }

    const loadQuotationHistory = useCallback(async (id) => {
        if (!id) {
            setQuotationHistory([]);
            return;
        }
        try {
            const response = await fetch(`/api/quotations/${id}/history`, { cache: 'no-store' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to load quotation history');
            setQuotationHistory(Array.isArray(data) ? data : []);
        } catch (error) {
            setQuotationHistory([]);
            flash('error', error.message || 'Failed to load quotation history');
        }
    }, []);

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
                setPendingAiHistoryMeta(null);
                setForm(normalizeQuote(nextQuotes[0]));
            } else {
                const nextNumber = await fetchNextDraftNumber();
                setSelectedId(null);
                setPendingAiHistoryMeta(null);
                setForm(createDraft(nextNumber));
            }
        } catch (error) {
            flash('error', error.message || 'Failed to load quotations');
        } finally {
            setLoading(false);
        }
    }

    // Deep-link support for opening a quotation directly from the orders admin screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        const requestedTab = searchParams.get('tab');
        const requestedQuote = searchParams.get('quote');

        if (requestedTab && ['overview', 'reports', 'orders'].includes(requestedTab)) {
            setDashboardTab(requestedTab);
        }

        if (requestedQuote) {
            openQuote(requestedQuote, true);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    useEffect(() => {
        let cancelled = false;

        async function bootstrap() {
            try {
                const [quoteResponse, referenceResponse, customerResponse, sigResponse] = await Promise.all([
                    fetch('/api/quotations', { cache: 'no-store' }),
                    fetch('/api/price-references', { cache: 'no-store' }),
                    fetch('/api/customers', { cache: 'no-store' }),
                    fetch('/api/signatures', { cache: 'no-store' }),
                ]);
                const quoteData = await quoteResponse.json();
                const referenceData = await referenceResponse.json();
                const customerData = await customerResponse.json();
                const sigData = await sigResponse.json();

                if (!quoteResponse.ok) throw new Error(quoteData.error || 'Failed to load quotations');
                if (!referenceResponse.ok) throw new Error(referenceData.error || 'Failed to load price references');
                if (cancelled) return;

                const nextQuotes = Array.isArray(quoteData) ? quoteData : [];
                setQuotes(nextQuotes);
                setPriceReferences(Array.isArray(referenceData) ? referenceData : []);
                setCustomers(Array.isArray(customerData) ? customerData : []);
                setSignatures(Array.isArray(sigData) ? sigData : []);

                if (nextQuotes[0]) {
                    setSelectedId(nextQuotes[0].id);
                    setPendingAiHistoryMeta(null);
                    setForm(normalizeQuote(nextQuotes[0]));
                    await loadQuotationHistory(nextQuotes[0].id);
                } else {
                    const nextNumber = await fetchNextDraftNumber();
                    if (cancelled) return;
                    setSelectedId(null);
                    setPendingAiHistoryMeta(null);
                    setForm(createDraft(nextNumber));
                    setQuotationHistory([]);
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
    }, [router, loadQuotationHistory]);

    async function startNewQuote() {
        try {
            const nextNumber = await fetchNextDraftNumber();
            setSelectedId(null);
            setPendingAiHistoryMeta(null);
            setForm(createDraft(nextNumber));
            setQuotationHistory([]);
            setViewMode('editor');
        } catch (error) {
            flash('error', error.message || 'Could not prepare a draft');
        }
    }

    function setField(field, value) {
        setForm((current) => {
            const next = { ...current, [field]: value };
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

    async function attachQuotationFiles(fileList, category = 'internal') {
        const files = Array.from(fileList || []);
        if (files.length === 0) return;
        const oversized = files.find((file) => file.size > 8 * 1024 * 1024);
        if (oversized) {
            return flash('error', `${oversized.name} is too large. Keep files under 8MB each.`);
        }

        try {
            const attachments = await Promise.all(files.map(async (file) => ({
                id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name: file.name,
                type: file.type || 'application/octet-stream',
                size: file.size,
                category,
                data: await toDataUrl(file),
                uploaded_at: new Date().toISOString(),
            })));

            setForm((current) => ({
                ...current,
                attachments: [...(current.attachments || []), ...attachments],
            }));
            flash('success', `${attachments.length} file${attachments.length > 1 ? 's' : ''} attached to quotation`);
        } catch {
            flash('error', 'Could not attach those files');
        }
    }

    function updateQuotationAttachment(attachmentId, field, value) {
        setForm((current) => ({
            ...current,
            attachments: (current.attachments || []).map((attachment) => (
                attachment.id === attachmentId ? { ...attachment, [field]: value } : attachment
            )),
        }));
    }

    function removeQuotationAttachment(attachmentId) {
        setForm((current) => ({
            ...current,
            attachments: (current.attachments || []).filter((attachment) => attachment.id !== attachmentId),
        }));
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

    function applyCustomer(customerId) {
        if (!customerId) {
            setForm((current) => ({
                ...current,
                customer_id: '',
                client_org: '',
                client_to: '',
                client_location: '',
                client_trn: '',
            }));
            return;
        }

        const customer = customers.find((c) => String(c.id) === String(customerId));
        if (!customer) return;
        setForm((current) => ({
            ...current,
            customer_id: String(customer.id),
            client_org: String(customer.display_name || ''),
            client_to: String(customer.contact_to || ''),
            client_location: String(customer.address || ''),
            client_trn: String(customer.trn || ''),
        }));
    }

    async function saveCustomer(payload) {
        try {
            const existing = customers.find((c) => c.display_name.toLowerCase() === String(payload.display_name || '').trim().toLowerCase());
            const response = await fetch(existing ? `/api/customers/${existing.id}` : '/api/customers', {
                method: existing ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to save customer');
            const customerResponse = await fetch('/api/customers', { cache: 'no-store' });
            const customerData = await customerResponse.json();
            setCustomers(Array.isArray(customerData) ? customerData : []);
            flash('success', existing ? 'Customer updated' : 'Customer saved');
            return data;
        } catch (error) {
            flash('error', error.message || 'Failed to save customer');
        }
    }

    async function saveSelectedCustomerDetails() {
        if (!form.customer_id) {
            return flash('error', 'Select a customer first');
        }

        try {
            const response = await fetch(`/api/customers/${form.customer_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    display_name: form.client_org,
                    contact_to: form.client_to,
                    address: form.client_location,
                    trn: form.client_trn,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to update customer');

            const customerResponse = await fetch('/api/customers', { cache: 'no-store' });
            const customerData = await customerResponse.json();
            const nextCustomers = Array.isArray(customerData) ? customerData : [];
            setCustomers(nextCustomers);

            const updatedCustomer = nextCustomers.find((customer) => String(customer.id) === String(form.customer_id));
            if (updatedCustomer) {
                setForm((current) => ({
                    ...current,
                    customer_id: String(updatedCustomer.id),
                    client_org: String(updatedCustomer.display_name || ''),
                    client_to: String(updatedCustomer.contact_to || ''),
                    client_location: String(updatedCustomer.address || ''),
                    client_trn: String(updatedCustomer.trn || ''),
                }));
            }

            flash('success', 'Customer details saved');
        } catch (error) {
            flash('error', error.message || 'Failed to update customer');
        }
    }

    async function deleteCustomers(customerIds = []) {
        const ids = [...new Set((customerIds || []).map((id) => String(id)).filter(Boolean))];
        if (!ids.length) return;
        const selectedCustomerId = String(form.customer_id || '');
        if (selectedCustomerId && ids.includes(selectedCustomerId)) {
            flash('error', 'Switch away from the selected customer before deleting it');
            return;
        }
        if (!window.confirm(`Delete ${ids.length} customer${ids.length > 1 ? 's' : ''}?`)) {
            return;
        }

        try {
            const results = await Promise.all(ids.map(async (id) => {
                const response = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || 'Failed to delete customer');
                }
                return true;
            }));
            if (results.length) {
                const customerResponse = await fetch('/api/customers', { cache: 'no-store' });
                const customerData = await customerResponse.json();
                setCustomers(Array.isArray(customerData) ? customerData : []);
                flash('success', `Deleted ${ids.length} customer${ids.length > 1 ? 's' : ''}`);
            }
        } catch (error) {
            flash('error', error.message || 'Failed to delete customers');
        }
    }

    async function saveSignature(name, signatureImage, stampImage) {
        try {
            const response = await fetch('/api/signatures', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, signature_image: signatureImage, stamp_image: stampImage }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to save signature');
            const sigResponse = await fetch('/api/signatures', { cache: 'no-store' });
            const sigData = await sigResponse.json();
            setSignatures(Array.isArray(sigData) ? sigData : []);
            flash('success', 'Signature / stamp saved');
        } catch (error) {
            flash('error', error.message || 'Failed to save signature');
        }
    }

    function mergeAiDraftIntoForm(current, draftPatch = {}, result = {}) {
        const next = normalizeQuote({
            ...current,
            ...draftPatch,
            client_org: draftPatch.client_org ?? current.client_org,
            project_title: draftPatch.project_title ?? current.project_title,
            subject: draftPatch.subject ?? current.subject,
            exclusions: Array.isArray(draftPatch.exclusions) && draftPatch.exclusions.length ? draftPatch.exclusions : current.exclusions,
            terms: Array.isArray(draftPatch.terms) && draftPatch.terms.length ? draftPatch.terms : current.terms,
            payment_terms: Array.isArray(draftPatch.payment_terms) && draftPatch.payment_terms.length ? draftPatch.payment_terms : current.payment_terms,
            sections: Array.isArray(draftPatch.sections) && draftPatch.sections.length ? draftPatch.sections : current.sections,
            notes: [
                current.notes,
                draftPatch.notes || '',
                Array.isArray(result.assumptions) && result.assumptions.length
                    ? `AI assumptions:\n${result.assumptions.map((item) => `- ${item}`).join('\n')}`
                    : '',
                Array.isArray(result.missing_details) && result.missing_details.length
                    ? `AI follow-up needed:\n${result.missing_details.map((item) => `- ${item}`).join('\n')}`
                    : '',
            ].filter(Boolean).join('\n\n'),
        });
        return next;
    }

    async function generateAiDraft({ brief = '', files = [], mode = 'draft' } = {}) {
        const response = await fetch('/api/quotations/ai/draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quotation: form,
                brief,
                files,
                mode,
            }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to generate AI draft');
        setForm((current) => mergeAiDraftIntoForm(current, data.draft_patch || {}, data));
        queueAiHistoryMeta(mode === 'duplicate' ? 'ai-duplicate' : 'ai-draft', data.summary || (mode === 'duplicate' ? 'AI duplicated an uploaded quotation into a new draft' : 'AI generated a quotation draft'));
        return data;
    }

    async function suggestAiPricing() {
        const response = await fetch('/api/quotations/ai/pricing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quotation: form }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to generate AI pricing suggestions');
        if (Array.isArray(data.suggestions) && data.suggestions.length) {
            applyAiPricingSuggestions(data.suggestions);
        }
        return data;
    }

    function applyAiPricingSuggestions(suggestions = []) {
        const byKey = new Map(
            (Array.isArray(suggestions) ? suggestions : []).map((suggestion) => [
                `${suggestion.sectionIndex}:${suggestion.itemIndex}`,
                suggestion,
            ])
        );
        setForm((current) => normalizeQuote({
            ...current,
            sections: (current.sections || []).map((section, sectionIndex) => ({
                ...section,
                selling_rule: (Array.isArray(suggestions) ? suggestions : []).find(
                    (suggestion) => Number(suggestion.sectionIndex) === sectionIndex && suggestion.selling_rule
                )?.selling_rule || section.selling_rule,
                items: (section.items || []).map((item, itemIndex) => {
                    const suggestion = byKey.get(`${sectionIndex}:${itemIndex}`);
                    if (!suggestion) return item;
                    return {
                        ...item,
                        price_reference_id: suggestion.reference_id || item.price_reference_id,
                        costs_bhd: suggestion.costs_bhd ?? item.costs_bhd,
                        rate: suggestion.rate ?? item.rate,
                    };
                }),
            })),
        }));
        queueAiHistoryMeta('ai-pricing', `AI applied ${suggestions.length} pricing suggestion${suggestions.length === 1 ? '' : 's'}`);
    }

    async function reviewAiQuote({ brief = '', files = [] } = {}) {
        const response = await fetch('/api/quotations/ai/review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quotation: form,
                brief,
                files,
            }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to review quotation');
        return data;
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
            const isOrderConfirmation = form.source_type === 'order' && nextStatus === 'Confirmed';
            const response = await fetch(form.id ? `/api/quotations/${form.id}` : '/api/quotations', {
                method: form.id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    sections: normalizedSections,
                    status: isOrderConfirmation ? 'Draft' : (nextStatus || form.status),
                    total_selling: totals.client,
                    total_with_vat: totals.grand,
                    history_meta: pendingAiHistoryMeta,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to save quotation');
            let finalQuote = data;

            if (isOrderConfirmation) {
                const sendResponse = await fetch(`/api/quotations/${data.id}/send`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ markConfirmed: true }),
                });
                const sendData = await sendResponse.json();
                if (!sendResponse.ok) throw new Error(sendData.error || 'Failed to send confirmed quotation');
                finalQuote = sendData.quotation || data;
            }

            setSelectedId(finalQuote.id);
            setForm(normalizeQuote(finalQuote));
            setPendingAiHistoryMeta(null);
            await loadQuotationHistory(finalQuote.id);
            await loadQuotes(finalQuote.id);
            setViewMode('dashboard');
            flash('success', isOrderConfirmation ? `QT-${finalQuote.qt_number} confirmed and emailed` : `Quotation QT-${finalQuote.qt_number} saved`);
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
            await loadQuotationHistory(data.id);
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
            setQuotationHistory([]);
            setViewMode('dashboard');
            flash('success', 'Quotation deleted');
        } catch (error) {
            flash('error', error.message || 'Failed to delete quotation');
        }
    }

    async function updateQuoteStatus(id, status) {
        if (!id || !status) return;
        try {
            const quote = await fetch(`/api/quotations/${id}`, { cache: 'no-store' }).then((response) => response.json().then((data) => ({ ok: response.ok, data })));
            if (!quote.ok) throw new Error(quote.data.error || 'Failed to load quotation');

            if (quote.data.source_type === 'order' && status === 'Confirmed') {
                const saveResponse = await fetch(`/api/quotations/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...quote.data,
                        status: 'Draft',
                    }),
                });
                const saveData = await saveResponse.json();
                if (!saveResponse.ok) throw new Error(saveData.error || 'Failed to prepare quotation for sending');

                const sendResponse = await fetch(`/api/quotations/${id}/send`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ markConfirmed: true }),
                });
                const sendData = await sendResponse.json();
                if (!sendResponse.ok) throw new Error(sendData.error || 'Failed to send confirmed quotation');

                await loadQuotes(id === selectedId ? id : null);
                if (id === selectedId) {
                    setForm(normalizeQuote(sendData.quotation || saveData));
                    await loadQuotationHistory(id);
                }
                flash('success', `QT-${quote.data.qt_number} confirmed and emailed`);
                return;
            }

            const response = await fetch(`/api/quotations/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...quote.data,
                    status,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to update quotation status');

            await loadQuotes(id === selectedId ? id : null);
            if (id === selectedId) {
                setForm(normalizeQuote(data));
                await loadQuotationHistory(id);
            }
            flash('success', `Quotation marked as ${status}`);
        } catch (error) {
            flash('error', error.message || 'Failed to update quotation status');
        }
    }

    async function restoreQuoteVersion(version) {
        if (!form.id) return;
        if (!window.confirm(`Restore quotation to version ${version}?`)) return;
        setSaving(true);
        try {
            const response = await fetch(`/api/quotations/${form.id}/restore`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ version }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to restore quotation version');
            setForm(normalizeQuote(data));
            await loadQuotationHistory(data.id);
            await loadQuotes(data.id);
            flash('success', `Restored quotation to version ${version}`);
        } catch (error) {
            flash('error', error.message || 'Failed to restore quotation version');
        } finally {
            setSaving(false);
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

    const manualQuotes = quotes.filter((quote) => quote.source_type !== 'order');
    const orderQuotes = quotes.filter((quote) => quote.source_type === 'order');
    const activeQuotePool = dashboardTab === 'orders' ? orderQuotes : manualQuotes;

    const filteredQuotes = activeQuotePool.filter((quote) => {
        const needle = search.trim().toLowerCase();
        const matchesSearch = !needle || [
            quote.project_title,
            quote.client_org,
            quote.client_to,
            quote.created_by,
            quote.ref,
            quote.source_order_reference,
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
        total: activeQuotePool.length,
        confirmed: activeQuotePool.filter((quote) => quote.status === 'Confirmed').length,
        drafts: activeQuotePool.filter((quote) => quote.status === 'Draft').length,
        pipeline: activeQuotePool
            .filter((quote) => quote.status === 'Confirmed')
            .reduce((sum, quote) => sum + Number(quote.total_with_vat || 0), 0),
    };
    const pipelineQuotes = activeQuotePool.filter((quote) => quote.status === 'Confirmed');
    const pipelineCurrencies = [...new Set(pipelineQuotes.map((quote) => normalizeCurrencyCode(quote.currency_code)))];
    const pipelineCurrencyCode = pipelineQuotes.length === 0
        ? DEFAULT_CURRENCY_CODE
        : (pipelineCurrencies.length === 1 ? pipelineCurrencies[0] : null);

    if (loading) {
        return <div className="loading-page"><div className="spinner"></div></div>;
    }

    return (
        <div className="quotation-page-shell">
            {message.text ? <div className={`alert alert-${message.type}`} style={{ marginBottom: '1rem' }}>{message.text}</div> : null}

                {viewMode === 'dashboard' ? (
                    <div className="quotation-dashboard-screen">
                        <div className="quotation-screen-header quotation-dashboard-hero">
                            <div className="quotation-dashboard-hero-copy">
                                <div className="quotation-dashboard-kicker">Pico Bahrain</div>
                                <h1>Quotation Studio</h1>
                                <p>Search, filter, export, reopen quotes, and manage reusable price references from one place.</p>
                            </div>
                            <div className="quotation-dashboard-toolbar quotation-dashboard-toolbar-panel">
                                <div className="quotation-dashboard-toolbar-top">
                                    <div className="quotation-dashboard-filter-stack">
                                        <span className="quotation-dashboard-filter-label">Status</span>
                                        <select className="quotation-input quotation-dashboard-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                                            <option value="">All statuses</option>
                                            {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="quotation-dashboard-toolbar-actions">
                                    <button type="button" className="quotation-btn quotation-btn-ghost quotation-dashboard-toolbar-btn" onClick={openQtNumberEditor}>
                                        QT Number
                                    </button>
                                    <button type="button" className="quotation-btn quotation-btn-ghost quotation-dashboard-toolbar-btn" onClick={() => setShowReferenceManager(true)}>
                                        Price References
                                    </button>
                                    <button type="button" className="quotation-btn quotation-btn-primary quotation-dashboard-toolbar-btn quotation-dashboard-new-btn" onClick={startNewQuote}>+ New Quotation</button>
                                </div>
                                <div className="quotation-dashboard-search-shell">
                                    <span className="quotation-dashboard-search-icon" aria-hidden="true"></span>
                                    <input
                                        className="quotation-input quotation-dashboard-search"
                                        type="search"
                                        placeholder="Search by QT #, project, client, owner, or references"
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                    />
                                    {search ? (
                                        <button
                                            type="button"
                                            className="quotation-dashboard-search-clear"
                                            onClick={() => setSearch('')}
                                            aria-label="Clear quotation search"
                                        >
                                            Clear
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        <div className="quotation-dashboard-tabs">
                            <button
                                type="button"
                                className={`quotation-dashboard-tab ${dashboardTab === 'overview' ? 'quotation-dashboard-tab-active' : ''}`}
                                onClick={() => setDashboardTab('overview')}
                            >
                                Dashboard
                            </button>
                            <button
                                type="button"
                                className={`quotation-dashboard-tab ${dashboardTab === 'reports' ? 'quotation-dashboard-tab-active' : ''}`}
                                onClick={() => setDashboardTab('reports')}
                            >
                                Reports
                            </button>
                            <button
                                type="button"
                                className={`quotation-dashboard-tab ${dashboardTab === 'orders' ? 'quotation-dashboard-tab-active' : ''}`}
                                onClick={() => setDashboardTab('orders')}
                            >
                                Orders Quotations
                            </button>
                        </div>

                        {dashboardTab === 'reports' ? (
                            <QuotationReports />
                        ) : (
                            <>
                                <div className="quotation-dashboard-results-bar">
                                    <div className="quotation-dashboard-results-copy">
                                        Showing <strong>{filteredQuotes.length}</strong> of <strong>{activeQuotePool.length}</strong> quotations
                                    </div>
                                    {(search || statusFilter) ? (
                                        <button
                                            type="button"
                                            className="quotation-dashboard-reset"
                                            onClick={() => {
                                                setSearch('');
                                                setStatusFilter('');
                                            }}
                                        >
                                            Reset filters
                                        </button>
                                    ) : (
                                        <div className="quotation-dashboard-results-hint">Use search or status to narrow results faster.</div>
                                    )}
                                </div>

                                <div className="quotation-dashboard-stats">
                                    <div className="quotation-dashboard-stat quotation-dashboard-stat-total"><span>Total Quotations</span><strong>{stats.total}</strong></div>
                                    <div className="quotation-dashboard-stat quotation-dashboard-stat-confirmed"><span>Confirmed</span><strong>{stats.confirmed}</strong></div>
                                    <div className="quotation-dashboard-stat quotation-dashboard-stat-drafts"><span>Drafts</span><strong>{stats.drafts}</strong></div>
                                    <div className="quotation-dashboard-stat quotation-dashboard-stat-pipeline">
                                        <span>Pipeline Value</span>
                                        <strong>{pipelineCurrencyCode ? formatMoney(stats.pipeline, pipelineCurrencyCode, { withCode: true }) : 'Mixed currencies'}</strong>
                                    </div>
                                </div>

                                <div className="quotation-card quotation-dashboard-table-card">
                                    <QuotationDashboardTable
                                        quotes={filteredQuotes}
                                        onOpen={openQuote}
                                        onDuplicate={duplicateQuote}
                                        onDelete={deleteQuote}
                                        onStatusChange={updateQuoteStatus}
                                        onExportPdf={exportQuotePdf}
                                        onExportExcel={exportQuoteExcel}
                                        formatMoney={formatMoney}
                                        getReferenceSummary={getReferenceSummary}
                                    />
                                </div>
                            </>
                        )}
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
                        currencies={QUOTATION_CURRENCIES}
                        companyProfile={QUOTATION_COMPANY_PROFILE}
                        priceReferences={priceReferences}
                customers={customers}
                signatures={signatures}
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
                        onAttachQuotationFiles={attachQuotationFiles}
                        onUpdateQuotationAttachment={updateQuotationAttachment}
                        onRemoveQuotationAttachment={removeQuotationAttachment}
                        onApplyReference={applyReference}
                onApplyCustomer={applyCustomer}
                onSaveCustomer={saveCustomer}
                onDeleteCustomers={deleteCustomers}
                onSaveSelectedCustomer={saveSelectedCustomerDetails}
                onSaveSignature={saveSignature}
                onGenerateAiDraft={generateAiDraft}
                onSuggestAiPricing={suggestAiPricing}
                onApplyAiPricingSuggestions={applyAiPricingSuggestions}
                onReviewAiQuote={reviewAiQuote}
                onSaveDraft={() => saveQuote('Draft')}
                        onSaveConfirmed={() => saveQuote('Confirmed')}
                        onExportCustomerPdf={() => exportQuotePdf(form.id, 'customer')}
                        onExportManagementPdf={() => exportQuotePdf(form.id, 'management')}
                        onExportExcel={() => exportQuoteExcel(form.id)}
                        onDuplicate={() => duplicateQuote(form.id)}
                        onDelete={() => deleteQuote(form.id)}
                        formatMoney={(value, options = {}) => formatMoney(value, form.currency_code, options)}
                        getSectionTotals={sectionTotals}
                        numberToWords={(value) => numberToWords(value, form.currency_code)}
                        quotationHistory={quotationHistory}
                        onRestoreVersion={restoreQuoteVersion}
                    />
                )}

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

            {showQtNumberEditor ? (
                <div className="modal-overlay" onClick={() => setShowQtNumberEditor(false)}>
                    <div className="modal-box" style={{ maxWidth: 360 }} onClick={(event) => event.stopPropagation()}>
                        <button type="button" className="modal-close" onClick={() => setShowQtNumberEditor(false)} aria-label="Close">×</button>
                        <h3 className="modal-title" style={{ marginBottom: '1rem' }}>Set Next Quotation Number</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            The next new quotation will use this number.
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input
                                className="quotation-input"
                                type="number"
                                min="1"
                                step="1"
                                value={qtNumberInput}
                                onChange={(event) => setQtNumberInput(event.target.value)}
                                onKeyDown={(event) => { if (event.key === 'Enter') saveQtNumber(); }}
                                style={{ width: '100%' }}
                                autoFocus
                            />
                            <button
                                type="button"
                                className="quotation-btn quotation-btn-primary"
                                onClick={saveQtNumber}
                                disabled={qtNumberSaving}
                                style={{ whiteSpace: 'nowrap' }}
                            >
                                {qtNumberSaving ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default function QuotationsAdminPage() {
    return (
        <Suspense fallback={<div className="loading-page"><div className="spinner"></div></div>}>
            <QuotationsAdminPageContent />
        </Suspense>
    );
}
