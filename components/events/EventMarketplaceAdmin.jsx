'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { extractCleanName, getProductSpecs } from '@/lib/nameHelpers';
import { formatMoney, getEventDays, roundMoney } from '@/lib/eventMarketplacePricing';
import './event-marketplace.css';

const EVENT_STATUS_OPTIONS = [
    { value: 'draft', label: 'Draft — hidden from clients' },
    { value: 'open', label: 'Open — clients can browse and request' },
    { value: 'closed', label: 'Closed — no new requests' },
];

const REQUEST_STATUS_OPTIONS = ['new', 'contacted', 'quoted', 'confirmed', 'declined'];

const CATEGORY_LABELS = { furniture: 'Furniture', 'tv-led': 'TV / LED', graphics: 'Graphics', event: 'Event package' };

function categoryLabel(value) {
    return CATEGORY_LABELS[value] || String(value || '').replace(/-/g, ' ');
}

function cleanName(item) {
    if (item.source === 'custom') return item.name;
    const clean = extractCleanName(item.name);
    return clean === '--' ? item.name : clean;
}

function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function EventMarketplaceAdmin({ slug }) {
    const [tab, setTab] = useState('setup');
    const [config, setConfig] = useState(null);
    const [catalogue, setCatalogue] = useState([]);
    const [storage, setStorage] = useState(null);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [flash, setFlash] = useState(null);
    const [dirty, setDirty] = useState(false);
    const [publicUrl, setPublicUrl] = useState(`/events/${slug}`);

    const showFlash = useCallback((type, text) => {
        setFlash({ type, text });
        setTimeout(() => setFlash((current) => (current?.text === text ? null : current)), 4000);
    }, []);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [adminRes, requestsRes] = await Promise.all([
                fetch(`/api/events/${slug}/admin`, { cache: 'no-store' }),
                fetch(`/api/events/${slug}/requests`, { cache: 'no-store' }),
            ]);
            const adminData = await adminRes.json();
            if (!adminRes.ok) throw new Error(adminData?.error || 'Failed to load event');
            setConfig(adminData.config);
            setCatalogue(Array.isArray(adminData.catalogue) ? adminData.catalogue : []);
            setStorage(adminData.storage || null);
            const requestData = await requestsRes.json().catch(() => []);
            setRequests(Array.isArray(requestData) ? requestData : []);
            setDirty(false);
        } catch (error) {
            showFlash('err', error.message || 'Failed to load event');
        } finally {
            setLoading(false);
        }
    }, [slug, showFlash]);

    useEffect(() => { loadAll(); }, [loadAll]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setPublicUrl(`${window.location.origin}/events/${slug}`);
        }
    }, [slug]);

    const updateConfig = useCallback((patch) => {
        setConfig((prev) => ({ ...prev, ...patch }));
        setDirty(true);
    }, []);

    const updateItemSetting = useCallback((productId, patch) => {
        setConfig((prev) => {
            const items = { ...(prev.items || {}) };
            items[productId] = { visible: false, eventPrice: null, sortOrder: 0, note: '', ...(items[productId] || {}), ...patch };
            return { ...prev, items };
        });
        setDirty(true);
    }, []);

    const setAllVisible = useCallback((visible, ids) => {
        setConfig((prev) => {
            const items = { ...(prev.items || {}) };
            for (const id of ids) {
                items[id] = { visible: false, eventPrice: null, sortOrder: 0, note: '', ...(items[id] || {}), visible };
            }
            return { ...prev, items };
        });
        setDirty(true);
    }, []);

    const updateCustomItem = useCallback((id, patch) => {
        setConfig((prev) => ({
            ...prev,
            customItems: (prev.customItems || []).map((item) => (item.id === id ? { ...item, ...patch } : item)),
        }));
        setDirty(true);
    }, []);

    const addCustomItem = useCallback(() => {
        setConfig((prev) => ({
            ...prev,
            customItems: [
                ...(prev.customItems || []),
                {
                    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    name: '',
                    description: '',
                    category: 'event',
                    image: '',
                    eventPrice: 0,
                    visible: true,
                    sortOrder: 0,
                    note: '',
                },
            ],
        }));
        setDirty(true);
    }, []);

    const removeCustomItem = useCallback((id) => {
        setConfig((prev) => ({ ...prev, customItems: (prev.customItems || []).filter((item) => item.id !== id) }));
        setDirty(true);
    }, []);

    async function save(overrides = {}) {
        if (!config) return;
        setSaving(true);
        try {
            const response = await fetch(`/api/events/${slug}/admin`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...config, ...overrides }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data?.error || 'Save failed');
            setConfig(data.config);
            setCatalogue(Array.isArray(data.catalogue) ? data.catalogue : catalogue);
            setDirty(false);
            showFlash('ok', 'Event saved.');
        } catch (error) {
            showFlash('err', error.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    }

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(publicUrl);
            showFlash('ok', 'Client link copied.');
        } catch {
            showFlash('warn', 'Could not copy automatically. Select the link and copy it manually.');
        }
    }

    async function updateRequest(id, patch) {
        try {
            const response = await fetch(`/api/events/${slug}/requests/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data?.error || 'Update failed');
            setRequests((prev) => prev.map((item) => (item.id === id ? data.request : item)));
            showFlash('ok', 'Request updated.');
        } catch (error) {
            showFlash('err', error.message || 'Update failed');
        }
    }

    async function deleteRequest(id) {
        const target = requests.find((item) => item.id === id);
        if (!window.confirm(`Delete request ${target?.reference || id}? This cannot be undone.`)) return;
        try {
            const response = await fetch(`/api/events/${slug}/requests/${id}`, { method: 'DELETE' });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data?.error || 'Delete failed');
            setRequests((prev) => prev.filter((item) => item.id !== id));
            showFlash('ok', 'Request deleted.');
        } catch (error) {
            showFlash('err', error.message || 'Delete failed');
        }
    }

    function exportCsv() {
        const rows = [['Reference', 'Date', 'Status', 'Company', 'Contact', 'Email', 'Phone', 'Stand', 'Items', 'Subtotal', 'VAT', 'Total', 'Currency', 'Client notes', 'Admin notes']];
        for (const request of requests) {
            rows.push([
                request.reference,
                request.createdAt,
                request.status,
                request.company,
                request.contact?.name,
                request.contact?.email,
                request.contact?.phone,
                request.contact?.stand,
                (request.items || []).map((line) => `${line.quantity} × ${cleanName(line)}`).join('; '),
                request.subtotal,
                request.vatAmount,
                request.total,
                request.currency,
                request.contact?.notes,
                request.adminNotes,
            ]);
        }
        const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${slug}-requests.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    const visibleCount = useMemo(() => catalogue.filter((item) => item.visible).length, [catalogue]);
    const newRequests = useMemo(() => requests.filter((item) => item.status === 'new').length, [requests]);

    if (loading || !config) {
        return (
            <div className="eva-page">
                <div className="loading-page"><div className="spinner" /></div>
            </div>
        );
    }

    return (
        <div className="eva-page">
            <div className="eva-head">
                <div>
                    <h2>{config.name}</h2>
                    <p>
                        Client marketplace for a {getEventDays(config)}-day event · <span className={`eva-status ${config.status}`}>{config.status}</span>
                    </p>
                </div>
                <div className="eva-link-box">
                    <span style={{ color: 'var(--text-muted)' }}>Client link</span>
                    <code>{publicUrl}</code>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={copyLink}>Copy</button>
                    <a href={`/events/${slug}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">Open page</a>
                </div>
            </div>

            {storage && !storage.production_ready && (
                <div className="eva-flash warn">
                    Storage is not configured for production. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY and run the event marketplace migration.
                </div>
            )}
            {flash && <div className={`eva-flash ${flash.type}`}>{flash.text}</div>}

            <div className="eva-tabs">
                <button type="button" className={`eva-tab${tab === 'setup' ? ' active' : ''}`} onClick={() => setTab('setup')}>Event setup</button>
                <button type="button" className={`eva-tab${tab === 'catalogue' ? ' active' : ''}`} onClick={() => setTab('catalogue')}>
                    Catalogue &amp; prices <span className="eva-pill">{visibleCount} shown</span>
                </button>
                <button type="button" className={`eva-tab${tab === 'requests' ? ' active' : ''}`} onClick={() => setTab('requests')}>
                    Client requests <span className="eva-pill">{requests.length}{newRequests ? ` · ${newRequests} new` : ''}</span>
                </button>
            </div>

            {tab === 'setup' && (
                <SetupTab config={config} updateConfig={updateConfig} save={save} saving={saving} dirty={dirty} />
            )}

            {tab === 'catalogue' && (
                <CatalogueTab
                    config={config}
                    catalogue={catalogue}
                    updateItemSetting={updateItemSetting}
                    setAllVisible={setAllVisible}
                    updateCustomItem={updateCustomItem}
                    addCustomItem={addCustomItem}
                    removeCustomItem={removeCustomItem}
                    save={save}
                    saving={saving}
                    dirty={dirty}
                />
            )}

            {tab === 'requests' && (
                <RequestsTab
                    config={config}
                    requests={requests}
                    onReload={loadAll}
                    onUpdate={updateRequest}
                    onDelete={deleteRequest}
                    onExport={exportCsv}
                />
            )}
        </div>
    );
}

function SetupTab({ config, updateConfig, save, saving, dirty }) {
    const field = (key, extra = {}) => ({
        value: config[key] ?? '',
        onChange: (e) => updateConfig({ [key]: e.target.value }),
        ...extra,
    });

    return (
        <div className="eva-card">
            <h3>Event details</h3>
            <div className="eva-grid-2">
                <label className="eva-field eva-span-2">
                    <span>Event name</span>
                    <input className="form-input" {...field('name')} />
                </label>
                <label className="eva-field eva-span-2">
                    <span>Tagline</span>
                    <input className="form-input" {...field('tagline')} placeholder="Short line under the event title" />
                </label>
                <label className="eva-field eva-span-2">
                    <span>Introduction</span>
                    <textarea className="form-textarea" rows={3} {...field('description')} placeholder="What clients see above the catalogue" />
                </label>
                <label className="eva-field">
                    <span>Status</span>
                    <select className="form-select" {...field('status')}>
                        {EVENT_STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </label>
                <label className="eva-field">
                    <span>Event days</span>
                    <input className="form-input" type="number" min={1} max={60} {...field('days')} />
                    <small>Default event price = catalogue rate per day × event days.</small>
                </label>
                <label className="eva-field">
                    <span>Start date</span>
                    <input className="form-input" type="date" {...field('startDate')} />
                </label>
                <label className="eva-field">
                    <span>End date</span>
                    <input className="form-input" type="date" {...field('endDate')} />
                </label>
                <label className="eva-field eva-span-2">
                    <span>Venue</span>
                    <input className="form-input" {...field('venue')} />
                </label>
                <label className="eva-field eva-span-2">
                    <span>Hero image URL (optional)</span>
                    <input className="form-input" {...field('heroImage')} placeholder="https://… or /uploads/…" />
                </label>
            </div>

            <h3 style={{ marginTop: '1.6rem' }}>Pricing &amp; payment</h3>
            <div className="eva-grid-3">
                <label className="eva-field">
                    <span>Currency</span>
                    <input className="form-input" {...field('currency')} />
                </label>
                <label className="eva-field">
                    <span>VAT %</span>
                    <input className="form-input" type="number" min={0} max={100} step="0.5" {...field('vatPercent')} />
                </label>
                <label className="eva-field">
                    <span>Reference prefix</span>
                    <input className="form-input" {...field('referencePrefix')} placeholder="RBC26" />
                    <small>Client requests are numbered PREFIX-YYMMDD-XXXX.</small>
                </label>
                <label className="eva-field eva-span-2" style={{ gridColumn: '1 / -1' }}>
                    <span>Payment terms shown to clients</span>
                    <textarea className="form-textarea" rows={4} {...field('paymentTerms')} />
                </label>
            </div>

            <h3 style={{ marginTop: '1.6rem' }}>Contact &amp; notifications</h3>
            <div className="eva-grid-3">
                <label className="eva-field">
                    <span>Contact email (shown to clients)</span>
                    <input className="form-input" type="email" {...field('contactEmail')} />
                </label>
                <label className="eva-field">
                    <span>Contact phone (shown to clients)</span>
                    <input className="form-input" {...field('contactPhone')} />
                </label>
                <label className="eva-field">
                    <span>Extra notification email</span>
                    <input className="form-input" type="email" {...field('notifyEmail')} placeholder="Optional" />
                    <small>New requests always go to the admin email; add another recipient here.</small>
                </label>
            </div>

            <div className="eva-actions">
                <button type="button" className="btn btn-primary" onClick={() => save()} disabled={saving}>
                    {saving ? 'Saving…' : 'Save event'}
                </button>
                {config.status !== 'open' && (
                    <button type="button" className="btn btn-secondary" onClick={() => save({ status: 'open' })} disabled={saving}>
                        Save &amp; open to clients
                    </button>
                )}
                {dirty && <span className="eva-hint">Unsaved changes</span>}
            </div>
        </div>
    );
}

function CatalogueTab({ config, catalogue, updateItemSetting, setAllVisible, updateCustomItem, addCustomItem, removeCustomItem, save, saving, dirty }) {
    const [query, setQuery] = useState('');
    const [onlyShown, setOnlyShown] = useState(false);
    const days = getEventDays(config);
    const currency = config.currency || 'BHD';

    const products = useMemo(() => catalogue.filter((item) => item.source === 'catalogue'), [catalogue]);
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return products.filter((item) => {
            const settings = config.items?.[item.id] || {};
            if (onlyShown && !settings.visible) return false;
            if (!q) return true;
            return `${item.name} ${cleanName(item)} ${item.category}`.toLowerCase().includes(q);
        });
    }, [products, query, onlyShown, config.items]);

    const customItems = config.customItems || [];

    return (
        <>
            <div className="eva-card">
                <h3>Catalogue items on the event page</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '-0.5rem', marginBottom: '1rem' }}>
                    Tick the items to showcase. The event price defaults to the per-day rate × {days} days; enter an override to charge a fixed price for the whole event.
                </p>
                <div className="eva-toolbar">
                    <input className="form-input" placeholder="Search catalogue…" value={query} onChange={(e) => setQuery(e.target.value)} />
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <input type="checkbox" checked={onlyShown} onChange={(e) => setOnlyShown(e.target.checked)} /> Only shown items
                    </label>
                    <span className="spacer" />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAllVisible(true, filtered.map((item) => item.id))}>Show all listed</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAllVisible(false, filtered.map((item) => item.id))}>Hide all listed</button>
                </div>

                {products.length === 0 ? (
                    <div className="eva-empty">No catalogue products found. Add products under Admin → Products first.</div>
                ) : (
                    <div className="eva-table-wrap">
                        <table className="eva-table">
                            <thead>
                                <tr>
                                    <th>Show</th>
                                    <th></th>
                                    <th>Item</th>
                                    <th>Category</th>
                                    <th className="num">Per day</th>
                                    <th className="num">Event price ({days} days)</th>
                                    <th>Override</th>
                                    <th>Order</th>
                                    <th>Note for clients</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((item) => {
                                    const settings = config.items?.[item.id] || {};
                                    const specs = getProductSpecs(item);
                                    const defaultPrice = roundMoney((item.perDayPrice || 0) * days);
                                    const override = settings.eventPrice;
                                    const hasOverride = override !== null && override !== undefined && override !== '';
                                    return (
                                        <tr key={item.id} className={settings.visible ? '' : 'hidden-row'}>
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(settings.visible)}
                                                    onChange={(e) => updateItemSetting(item.id, { visible: e.target.checked })}
                                                />
                                            </td>
                                            <td>{item.image ? <img src={item.image} alt="" className="eva-thumb" /> : null}</td>
                                            <td>
                                                <div className="eva-item-name">{cleanName(item)}</div>
                                                <div className="eva-item-sub">{[specs.idNo !== '—' ? `ID ${specs.idNo}` : '', specs.code !== '—' ? specs.code : '', item.stock !== null && item.stock !== undefined ? `${item.stock} in stock` : ''].filter(Boolean).join(' · ')}</div>
                                            </td>
                                            <td>{categoryLabel(item.category)}</td>
                                            <td className="num">{item.perDayPrice > 0 ? formatMoney(item.perDayPrice, currency) : '—'}</td>
                                            <td className="num">
                                                {hasOverride ? (
                                                    <>
                                                        <span className="eva-price-override">{formatMoney(override, currency)}</span>
                                                        <div className="eva-price-default">default {formatMoney(defaultPrice, currency)}</div>
                                                    </>
                                                ) : (
                                                    defaultPrice > 0 ? formatMoney(defaultPrice, currency) : <span className="eva-price-default">on request</span>
                                                )}
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step="0.001"
                                                    placeholder="auto"
                                                    value={hasOverride ? override : ''}
                                                    onChange={(e) => updateItemSetting(item.id, { eventPrice: e.target.value === '' ? null : e.target.value })}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    style={{ minWidth: 64, width: 64 }}
                                                    value={settings.sortOrder ?? 0}
                                                    onChange={(e) => updateItemSetting(item.id, { sortOrder: e.target.value })}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. includes white cover"
                                                    value={settings.note || ''}
                                                    onChange={(e) => updateItemSetting(item.id, { note: e.target.value })}
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="eva-card">
                <h3>Event-only items &amp; packages</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '-0.5rem', marginBottom: '1rem' }}>
                    Items that are not in the main catalogue (e.g. a branded display package, VIP lounge set, graphics bundle). Prices are for the whole event.
                </p>
                {customItems.length === 0 ? (
                    <div className="eva-empty">No event-only items yet.</div>
                ) : (
                    <div className="eva-table-wrap">
                        <table className="eva-table">
                            <thead>
                                <tr>
                                    <th>Show</th>
                                    <th>Name</th>
                                    <th>Description</th>
                                    <th>Category</th>
                                    <th className="num">Event price</th>
                                    <th>Image URL</th>
                                    <th>Order</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {customItems.map((item) => (
                                    <tr key={item.id} className={item.visible === false ? 'hidden-row' : ''}>
                                        <td><input type="checkbox" checked={item.visible !== false} onChange={(e) => updateCustomItem(item.id, { visible: e.target.checked })} /></td>
                                        <td><input type="text" value={item.name} placeholder="Item name" onChange={(e) => updateCustomItem(item.id, { name: e.target.value })} /></td>
                                        <td><input type="text" value={item.description} placeholder="Optional description" onChange={(e) => updateCustomItem(item.id, { description: e.target.value })} /></td>
                                        <td><input type="text" value={item.category} placeholder="event" onChange={(e) => updateCustomItem(item.id, { category: e.target.value })} /></td>
                                        <td><input type="number" min={0} step="0.001" value={item.eventPrice} onChange={(e) => updateCustomItem(item.id, { eventPrice: e.target.value })} /></td>
                                        <td><input type="text" value={item.image} placeholder="/uploads/… or https://…" onChange={(e) => updateCustomItem(item.id, { image: e.target.value })} /></td>
                                        <td><input type="number" style={{ minWidth: 64, width: 64 }} value={item.sortOrder ?? 0} onChange={(e) => updateCustomItem(item.id, { sortOrder: e.target.value })} /></td>
                                        <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => removeCustomItem(item.id)}>Remove</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="eva-actions">
                    <button type="button" className="btn btn-secondary" onClick={addCustomItem}>+ Add event-only item</button>
                </div>
            </div>

            <div className="eva-actions" style={{ marginTop: 0 }}>
                <button type="button" className="btn btn-primary" onClick={() => save()} disabled={saving}>
                    {saving ? 'Saving…' : 'Save catalogue & prices'}
                </button>
                {dirty && <span className="eva-hint">Unsaved changes</span>}
            </div>
        </>
    );
}

function RequestsTab({ config, requests, onReload, onUpdate, onDelete, onExport }) {
    const [openId, setOpenId] = useState(null);
    const [statusFilter, setStatusFilter] = useState('all');
    const [notesDraft, setNotesDraft] = useState({});
    const currency = config.currency || 'BHD';

    const filtered = useMemo(() => (
        statusFilter === 'all' ? requests : requests.filter((item) => item.status === statusFilter)
    ), [requests, statusFilter]);

    const totals = useMemo(() => {
        const active = requests.filter((item) => item.status !== 'declined');
        return {
            count: requests.length,
            confirmed: requests.filter((item) => item.status === 'confirmed').length,
            pipeline: roundMoney(active.reduce((sum, item) => sum + (Number(item.total) || 0), 0)),
            confirmedValue: roundMoney(requests.filter((item) => item.status === 'confirmed').reduce((sum, item) => sum + (Number(item.total) || 0), 0)),
        };
    }, [requests]);

    return (
        <>
            <div className="eva-summary-strip">
                <div className="eva-stat"><span>Requests</span><strong>{totals.count}</strong></div>
                <div className="eva-stat"><span>Confirmed</span><strong>{totals.confirmed}</strong></div>
                <div className="eva-stat"><span>Pipeline (incl. VAT)</span><strong>{formatMoney(totals.pipeline, currency)}</strong></div>
                <div className="eva-stat"><span>Confirmed value</span><strong>{formatMoney(totals.confirmedValue, currency)}</strong></div>
            </div>

            <div className="eva-toolbar">
                <select className="form-select" style={{ maxWidth: 220 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="all">All statuses</option>
                    {REQUEST_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
                <span className="spacer" />
                <button type="button" className="btn btn-secondary btn-sm" onClick={onReload}>Refresh</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onExport} disabled={requests.length === 0}>Download CSV</button>
            </div>

            {filtered.length === 0 ? (
                <div className="eva-empty">
                    {requests.length === 0
                        ? 'No client requests yet. Share the client link once the event is open.'
                        : 'No requests match this filter.'}
                </div>
            ) : filtered.map((request) => {
                const isOpen = openId === request.id;
                return (
                    <div key={request.id} className="eva-request">
                        <div className="eva-request-head" onClick={() => setOpenId(isOpen ? null : request.id)}>
                            <span className="eva-request-ref">{request.reference}</span>
                            <div style={{ minWidth: 0 }}>
                                <div className="eva-request-company">{request.company}</div>
                                <div className="eva-request-meta">
                                    {request.contact?.name}{request.contact?.email ? ` · ${request.contact.email}` : ''}{request.contact?.phone ? ` · ${request.contact.phone}` : ''} · {formatDateTime(request.createdAt)}
                                </div>
                            </div>
                            <span className={`eva-status ${request.status}`}>{request.status}</span>
                            <div className="eva-request-total">
                                {formatMoney(request.total, currency)}
                                <small>{request.items.length} line{request.items.length === 1 ? '' : 's'} · incl. VAT</small>
                            </div>
                        </div>

                        {isOpen && (
                            <div className="eva-request-body">
                                <div>
                                    <h4>Requested items</h4>
                                    <div className="eva-table-wrap">
                                        <table className="eva-table">
                                            <thead>
                                                <tr><th>Item</th><th className="num">Qty</th><th className="num">Event rate</th><th className="num">Total</th></tr>
                                            </thead>
                                            <tbody>
                                                {request.items.map((line, index) => (
                                                    <tr key={`${line.id}-${index}`}>
                                                        <td>
                                                            <div className="eva-item-name">{cleanName(line)}</div>
                                                            {line.comment && <div className="eva-item-sub" style={{ fontFamily: 'inherit' }}>{line.comment}</div>}
                                                        </td>
                                                        <td className="num">{line.quantity}</td>
                                                        <td className="num">{line.eventPrice > 0 ? formatMoney(line.eventPrice, currency) : 'On request'}</td>
                                                        <td className="num">{line.eventPrice > 0 ? formatMoney(line.lineTotal ?? line.eventPrice * line.quantity, currency) : '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr><td colSpan={3} className="num">Subtotal</td><td className="num">{formatMoney(request.subtotal, currency)}</td></tr>
                                                <tr><td colSpan={3} className="num">VAT {request.vatPercent}%</td><td className="num">{formatMoney(request.vatAmount, currency)}</td></tr>
                                                <tr><td colSpan={3} className="num" style={{ fontWeight: 800 }}>Total to pay</td><td className="num" style={{ fontWeight: 800, color: 'var(--pico-teal-light)' }}>{formatMoney(request.total, currency)}</td></tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                                <div>
                                    <h4>Client</h4>
                                    <div className="eva-kv">
                                        <span>Company</span><strong>{request.company}</strong>
                                        <span>Contact</span><div>{request.contact?.name || '—'}</div>
                                        <span>Email</span><div>{request.contact?.email ? <a href={`mailto:${request.contact.email}`}>{request.contact.email}</a> : '—'}</div>
                                        <span>Phone</span><div>{request.contact?.phone ? <a href={`tel:${request.contact.phone}`}>{request.contact.phone}</a> : '—'}</div>
                                        <span>Stand</span><div>{request.contact?.stand || '—'}</div>
                                        <span>Submitted</span><div>{formatDateTime(request.createdAt)}</div>
                                    </div>
                                    {request.contact?.notes && (
                                        <>
                                            <h4 style={{ marginTop: '0.9rem' }}>Client notes</h4>
                                            <div className="eva-request-notes">{request.contact.notes}</div>
                                        </>
                                    )}
                                    <h4 style={{ marginTop: '0.9rem' }}>Status &amp; internal notes</h4>
                                    <select
                                        className="form-select"
                                        value={request.status}
                                        onChange={(e) => onUpdate(request.id, { status: e.target.value })}
                                    >
                                        {REQUEST_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                                    </select>
                                    <textarea
                                        className="form-textarea"
                                        rows={3}
                                        style={{ marginTop: '0.5rem' }}
                                        placeholder="Internal notes (quotation number, availability, follow-up)…"
                                        value={notesDraft[request.id] ?? request.adminNotes ?? ''}
                                        onChange={(e) => setNotesDraft((prev) => ({ ...prev, [request.id]: e.target.value }))}
                                    />
                                    <div className="eva-request-tools">
                                        <button
                                            type="button"
                                            className="btn btn-primary btn-sm"
                                            disabled={(notesDraft[request.id] ?? request.adminNotes ?? '') === (request.adminNotes ?? '')}
                                            onClick={() => onUpdate(request.id, { adminNotes: notesDraft[request.id] ?? '' })}
                                        >
                                            Save notes
                                        </button>
                                        {request.contact?.email && (
                                            <a
                                                className="btn btn-secondary btn-sm"
                                                href={`mailto:${request.contact.email}?subject=${encodeURIComponent(`${config.name} — Request ${request.reference}`)}`}
                                            >
                                                Email client
                                            </a>
                                        )}
                                        <span className="spacer" style={{ flex: 1 }} />
                                        <button type="button" className="btn btn-secondary btn-sm" style={{ color: '#f87171' }} onClick={() => onDelete(request.id)}>Delete</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </>
    );
}
