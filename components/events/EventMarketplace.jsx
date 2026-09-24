'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { extractCleanName } from '@/lib/nameHelpers';
import { computeRequestTotals, formatMoney } from '@/lib/eventMarketplacePricing';
import './event-marketplace.css';

const CATEGORY_LABELS = {
    all: 'All items',
    furniture: 'Furniture',
    'tv-led': 'TV / LED',
    graphics: 'Graphics',
    event: 'Event packages',
};

function categoryLabel(category) {
    if (CATEGORY_LABELS[category]) return CATEGORY_LABELS[category];
    return String(category || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function displayName(item) {
    if (item.source === 'custom') return item.name;
    const clean = extractCleanName(item.name);
    return clean === '--' ? item.name : clean;
}

function formatDateRange(startDate, endDate) {
    const fmt = (value) => {
        if (!value) return '';
        const date = new Date(`${value}T00:00:00`);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    };
    const start = fmt(startDate);
    const end = fmt(endDate);
    if (start && end && start !== end) return `${start} – ${end}`;
    return start || end || '';
}

// Known stock caps a request line; unknown stock (null) falls back to 999.
function maxQuantity(item) {
    const stock = Number(item?.stock);
    return Number.isFinite(stock) && item?.stock !== null && stock > 0 ? stock : 999;
}

function hasKnownStock(item) {
    return item?.stock !== null && item?.stock !== undefined && Number(item.stock) > 0;
}

// Same rule as the storefront: a gallery, when present, is the full photo set.
function itemPhotos(item) {
    const list = Array.isArray(item?.gallery) && item.gallery.length > 0 ? item.gallery : [item?.image];
    return [...new Set(list.filter(Boolean))];
}

function ItemGallery({ photos, name }) {
    const [active, setActive] = useState(0);
    if (photos.length === 0) return null;
    const step = (delta) => setActive((index) => (index + delta + photos.length) % photos.length);
    return (
        <div className="evm-gallery">
            <div className="evm-gallery-main">
                <img src={photos[active]} alt={name} className="evm-modal-image" />
                {photos.length > 1 && (
                    <>
                        <button type="button" className="evm-gallery-nav prev" onClick={() => step(-1)} aria-label="Previous photo">‹</button>
                        <button type="button" className="evm-gallery-nav next" onClick={() => step(1)} aria-label="Next photo">›</button>
                        <span className="evm-gallery-count">{active + 1} / {photos.length}</span>
                    </>
                )}
            </div>
            {photos.length > 1 && (
                <div className="evm-gallery-thumbs">
                    {photos.map((url, index) => (
                        <button
                            key={url}
                            type="button"
                            className={index === active ? 'active' : ''}
                            onClick={() => setActive(index)}
                            aria-label={`Photo ${index + 1}`}
                        >
                            <img src={url} alt="" loading="lazy" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Links opened from WhatsApp/Telegram sometimes land in the browser's
 * "Desktop site" mode: the page is laid out ~980px wide and shrunk onto the
 * phone, so text is tiny and the desktop two-column layout shows. When a small
 * touch screen gets a much wider layout, scale the page back to phone size and
 * switch on the phone layout (media queries can't see the scaling).
 */
function useDesktopModeOnPhone() {
    const [zoom, setZoom] = useState(1);
    useEffect(() => {
        const root = document.documentElement;
        const measure = () => {
            const screenWidth = Number(window.screen?.width) || 0;
            const touch = (navigator.maxTouchPoints || 0) > 0 || window.matchMedia?.('(pointer: coarse)').matches;
            const needed = touch && screenWidth > 0 && screenWidth <= 600 && window.innerWidth >= screenWidth * 1.5;
            const next = needed ? Math.round((window.innerWidth / screenWidth) * 100) / 100 : 1;
            setZoom(next);
            root.style.zoom = next === 1 ? '' : String(next);
            root.style.setProperty('--evm-zoom', String(next));
        };
        measure();
        window.addEventListener('resize', measure);
        return () => {
            window.removeEventListener('resize', measure);
            root.style.zoom = '';
            root.style.removeProperty('--evm-zoom');
        };
    }, []);
    return zoom > 1;
}

function storageKey(slug) {
    return `pico-event-basket:${slug}`;
}

export default function EventMarketplace({ slug }) {
    const narrow = useDesktopModeOnPhone();
    const [event, setEvent] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    const [category, setCategory] = useState('all');
    const [query, setQuery] = useState('');
    const [basket, setBasket] = useState({}); // id → { quantity, comment }
    const [basketOpen, setBasketOpen] = useState(false);
    const [toast, setToast] = useState('');
    const toastTimer = useRef(null);

    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ company: '', name: '', email: '', phone: '', stand: '', notes: '' });
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [result, setResult] = useState(null);
    const [downloading, setDownloading] = useState(false);

    const showToast = useCallback((message) => {
        setToast(message);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(''), 2600);
    }, []);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setLoadError('');
            try {
                const response = await fetch(`/api/events/${encodeURIComponent(slug)}`, { cache: 'no-store' });
                const data = await response.json();
                if (!response.ok) throw new Error(data?.error || 'Unable to load this event.');
                if (cancelled) return;
                setEvent(data.event);
                setItems(Array.isArray(data.items) ? data.items : []);
            } catch (error) {
                if (!cancelled) setLoadError(error.message || 'Unable to load this event.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [slug]);

    // Restore the basket once items are known so stale ids are dropped.
    useEffect(() => {
        if (items.length === 0) return;
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey(slug)) || '{}');
            const valid = {};
            for (const item of items) {
                if (saved[item.id]?.quantity > 0) valid[item.id] = saved[item.id];
            }
            setBasket(valid);
        } catch {}
    }, [items, slug]);

    useEffect(() => {
        try {
            localStorage.setItem(storageKey(slug), JSON.stringify(basket));
        } catch {}
    }, [basket, slug]);

    const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

    const categories = useMemo(() => {
        const seen = new Set(items.map((item) => item.category));
        return ['all', ...Array.from(seen)];
    }, [items]);

    const visibleItems = useMemo(() => {
        const q = query.trim().toLowerCase();
        return items.filter((item) => {
            if (category !== 'all' && item.category !== category) return false;
            if (!q) return true;
            return `${item.name} ${displayName(item)} ${item.description} ${item.category}`.toLowerCase().includes(q);
        });
    }, [items, category, query]);

    const basketLines = useMemo(() => Object.entries(basket)
        .map(([id, entry]) => {
            const item = itemsById.get(id);
            if (!item) return null;
            return { ...item, quantity: entry.quantity, comment: entry.comment || '' };
        })
        .filter(Boolean), [basket, itemsById]);

    const totals = useMemo(() => computeRequestTotals(basketLines, event), [basketLines, event]);
    const basketCount = basketLines.reduce((sum, line) => sum + line.quantity, 0);
    const currency = event?.currency || 'BHD';

    const setQuantity = useCallback((id, quantity) => {
        setBasket((prev) => {
            const next = { ...prev };
            const cap = maxQuantity(itemsById.get(id));
            const qty = Math.max(0, Math.min(cap, Number.parseInt(quantity, 10) || 0));
            if (qty === 0) {
                delete next[id];
            } else {
                next[id] = { ...(prev[id] || {}), quantity: qty };
            }
            return next;
        });
    }, [itemsById]);

    const addItem = useCallback((item) => {
        const cap = maxQuantity(item);
        const current = basket[item.id]?.quantity || 0;
        if (current >= cap) {
            showToast(`Only ${cap} available for ${displayName(item)}`);
            return;
        }
        setBasket((prev) => {
            const inBasket = prev[item.id]?.quantity || 0;
            return { ...prev, [item.id]: { ...(prev[item.id] || {}), quantity: Math.min(cap, inBasket + 1) } };
        });
        showToast(`${displayName(item)} added to your request`);
    }, [basket, showToast]);

    const setComment = useCallback((id, comment) => {
        setBasket((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], comment } } : prev));
    }, []);

    const handleFormChange = (field) => (eventOrValue) => {
        const value = eventOrValue?.target ? eventOrValue.target.value : eventOrValue;
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    async function submitRequest(e) {
        e.preventDefault();
        setSubmitError('');
        if (basketLines.length === 0) {
            setSubmitError('Add at least one item to your request first.');
            return;
        }
        if (!form.company.trim() || !form.name.trim()) {
            setSubmitError('Please enter your company name and a contact person.');
            return;
        }
        if (!form.email.trim() && !form.phone.trim()) {
            setSubmitError('Please provide an email address or a phone number.');
            return;
        }

        setSubmitting(true);
        try {
            const response = await fetch(`/api/events/${encodeURIComponent(slug)}/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company: form.company,
                    contact: {
                        name: form.name,
                        email: form.email,
                        phone: form.phone,
                        stand: form.stand,
                        notes: form.notes,
                    },
                    items: basketLines.map((line) => ({
                        id: line.id,
                        quantity: line.quantity,
                        comment: line.comment,
                    })),
                }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data?.error || 'We could not send your request. Please try again.');
            }
            setResult({ request: data.request, warning: data.warning });
            setBasket({});
            setShowForm(false);
            setBasketOpen(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (error) {
            setSubmitError(error.message || 'We could not send your request. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }

    /**
     * Download the request form as a PDF in the Pico quotation layout.
     * `stored` is a submitted request (success screen); otherwise the current
     * basket and form details are sent as a draft.
     */
    async function downloadRequestForm(stored = null) {
        setSubmitError('');
        const lines = stored ? stored.items : basketLines;
        if (!lines || lines.length === 0) {
            setSubmitError('Add at least one item to your request first.');
            return;
        }
        setDownloading(true);
        try {
            const payload = stored ? {
                reference: stored.reference,
                company: stored.company,
                contact: stored.contact,
                items: stored.items.map((line) => ({ id: line.id, quantity: line.quantity, comment: line.comment })),
            } : {
                company: form.company,
                contact: { name: form.name, email: form.email, phone: form.phone, stand: form.stand, notes: form.notes },
                items: lines.map((line) => ({ id: line.id, quantity: line.quantity, comment: line.comment })),
            };
            const response = await fetch(`/api/events/${encodeURIComponent(slug)}/request-form`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data?.error || 'Could not generate the request form.');
            }
            const blob = await response.blob();
            const disposition = response.headers.get('content-disposition') || '';
            const match = disposition.match(/filename="([^"]+)"/);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = match ? match[1] : `${slug}-request-form.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            setSubmitError(error.message || 'Could not generate the request form.');
        } finally {
            setDownloading(false);
        }
    }

    const dateRange = event ? formatDateRange(event.startDate, event.endDate) : '';
    const isOpen = event?.status === 'open';

    return (
        <div className={`evm-page${narrow ? ' evm-narrow' : ''}`}>
            <header className="evm-topbar">
                <div className="evm-topbar-inner">
                    <a href="/" className="evm-brand" aria-label="Pico">
                        <img src="/branding/pico-logo.png" alt="Pico" />
                    </a>
                    <div className="evm-topbar-title">
                        <span className="evm-eyebrow">Event marketplace</span>
                        <strong>{event?.name || 'Pico event'}</strong>
                    </div>
                    {isOpen && !result && (
                        <button
                            type="button"
                            className={`evm-basket-btn${basketCount > 0 ? ' has-items' : ''}`}
                            onClick={() => setBasketOpen(true)}
                        >
                            <span>Your request</span>
                            <span className="evm-basket-count">{basketCount}</span>
                        </button>
                    )}
                </div>
            </header>

            {loading ? (
                <div className="evm-loading"><div className="spinner" /></div>
            ) : loadError ? (
                <div className="evm-container">
                    <div className="evm-notice error">{loadError}</div>
                </div>
            ) : result ? (
                <SuccessPanel
                    event={event}
                    result={result}
                    currency={currency}
                    downloading={downloading}
                    downloadError={submitError}
                    onDownload={() => downloadRequestForm(result.request)}
                    onNewRequest={() => { setSubmitError(''); setResult(null); }}
                />
            ) : (
                <>
                    <section className="evm-hero" style={event?.heroImage ? { backgroundImage: `linear-gradient(180deg, rgba(11,17,32,0.55), rgba(11,17,32,0.96)), url(${event.heroImage})` } : undefined}>
                        <div className="evm-container">
                            <span className="evm-hero-badge">{event.days}-day event{dateRange ? ` · ${dateRange}` : ''}</span>
                            <h1>{event.name}</h1>
                            {event.tagline && <p className="evm-hero-tagline">{event.tagline}</p>}
                            <div className="evm-hero-meta">
                                {event.venue && <span>📍 {event.venue}</span>}
                                <span>💳 Prices shown are for the full {event.days}-day event</span>
                                <span>🧾 VAT {event.vatPercent}% added at checkout</span>
                            </div>
                        </div>
                    </section>

                    <main className="evm-container evm-main">
                        {!isOpen ? (
                            <div className="evm-notice">
                                {event.status === 'closed'
                                    ? 'Requests for this event are now closed. Please contact our team for late requirements.'
                                    : 'The event catalogue is being prepared. Please check back soon.'}
                                {event.contactEmail && (
                                    <div style={{ marginTop: '0.5rem' }}>
                                        <a href={`mailto:${event.contactEmail}`}>{event.contactEmail}</a>
                                        {event.contactPhone ? ` · ${event.contactPhone}` : ''}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="evm-layout">
                                <div className="evm-catalogue">
                                    {event.description && <p className="evm-intro">{event.description}</p>}

                                    <div className="evm-filters">
                                        <input
                                            type="search"
                                            className="evm-search"
                                            placeholder="Search items…"
                                            value={query}
                                            onChange={(e) => setQuery(e.target.value)}
                                        />
                                        <div className="evm-chips">
                                            {categories.map((value) => (
                                                <button
                                                    key={value}
                                                    type="button"
                                                    className={`evm-chip${category === value ? ' active' : ''}`}
                                                    onClick={() => setCategory(value)}
                                                >
                                                    {categoryLabel(value)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {items.length === 0 ? (
                                        <div className="evm-notice">The catalogue for this event is being finalised. Please check back shortly.</div>
                                    ) : visibleItems.length === 0 ? (
                                        <div className="evm-notice">No items match your search.</div>
                                    ) : (
                                        <div className="evm-grid">
                                            {visibleItems.map((item) => (
                                                <ItemCard
                                                    key={item.id}
                                                    item={item}
                                                    days={event.days}
                                                    currency={currency}
                                                    quantity={basket[item.id]?.quantity || 0}
                                                    onAdd={() => addItem(item)}
                                                    onQuantity={(qty) => setQuantity(item.id, qty)}
                                                />
                                            ))}
                                        </div>
                                    )}

                                    {event.paymentTerms && (
                                        <section className="evm-terms">
                                            <h3>Pricing & payment</h3>
                                            <p>{event.paymentTerms}</p>
                                        </section>
                                    )}
                                </div>

                                <aside className={`evm-summary${basketOpen ? ' open' : ''}`}>
                                    <div className="evm-summary-head">
                                        <h2>Your request</h2>
                                        <button type="button" className="evm-summary-close" onClick={() => setBasketOpen(false)} aria-label="Close">×</button>
                                    </div>

                                    {basketLines.length === 0 ? (
                                        <p className="evm-summary-empty">Add items from the catalogue to see how much you would pay for the {event.days}-day event.</p>
                                    ) : (
                                        <>
                                            <ul className="evm-lines">
                                                {totals.lines.map((line) => (
                                                    <li key={line.id} className="evm-line">
                                                        <div className="evm-line-main">
                                                            <div className="evm-line-name">{displayName(line)}</div>
                                                            <div className="evm-line-price">
                                                                {line.eventPrice > 0 ? `${formatMoney(line.eventPrice, currency)} each` : 'Price on request'}
                                                            </div>
                                                            <input
                                                                className="evm-line-comment"
                                                                placeholder="Note for this item (optional)"
                                                                value={line.comment}
                                                                onChange={(e) => setComment(line.id, e.target.value)}
                                                            />
                                                        </div>
                                                        <div className="evm-line-side">
                                                            <div className="evm-qty">
                                                                <button type="button" onClick={() => setQuantity(line.id, line.quantity - 1)} aria-label="Decrease">−</button>
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    value={line.quantity}
                                                                    onChange={(e) => setQuantity(line.id, e.target.value)}
                                                                />
                                                                <button type="button" onClick={() => setQuantity(line.id, line.quantity + 1)} disabled={line.quantity >= maxQuantity(line)} aria-label="Increase">+</button>
                                                            </div>
                                                            <div className="evm-line-total">
                                                                {line.eventPrice > 0 ? formatMoney(line.lineTotal, currency) : '—'}
                                                            </div>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>

                                            <div className="evm-totals">
                                                <div><span>Subtotal ({event.days} days)</span><span>{formatMoney(totals.subtotal, currency)}</span></div>
                                                <div><span>VAT {totals.vatPercent}%</span><span>{formatMoney(totals.vatAmount, currency)}</span></div>
                                                <div className="evm-total-row"><span>Total to pay</span><span>{formatMoney(totals.total, currency)}</span></div>
                                                {totals.hasPriceOnRequest && (
                                                    <p className="evm-totals-note">Some items are priced on request. Our team will confirm their price in your quotation.</p>
                                                )}
                                            </div>

                                            {!showForm ? (
                                                <button type="button" className="evm-cta" onClick={() => setShowForm(true)}>
                                                    Request these items
                                                </button>
                                            ) : (
                                                <form className="evm-form" onSubmit={submitRequest}>
                                                    <h3>Your details</h3>
                                                    {submitError && <div className="evm-notice error small">{submitError}</div>}
                                                    <label>
                                                        <span>Company name *</span>
                                                        <input value={form.company} onChange={handleFormChange('company')} placeholder="Company / brand" required />
                                                    </label>
                                                    <label>
                                                        <span>Contact person *</span>
                                                        <input value={form.name} onChange={handleFormChange('name')} placeholder="Full name" required />
                                                    </label>
                                                    <div className="evm-form-row">
                                                        <label>
                                                            <span>Email</span>
                                                            <input type="email" value={form.email} onChange={handleFormChange('email')} placeholder="name@company.com" />
                                                        </label>
                                                        <label>
                                                            <span>Phone</span>
                                                            <input value={form.phone} onChange={handleFormChange('phone')} placeholder="+973 …" />
                                                        </label>
                                                    </div>
                                                    <label>
                                                        <span>Stand / display location</span>
                                                        <input value={form.stand} onChange={handleFormChange('stand')} placeholder="e.g. Display area B, stand 12" />
                                                    </label>
                                                    <label>
                                                        <span>Notes</span>
                                                        <textarea rows={3} value={form.notes} onChange={handleFormChange('notes')} placeholder="Delivery timing, branding, colours, anything else we should know" />
                                                    </label>
                                                    <button type="submit" className="evm-cta" disabled={submitting || downloading}>
                                                        {submitting ? 'Sending…' : `Send request · ${formatMoney(totals.total, currency)}`}
                                                    </button>
                                                    <button type="button" className="evm-cta secondary" disabled={submitting || downloading} onClick={() => downloadRequestForm()}>
                                                        {downloading ? 'Preparing PDF…' : 'Download request form (PDF)'}
                                                    </button>
                                                    <p className="evm-form-hint">The PDF lists your items with pictures and prices in the Pico quotation layout. You can send it to your team before submitting.</p>
                                                    <button type="button" className="evm-link-btn" onClick={() => setShowForm(false)}>Back to items</button>
                                                </form>
                                            )}
                                        </>
                                    )}
                                </aside>
                            </div>
                        )}
                    </main>

                    {isOpen && basketCount > 0 && !basketOpen && (
                        <button type="button" className="evm-mobile-bar" onClick={() => setBasketOpen(true)}>
                            <span>{basketCount} item{basketCount === 1 ? '' : 's'} · {formatMoney(totals.total, currency)} incl. VAT</span>
                            <strong>Review request →</strong>
                        </button>
                    )}
                </>
            )}

            <footer className="evm-footer">
                <div className="evm-container">
                    <strong>Pico International (Bahrain)</strong>
                    <span>
                        {event?.contactPhone && <a href={`tel:${event.contactPhone.replace(/\s+/g, '')}`}>{event.contactPhone}</a>}
                        {event?.contactPhone && event?.contactEmail && ' · '}
                        {event?.contactEmail && <a href={`mailto:${event.contactEmail}`}>{event.contactEmail}</a>}
                    </span>
                    <span>© {new Date().getFullYear()} Pico International (Bahrain). Total Brand Activation.</span>
                </div>
            </footer>

            {toast && <div className="evm-toast">{toast}</div>}
        </div>
    );
}

function ItemCard({ item, days, currency, quantity, onAdd, onQuantity }) {
    const [open, setOpen] = useState(false);
    const name = displayName(item);
    // A fixed event price (e.g. partner catalogue items) is not a day rate × days.
    const perDay = item.hasOverride ? null : item.perDayPrice;
    const soldOut = item.stock === 0 || item.inStock === false;
    const cap = maxQuantity(item);
    const photos = itemPhotos(item);

    return (
        <article className={`evm-card${quantity > 0 ? ' selected' : ''}`}>
            <button type="button" className="evm-card-media" onClick={() => setOpen(true)} aria-label={`View ${name}`}>
                {item.image ? (
                    <img src={item.image} alt={name} loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                ) : (
                    <div className="evm-card-placeholder">Pico</div>
                )}
                {quantity > 0 && <span className="evm-card-flag">{quantity} in request</span>}
                {photos.length > 1 && <span className="evm-card-photos">{photos.length} photos</span>}
            </button>
            <div className="evm-card-body">
                <span className="evm-card-cat">{categoryLabel(item.category)}</span>
                <h3>{name}</h3>
                {item.note && <p className="evm-card-note">{item.note}</p>}
                {item.size && <p className="evm-card-size">Size: {item.size}</p>}
                {hasKnownStock(item) && !soldOut && <p className="evm-card-stock">{item.stock} available</p>}
                <div className="evm-card-price">
                    {item.eventPrice > 0 ? (
                        <>
                            <strong>{formatMoney(item.eventPrice, currency)}</strong>
                            <span>per unit · {days}-day event{perDay ? ` (${formatMoney(perDay, currency)}/day)` : ''}</span>
                        </>
                    ) : (
                        <strong className="muted">Price on request</strong>
                    )}
                </div>
                <div className="evm-card-actions">
                    {soldOut ? (
                        <span className="evm-soldout">Not available</span>
                    ) : quantity > 0 ? (
                        <div className="evm-qty">
                            <button type="button" onClick={() => onQuantity(quantity - 1)} aria-label="Decrease">−</button>
                            <input type="number" min={0} max={cap} value={quantity} onChange={(e) => onQuantity(e.target.value)} />
                            <button type="button" onClick={() => onQuantity(quantity + 1)} disabled={quantity >= cap} aria-label="Increase">+</button>
                        </div>
                    ) : (
                        <button type="button" className="evm-add" onClick={onAdd}>Add to request</button>
                    )}
                    <button type="button" className="evm-link-btn" onClick={() => setOpen(true)}>Details</button>
                </div>
            </div>

            {open && (
                <div className="evm-modal-overlay" onClick={() => setOpen(false)}>
                    <div className="evm-modal" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="evm-modal-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
                        <ItemGallery photos={photos} name={name} />
                        <div className="evm-modal-body">
                            <span className="evm-card-cat">{categoryLabel(item.category)}</span>
                            <h3>{name}</h3>
                            {item.source === 'catalogue' && item.name !== name && <p className="evm-modal-code">{item.name}</p>}
                            {item.description && <p>{item.description}</p>}
                            {item.note && <p className="evm-card-note">{item.note}</p>}
                            {item.size && <p className="evm-card-size">Size: {item.size}</p>}
                            {hasKnownStock(item) && !soldOut && <p className="evm-card-stock">{item.stock} available</p>}
                            <div className="evm-card-price">
                                {item.eventPrice > 0 ? (
                                    <>
                                        <strong>{formatMoney(item.eventPrice, currency)}</strong>
                                        <span>per unit for the {days}-day event{perDay ? ` · ${formatMoney(perDay, currency)} per day` : ''}</span>
                                    </>
                                ) : (
                                    <strong className="muted">Price on request</strong>
                                )}
                            </div>
                            {!soldOut && (
                                <button type="button" className="evm-add" onClick={() => { onAdd(); setOpen(false); }}>Add to request</button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </article>
    );
}

function SuccessPanel({ event, result, currency, downloading, downloadError, onDownload, onNewRequest }) {
    const request = result.request;
    return (
        <main className="evm-container evm-main">
            <div className="evm-success">
                <div className="evm-success-icon">✓</div>
                <h1>Request received</h1>
                <p>
                    Thank you, <strong>{request.company}</strong>. Our team will review availability for {event.name} and send your official quotation.
                </p>
                <div className="evm-success-ref">
                    <span>Reference</span>
                    <strong>{request.reference}</strong>
                </div>
                <table className="evm-success-table">
                    <thead>
                        <tr><th>Item</th><th>Qty</th><th>Total</th></tr>
                    </thead>
                    <tbody>
                        {request.items.map((line) => (
                            <tr key={line.id}>
                                <td>{displayName(line)}</td>
                                <td>{line.quantity}</td>
                                <td>{line.eventPrice > 0 ? formatMoney(line.lineTotal, currency) : 'On request'}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr><td colSpan={2}>Subtotal</td><td>{formatMoney(request.subtotal, currency)}</td></tr>
                        <tr><td colSpan={2}>VAT {request.vatPercent}%</td><td>{formatMoney(request.vatAmount, currency)}</td></tr>
                        <tr className="evm-success-total"><td colSpan={2}>Total to pay</td><td>{formatMoney(request.total, currency)}</td></tr>
                    </tfoot>
                </table>
                {result.warning && <div className="evm-notice small">{result.warning} Please keep your reference number.</div>}
                {downloadError && <div className="evm-notice error small">{downloadError}</div>}
                <button type="button" className="evm-cta" disabled={downloading} onClick={onDownload}>
                    {downloading ? 'Preparing PDF…' : 'Download request form (PDF)'}
                </button>
                <p className="evm-form-hint">Your request form with item pictures and prices, in the Pico quotation layout.</p>
                {event.paymentTerms && <p className="evm-success-terms">{event.paymentTerms}</p>}
                <button type="button" className="evm-cta secondary" onClick={onNewRequest}>Send another request</button>
            </div>
        </main>
    );
}
